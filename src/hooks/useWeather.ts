import { useEffect, useRef, useState } from "react";

export type WeatherCondition =
  | "clear"
  | "partly_cloudy"
  | "cloudy"
  | "fog"
  | "drizzle"
  | "rain"
  | "snow"
  | "thunderstorm";

export interface WeatherData {
  location: {
    city: string;
    region?: string;
    country?: string;
    source: "gps" | "ip";
  };
  current: {
    temperatureC: number;
    weatherCode: number;
    isDay: boolean;
    condition: WeatherCondition;
  };
  updatedAt: string;
}

interface UseWeatherResult {
  weather: WeatherData | null;
  loading: boolean;
  error: string | null;
}

const CACHE_KEY = "ewk_weather_cache_v1";
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 menit, selaras dengan Cache-Control di /api/weather

function readCache(): WeatherData | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { data: WeatherData; cachedAt: number };
    if (Date.now() - parsed.cachedAt > CACHE_TTL_MS) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

function writeCache(data: WeatherData) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ data, cachedAt: Date.now() }));
  } catch {
    // sessionStorage penuh/diblokir -- abaikan, cache hanya optimisasi
  }
}

async function fetchWeather(lat?: number, lon?: number): Promise<WeatherData> {
  const qs = lat != null && lon != null ? `?lat=${lat}&lon=${lon}` : "";
  const resp = await fetch(`/api/weather${qs}`);
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}));
    throw new Error(body?.error || "Gagal memuat data cuaca.");
  }
  return resp.json();
}

/**
 * Ambil lokasi & cuaca saat ini untuk widget dashboard.
 *
 * Alur:
 *  1. Coba geolocation browser (butuh izin user) → paling akurat.
 *  2. Kalau ditolak/timeout/tidak didukung, fallback otomatis ke IP-based
 *     location (endpoint /api/weather tanpa lat/lon akan resolve dari IP).
 *  3. Hasil di-cache di sessionStorage 10 menit supaya berpindah halaman
 *     dalam rentang waktu itu tidak memicu request baru terus-menerus.
 *
 *  4. PENTING: lokasi & cuaca di-refresh OTOMATIS setiap 10 menit selama
 *     komponen ini tetap ter-mount (mis. Dashboard dibiarkan terbuka lama),
 *     dan juga saat tab/app kembali aktif (Page Visibility) setelah lama
 *     di-background -- supaya kalau user berpindah tempat sementara app
 *     tetap terbuka, lokasi ikut ter-update tanpa perlu reload halaman.
 *     (Versi sebelumnya cuma fetch SEKALI seumur hidup komponen -- itu
 *     sebabnya lokasi terasa "macet" di tempat pertama.)
 */
export function useWeather(): UseWeatherResult {
  const [weather, setWeather] = useState<WeatherData | null>(() => readCache());
  const [loading, setLoading] = useState<boolean>(() => readCache() === null);
  const [error, setError] = useState<string | null>(null);

  const lastFetchedAt = useRef<number>(0);
  const inFlight = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const finish = (data: WeatherData) => {
      if (cancelled) return;
      writeCache(data);
      lastFetchedAt.current = Date.now();
      setWeather(data);
      setLoading(false);
      setError(null);
    };

    const fail = (message: string) => {
      if (cancelled) return;
      setError(message);
      setLoading(false);
    };

    const fallbackToIp = (previousError?: Error) => {
      if (previousError) {
        console.warn(`[useWeather] GPS fetch failed, trying IP-based location:`, previousError.message);
      }
      return fetchWeather()
        .then(finish)
        .catch((err) => {
          const msg = err.message || "Gagal memuat data cuaca.";
          console.error(`[useWeather] IP-based weather fetch also failed:`, msg);
          fail(msg);
        });
    };

    /**
     * Minta lokasi + cuaca terbaru. `forceFreshGps` = true dipakai untuk
     * refresh periodik/visibility -- maximumAge di-set 0 supaya browser
     * benar-benar minta posisi GPS baru (bukan reuse posisi lama), karena
     * tujuan refresh ini justru untuk mendeteksi kalau user sudah pindah.
     */
    const requestLocationAndWeather = (forceFreshGps: boolean) => {
      if (inFlight.current) return;
      inFlight.current = true;

      const done = () => {
        inFlight.current = false;
      };

      if (!("geolocation" in navigator)) {
        console.warn("[useWeather] Geolocation not supported in navigator, using IP-based fallback");
        fallbackToIp().finally(done);
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          console.log(`[useWeather] GPS location obtained: ${pos.coords.latitude}, ${pos.coords.longitude}`);
          fetchWeather(pos.coords.latitude, pos.coords.longitude)
            .then(finish)
            .catch((err) => {
              console.warn(`[useWeather] GPS-based weather fetch failed:`, err.message);
              return fallbackToIp(err);
            })
            .finally(done);
        },
        (geoError) => {
          // Izin ditolak, timeout, atau posisi tidak tersedia -> fallback IP
          const geoMsg = geoError.code === 1 ? "Izin geolocation ditolak" : geoError.message || "Geolocation timeout/unavailable";
          console.warn(`[useWeather] Geolocation error: ${geoMsg}, falling back to IP`, geoError);
          fallbackToIp().finally(done);
        },
        { enableHighAccuracy: false, timeout: 8000, maximumAge: forceFreshGps ? 0 : 10 * 60 * 1000 }
      );
    };

    // Mount pertama: pakai cache kalau masih segar (biar tidak ada delay
    // loading tiap pindah halaman), baru minta lokasi asli kalau cache
    // sudah basi/belum ada sama sekali.
    const cached = readCache();
    if (cached) {
      setWeather(cached);
      setLoading(false);
      lastFetchedAt.current = Date.now();
    } else {
      requestLocationAndWeather(false);
    }

    // Refresh otomatis tiap CACHE_TTL_MS selama komponen tetap ter-mount --
    // inilah fix utamanya, supaya lokasi tidak "macet" selamanya di fetch
    // pertama kalau Dashboard dibiarkan terbuka lama.
    const intervalId = setInterval(() => {
      requestLocationAndWeather(true);
    }, CACHE_TTL_MS);

    // Refresh tambahan saat app/tab kembali aktif (mis. user switch app lalu
    // balik lagi) kalau data terakhir sudah lebih tua dari TTL -- berguna di
    // mobile PWA di mana tab jarang benar-benar di-reload.
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible" && Date.now() - lastFetchedAt.current > CACHE_TTL_MS) {
        requestLocationAndWeather(true);
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  return { weather, loading, error };
}
