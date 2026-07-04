import { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * GET /api/weather?lat=..&lon=..
 *
 * Endpoint tunggal untuk widget cuaca dinamis di Dashboard.
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed. Gunakan GET.' });
  }

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

    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,is_day&timezone=auto`;
    const weatherResp = await fetchWithTimeout(weatherUrl, { headers: { 'User-Agent': 'e-wallet-kita-app/1.0' } }, 6000);
    if (!weatherResp.ok) throw new Error(`open-meteo responded ${weatherResp.status}`);
    const weatherData = await weatherResp.json();
    const current = weatherData.current;

    // Cache di edge/CDN 10 menit -- cukup "real-time" untuk widget dashboard,
    // tapi menghindari pemborosan kuota API gratis kalau user buka-tutup app.
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=300');

    return res.status(200).json({
      location,
      current: {
        temperatureC: Math.round(current.temperature_2m),
        weatherCode: current.weather_code,
        isDay: current.is_day === 1,
        condition: mapWeatherCode(current.weather_code),
      },
      updatedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    const errMsg = err?.message || String(err);
    console.error('[api/weather] error:', errMsg);
    
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
