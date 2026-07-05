import { WeatherCondition } from "../hooks/useWeather";

/**
 * Meteocons (github.com/basmilius/weather-icons, MIT license, oleh Bas Milius)
 * -- set ikon cuaca flat-illustrated gaya Apple/Google Weather, hand-animated
 * dalam format Lottie. Kita fetch file JSON-nya langsung dari CDN resmi saat
 * runtime (bukan di-bundle statis) supaya bundle JS kita tidak membengkak.
 *
 * Hanya kondisi yang slug-nya SUDAH DIKONFIRMASI benar-benar ada di CDN yang
 * dipetakan di sini. Kombinasi yang tidak yakin (misal "partly-cloudy-night"
 * polos) sengaja TIDAK dipetakan -- lebih baik fallback ke render CSS/SVG kita
 * yang sudah pasti jalan, daripada menembak URL yang belum tentu valid.
 */
const LOTTIE_ICON_SLUGS: Partial<Record<`${WeatherCondition}:${"day" | "night"}`, string>> = {
  "clear:day": "clear-day",
  "clear:night": "clear-night",
  "partly_cloudy:day": "partly-cloudy-day",
  "cloudy:day": "cloudy",
  "cloudy:night": "cloudy",
  "fog:day": "fog-day",
  "fog:night": "fog-night",
  "drizzle:day": "drizzle",
  "drizzle:night": "drizzle",
  "rain:day": "rain",
  "rain:night": "rain",
  "snow:day": "snow",
  "snow:night": "snow",
  "thunderstorm:day": "thunderstorms-day-rain",
  "thunderstorm:night": "thunderstorms-day-rain",
};

const LOTTIE_CDN_BASE = "https://cdn.meteocons.com/latest/lottie/fill";
const FETCH_TIMEOUT_MS = 6000;

/** Slug Meteocons untuk kombinasi kondisi+waktu, atau null kalau belum ada pemetaan yang dikonfirmasi (pemanggil harus fallback ke render CSS/SVG). */
export function getLottieIconSlug(condition: WeatherCondition, isDay: boolean): string | null {
  const key = `${condition}:${isDay ? "day" : "night"}` as const;
  return LOTTIE_ICON_SLUGS[key] ?? null;
}

// Cache di level module (bertahan selama sesi tab terbuka) supaya berpindah
// halaman atau toggle debug cuaca berkali-kali tidak fetch ulang JSON yang
// sama. Menyimpan Promise (bukan hasil resolved-nya) agar request yang
// berbarengan untuk slug yang sama otomatis di-dedupe.
const animationCache = new Map<string, Promise<object>>();

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Ambil data animasi Lottie untuk sebuah slug ikon Meteocons. Melempar error
 * kalau gagal (offline, CDN diblokir jaringan, timeout, atau respons tidak
 * valid) -- pemanggil (LottieWeatherIcon) WAJIB menangkapnya dan fallback ke
 * render CSS/SVG kita, bukan membiarkan UI kosong/rusak.
 */
export function fetchLottieAnimation(slug: string): Promise<object> {
  const cached = animationCache.get(slug);
  if (cached) return cached;

  const promise = (async () => {
    const response = await fetchWithTimeout(`${LOTTIE_CDN_BASE}/${slug}.json`, FETCH_TIMEOUT_MS);
    if (!response.ok) {
      throw new Error(`Meteocons CDN responded ${response.status} for "${slug}"`);
    }
    const data = await response.json();
    return data;
  })();

  // Kalau gagal, buang dari cache supaya percobaan berikutnya (misal setelah
  // koneksi kembali normal) tidak terus-menerus mengembalikan promise gagal
  // yang sama.
  promise.catch(() => animationCache.delete(slug));

  animationCache.set(slug, promise);
  return promise;
}
