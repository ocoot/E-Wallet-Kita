import { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { logError } from './_lib/errorLogger.js';
import { enforceRateLimit } from './_lib/rateLimiter.js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

/**
 * GET /api/utils?type=health
 * GET /api/utils?type=weather&lat=..&lon=..
 *
 * Endpoint gabungan untuk dua utility publik yang tidak butuh auth:
 *   - health check (dulu: api/health.ts)
 *   - widget cuaca dinamis di Dashboard (dulu: api/weather.ts)
 * Digabung supaya tidak menambah jumlah serverless function di Vercel
 * Hobby plan (limit 12 function/project).
 *
 * Kenapa perlu endpoint backend (bukan langsung fetch dari client)?
 *   - Kalau user menolak izin geolocation browser, kita perlu fallback
 *     ke IP-based geolocation. IP publik user paling akurat dibaca dari
 *     header request di server (x-forwarded-for), bukan dari browser.
 *   - Menyatukan 2 panggilan pihak ketiga (reverse-geocoding + cuaca)
 *     jadi 1 response bersih untuk frontend, dan hasilnya di-cache di
 *     edge (s-maxage) supaya tidak spam provider gratis tsb.
 *
 * Provider dipakai (semua gratis, tanpa API key):
 *   - BigDataCloud reverse-geocode-client -> nama kota dari lat/lon
 *   - ipapi.co -> lokasi perkiraan dari IP (fallback saat lat/lon kosong)
 *   - Open-Meteo -> data cuaca saat ini
 *
 * Response di-cache 10 menit (s-maxage=600) per kombinasi query karena
 * cuaca tidak berubah signifikan tiap detik dan ketiga provider di atas
 * punya rate limit pada tier gratisnya.
 */

/**
 * Fetch wrapper with explicit timeout -- Vercel runtime sering timeout
 * saat reach external APIs tanpa timeout eksplisit. Default fetch() tidak
 * punya timeout di Node.js kecuali AbortController di-setup.
 *
 * Timeout 6s lebih reasonable untuk Vercel daripada 3s -- beberapa region
 * atau kondisi network memang butuh lebih lama dari 3s.
 */
async function fetchWithTimeout(url: string, options?: RequestInit, timeoutMs: number = 6000): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return resp;
  } finally {
    clearTimeout(timeoutId);
  }
}

type WeatherCondition =
  | 'clear'
  | 'partly_cloudy'
  | 'cloudy'
  | 'fog'
  | 'drizzle'
  | 'rain'
  | 'snow'
  | 'thunderstorm';

export interface WeatherData {
  location: {
    city: string;
    source: 'geolocation' | 'ip';
  };
  current: {
    temperatureC: number;
    weatherCode: number;
    isDay: boolean;
    condition: WeatherCondition;
    // v0.67.0: level intensitas untuk scene native (0-3 hujan, 0-2 salju, 0-1 pasir).
    rainLevel: number;
    snowLevel: number;
    sandLevel: number;
  };
  updatedAt: string;
}

/**
 * Fallback cuaca default kalau semua API gagal -- setidaknya widget cuaca
 * tidak blank/error di dashboard, hanya "data tidak tersedia" tapi cukup
 * inform user apa yang terjadi.
 */
function getFallbackWeather(): WeatherData {
  return {
    location: {
      city: "Lokasi tidak dapat diakses",
      source: "ip",
    },
    current: {
      temperatureC: 0,
      weatherCode: 3, // cloudy fallback
      isDay: true,
      condition: "cloudy",
      rainLevel: 1,
      snowLevel: 1,
      sandLevel: 0,
    },
    updatedAt: new Date().toISOString(),
  };
}

interface ResolvedLocation {
  city: string;
  region?: string;
  country?: string;
  source: 'gps' | 'ip';
}

// Kode cuaca WMO (dipakai Open-Meteo) -> kategori yang kita pakai di UI.
// Referensi: https://open-meteo.com/en/docs (WMO Weather interpretation codes)
function mapWeatherCode(code: number): WeatherCondition {
  if (code === 0) return 'clear';
  if (code === 1 || code === 2) return 'partly_cloudy';
  if (code === 3) return 'cloudy';
  if (code === 45 || code === 48) return 'fog';
  if ([51, 53, 55, 56, 57].includes(code)) return 'drizzle';
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'rain';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'snow';
  if ([95, 96, 99].includes(code)) return 'thunderstorm';
  return 'cloudy';
}

// Level intensitas untuk scene cuaca native (v0.67.0).
// Open-Meteo `precipitation` (current) = curah hujan mm pada langkah waktu
// berjalan (efektif mm/jam); `snowfall` (current) = cm pada langkah berjalan.
// Ambang hujan disetel untuk hujan tropis Indonesia (badai 10+ mm/jam itu
// lazim), bukan ambang lintang sedang (>50 mm/jam = "violent") yang membuat
// level XL hampir tidak pernah tercapai di aplikasi.
function mapRainLevel(condition: WeatherCondition, precipitationMm: number): number {
  if (condition === 'thunderstorm') return 3; // badai = paling deras
  if (condition === 'drizzle') return 0; // gerimis = paling ringan
  if (condition !== 'rain') return 1; // bukan hujan: tidak dipakai scene
  if (!Number.isFinite(precipitationMm)) return 1; // data hilang -> default M
  if (precipitationMm < 1) return 0; // S: <1 mm/jam
  if (precipitationMm < 4) return 1; // M: 1-4 mm/jam
  if (precipitationMm < 10) return 2; // L: 4-10 mm/jam
  return 3; // XL: >10 mm/jam
}

function mapSnowLevel(condition: WeatherCondition, snowfallCm: number): number {
  if (condition !== 'snow') return 1; // bukan salju: tidak dipakai scene
  if (!Number.isFinite(snowfallCm)) return 1; // data hilang -> default M
  if (snowfallCm < 0.5) return 0; // S: <0,5 cm/jam
  if (snowfallCm < 2) return 1; // M: 0,5-2 cm/jam
  return 2; // L: >2 cm/jam
}

// Pasir: Open-Meteo forecast API tidak menyediakan data debu/pasir
// (butuh CAMS air-quality API yang belum tersambung) -> selalu default S.
function mapSandLevel(): number {
  return 0;
}

function getClientIp(req: VercelRequest): string | null {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length > 0) {
    return fwd.split(',')[0].trim();
  }
  if (Array.isArray(fwd) && fwd.length > 0) {
    return fwd[0];
  }
  const remote = (req.socket as any)?.remoteAddress;
  return remote || null;
}

async function resolveByIp(ip: string | null): Promise<{ lat: number; lon: number } & ResolvedLocation> {
  // ipapi.co menerima IP kosong (pakai IP request itu sendiri) sebagai fallback
  // terakhir -- berguna saat dev lokal di mana x-forwarded-for tidak ada.
  const isPrivateIp = !ip || /^(127\.|10\.|192\.168\.|::1)/.test(ip);
  const url = isPrivateIp ? 'https://ipapi.co/json/' : `https://ipapi.co/${ip}/json/`;

  let lastError: any;
  // Retry 2x untuk ipapi.co dengan exponential backoff (500ms, 1000ms)
  // karena sering timeout di Vercel. Timeout 8s (lebih generous untuk geo lookup).
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const resp = await fetchWithTimeout(url, { headers: { 'User-Agent': 'e-wallet-kita-app/1.0' } }, 8000);
      if (!resp.ok) throw new Error(`ipapi.co responded ${resp.status}`);
      const data = await resp.json();
      if (data.error) throw new Error(data.reason || 'ipapi.co lookup error');

      return {
        lat: data.latitude,
        lon: data.longitude,
        city: data.city || 'Lokasi tidak diketahui',
        region: data.region,
        country: data.country_name,
        source: 'ip',
      };
    } catch (err) {
      lastError = err;
      console.warn(`[api/weather] ipapi.co attempt ${attempt}/2 failed:`, err?.message);
      if (attempt < 2) {
        const backoffMs = attempt === 1 ? 500 : 1000; // exponential: 500ms, 1000ms
        await new Promise(r => setTimeout(r, backoffMs));
      }
    }
  }
  throw lastError;
}

async function reverseGeocode(lat: number, lon: number): Promise<ResolvedLocation> {
  const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=id`;
  try {
    const resp = await fetchWithTimeout(url, { headers: { 'User-Agent': 'e-wallet-kita-app/1.0' } }, 6000);
    if (!resp.ok) throw new Error(`bigdatacloud responded ${resp.status}`);
    const data = await resp.json();

    return {
      city: data.city || data.locality || data.principalSubdivision || 'Lokasi Anda',
      region: data.principalSubdivision,
      country: data.countryName,
      source: 'gps',
    };
  } catch (err) {
    console.warn(`[api/weather] reverseGeocode failed (non-fatal):`, err?.message);
    // Reverse geocode adalah optional -- kalau gagal, fallback ke generic location name
    throw err;
  }
}

function handleHealth(req: VercelRequest, res: VercelResponse) {
  return res.status(200).json({ status: 'ok', mode: process.env.NODE_ENV || 'development' });
}

async function handleWeather(req: VercelRequest, res: VercelResponse) {
  // Endpoint ini publik (tanpa auth) dan memanggil 2-3 API pihak ketiga
  // gratis per request -- tanpa limit, bisa dipakai untuk membebani kuota
  // gratis provider tsb atau sebagai vektor DoS murah. Dibatasi per-IP
  // (bukan per-user) karena memang tidak ada user yang login di jalur ini.
  const clientIp = getClientIp(req) || 'unknown';
  const allowedWeather = await enforceRateLimit(supabase, res, `weather:${clientIp}`, 20, 60);
  if (!allowedWeather) return;

  try {
    const latParam = req.query.lat;
    const lonParam = req.query.lon;
    const hasCoords =
      typeof latParam === 'string' && typeof lonParam === 'string' && latParam !== '' && lonParam !== '';

    let lat: number;
    let lon: number;
    let location: ResolvedLocation;

    if (hasCoords) {
      lat = parseFloat(latParam as string);
      lon = parseFloat(lonParam as string);
      if (Number.isNaN(lat) || Number.isNaN(lon)) {
        return res.status(400).json({ error: 'Parameter lat/lon tidak valid.' });
      }

      // Reverse-geocode boleh gagal tanpa menggagalkan seluruh response --
      // cuaca tetap lebih berguna daripada error total, tapi nama kota fallback.
      const geo = await reverseGeocode(lat, lon).catch(() => null);
      location = geo ?? { city: 'Lokasi Anda', source: 'gps' };
    } else {
      const ip = getClientIp(req);
      const ipLoc = await resolveByIp(ip);
      lat = ipLoc.lat;
      lon = ipLoc.lon;
      location = {
        city: ipLoc.city,
        region: ipLoc.region,
        country: ipLoc.country,
        source: 'ip',
      };
    }

    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,is_day,precipitation,snowfall&timezone=auto`;
    const weatherResp = await fetchWithTimeout(weatherUrl, { headers: { 'User-Agent': 'e-wallet-kita-app/1.0' } }, 6000);
    if (!weatherResp.ok) throw new Error(`open-meteo responded ${weatherResp.status}`);
    const weatherData = await weatherResp.json();
    const current = weatherData.current;

    // PENTING: cache di edge/CDN HANYA untuk cabang GPS (hasCoords). URL-nya
    // punya lat/lon presisi tinggi jadi cache key otomatis unik per lokasi
    // nyata, aman di-cache 10 menit.
    //
    // Cabang IP-based (tanpa lat/lon) TIDAK BOLEH di-cache di CDN: URL-nya
    // sama persis untuk SEMUA user yang fallback ke IP (tidak ada query
    // pembeda), padahal hasilnya beda-beda tergantung IP client. Kalau
    // di-cache, user A bisa saja disajikan lokasi hasil resolve IP milik
    // user B yang lebih dulu hit edge node yang sama -- ini juga akar
    // penyebab lokasi terasa "macet"/salah karena geolocation browser
    // sempat diblokir oleh Permissions-Policy sehingga SELALU fallback ke
    // cabang IP ini.
    if (hasCoords) {
      res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=300');
    } else {
      res.setHeader('Cache-Control', 'private, no-store');
    }

    const condition = mapWeatherCode(current.weather_code);
    return res.status(200).json({
      location,
      current: {
        temperatureC: Math.round(current.temperature_2m),
        weatherCode: current.weather_code,
        isDay: current.is_day === 1,
        condition,
        rainLevel: mapRainLevel(condition, current.precipitation),
        snowLevel: mapSnowLevel(condition, current.snowfall),
        sandLevel: mapSandLevel(),
      },
      updatedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    const errMsg = err?.message || String(err);
    console.error('[api/weather] error:', errMsg);
    await logError(supabase, {
      source: "weather",
      level: "warning",
      message: `Weather widget fallback ke data statis: ${errMsg}`,
    });

    // Graceful degradation: return fallback data instead of 502 error
    // sehingga widget cuaca tetap tampil dengan "data tidak tersedia" dibanding
    // blank/error. Ini lebih baik UX-wise daripada hard failure.
    const fallback = getFallbackWeather();
    res.setHeader('Cache-Control', 's-maxage=60'); // cache fallback hanya 1 menit
    return res.status(200).json({
      ...fallback,
      _error: errMsg, // debug info untuk inspect error di frontend (optional)
    });
  }
}

/**
 * GET /api/utils?type=holidays&country=ID&year=2026
 *
 * Endpoint hari libur nasional -- dipanggil dari CalendarPage & event
 * overlay Dashboard (lihat src/api/eventCalendar.ts). SEBELUMNYA fetch ini
 * dilakukan langsung dari browser ke API pihak ketiga (api-harilibur,
 * Nager.Date), dan itu menyebabkan bug: browser mem-block request karena
 * api-harilibur.vercel.app (dan mirror-nya) tidak mengirim header
 * `Access-Control-Allow-Origin`, jadi fetch selalu gagal dengan CORS error
 * lalu diam-diam fallback ke Nager.Date -- yang TIDAK punya data Maulid
 * Nabi untuk Indonesia. Hasilnya: kalender cuma nampilin 1 dari 2 hari
 * libur Agustus 2026.
 *
 * Fix: pindahkan fetch ke server. Panggilan server-ke-server tidak kena
 * CORS sama sekali (CORS cuma aturan browser), jadi lebih reliable.
 *
 * Sumber (untuk country=ID):
 *   1. api-harilibur (kresnasatya) -- 3 mirror dicoba berurutan.
 *   2. Nager.Date -- fallback kedua.
 * Untuk negara lain: langsung Nager.Date.
 *
 * Response di-cache lama di edge (6 jam, stale-while-revalidate 1 hari)
 * karena hari libur nasional praktis tidak pernah berubah dalam jangka
 * pendek.
 */

interface RawHoliday {
  date: string;
  localName: string;
  name: string;
  countryCode: string;
  global: boolean;
  types: string[];
}

const HARILIBUR_MIRRORS = [
  'https://api-harilibur.vercel.app/api',
  'https://api-harilibur.pages.dev/api',
  'https://api-harilibur.netlify.app/api',
];

async function fetchIndonesiaHolidaysServer(year: number): Promise<RawHoliday[]> {
  let lastError: any;
  for (const baseUrl of HARILIBUR_MIRRORS) {
    try {
      const resp = await fetchWithTimeout(
        `${baseUrl}?year=${year}`,
        { headers: { 'User-Agent': 'e-wallet-kita-app/1.0' } },
        6000
      );
      if (!resp.ok) throw new Error(`${baseUrl} responded ${resp.status}`);
      const data = await resp.json();
      if (!Array.isArray(data)) throw new Error(`${baseUrl} format tidak dikenali`);
      return data
        .filter((h: any) => h.is_national_holiday)
        .map((h: any) => ({
          date: h.holiday_date,
          localName: h.holiday_name,
          name: h.holiday_name,
          countryCode: 'ID',
          global: true,
          types: ['Public'],
        }));
    } catch (err: any) {
      lastError = err;
      console.warn(`[api/holidays] Mirror gagal (${baseUrl}):`, err?.message);
    }
  }
  throw lastError ?? new Error('Semua mirror api-harilibur gagal');
}

async function fetchNagerHolidays(countryCode: string, year: number): Promise<RawHoliday[]> {
  const resp = await fetchWithTimeout(
    `https://date.nager.at/api/v3/publicholidays/${year}/${countryCode}`,
    { headers: { 'User-Agent': 'e-wallet-kita-app/1.0' } },
    6000
  );
  if (!resp.ok) throw new Error(`Nager.Date responded ${resp.status}`);
  return resp.json();
}

async function handleHolidays(req: VercelRequest, res: VercelResponse) {
  // Endpoint publik tanpa auth, panggil API pihak ketiga -- rate limit
  // per-IP seperti cabang weather di atas.
  const clientIp = getClientIp(req) || 'unknown';
  const allowedHolidays = await enforceRateLimit(supabase, res, `holidays:${clientIp}`, 30, 60);
  if (!allowedHolidays) return;

  const countryCode = typeof req.query.country === 'string' ? req.query.country.toUpperCase() : 'ID';
  const yearParam = req.query.year;
  const year =
    typeof yearParam === 'string' && /^\d{4}$/.test(yearParam)
      ? parseInt(yearParam, 10)
      : new Date().getFullYear();

  try {
    let holidays: RawHoliday[];
    let source: string;

    if (countryCode === 'ID') {
      try {
        holidays = await fetchIndonesiaHolidaysServer(year);
        source = 'api-harilibur';
      } catch (err: any) {
        console.warn('[api/holidays] api-harilibur gagal total, coba Nager.Date:', err?.message);
        holidays = await fetchNagerHolidays(countryCode, year);
        source = 'nager';
      }
    } else {
      holidays = await fetchNagerHolidays(countryCode, year);
      source = 'nager';
    }

    res.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate=86400');
    return res.status(200).json({ countryCode, year, source, holidays });
  } catch (err: any) {
    const errMsg = err?.message || String(err);
    console.error('[api/holidays] error:', errMsg);
    await logError(supabase, {
      source: 'holidays',
      level: 'warning',
      message: `Gagal fetch hari libur ${countryCode}/${year}, frontend akan pakai fallback statis: ${errMsg}`,
    });
    // 200 dengan array kosong (bukan 500) -- frontend (eventCalendar.ts)
    // tahu cara fallback ke data statis kalau holidays kosong.
    res.setHeader('Cache-Control', 's-maxage=60');
    return res.status(200).json({ countryCode, year, source: 'error', holidays: [], _error: errMsg });
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed. Gunakan GET.' });
  }

  const type = req.query.type;

  if (type === 'health') {
    return handleHealth(req, res);
  }
  if (type === 'weather') {
    return handleWeather(req, res);
  }
  if (type === 'holidays') {
    return handleHolidays(req, res);
  }
  return res.status(400).json({ error: 'Parameter type wajib diisi: "health", "weather", atau "holidays".' });
}
