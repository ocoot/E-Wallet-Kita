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
 *     tidak memicu request baru terus-menerus.
 */
export function useWeather(): UseWeatherResult {
  const [weather, setWeather] = useState<WeatherData | null>(() => readCache());
  const [loading, setLoading] = useState<boolean>(() => readCache() === null);
  const [error, setError] = useState<string | null>(null);
  const hasFetched = useRef(false);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;

    const cached = readCache();
    if (cached) {
      setWeather(cached);
      setLoading(false);
      return;
    }

    let cancelled = false;

    const finish = (data: WeatherData) => {
      if (cancelled) return;
      writeCache(data);
      setWeather(data);
      setLoading(false);
      setError(null);
    };

    const fail = (message: string) => {
      if (cancelled) return;
      setError(message);
      setLoading(false);
    };

    const fallbackToIp = () => {
      fetchWeather()
        .then(finish)
        .catch((err) => fail(err.message || "Gagal memuat data cuaca."));
    };

    if (!("geolocation" in navigator)) {
      fallbackToIp();
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        fetchWeather(pos.coords.latitude, pos.coords.longitude)
          .then(finish)
          .catch(() => fallbackToIp());
      },
      () => {
        // Izin ditolak, timeout, atau posisi tidak tersedia -> fallback IP
        fallbackToIp();
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 10 * 60 * 1000 }
    );

    return () => {
      cancelled = true;
    };
  }, []);

  return { weather, loading, error };
}
