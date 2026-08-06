import { VercelRequest, VercelResponse } from '@vercel/node';
import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Helper rate-limit generik dipakai oleh endpoint yang sebelumnya TIDAK
 * punya rate limit sama sekali (payment, privacy export/delete, admin
 * broadcast/backup, weather widget publik). Menggunakan RPC
 * `check_and_increment_rate_limit` (lihat migration
 * 20260902000000_generic_rate_limiting.sql) -- pola yang sama persis
 * dengan yang sudah dipakai api/parse.ts & api/receipt.ts, supaya limit
 * berlaku global lintas semua instance serverless (bukan in-memory per
 * instance yang gampang dilewati).
 *
 * Return `true` kalau request BOLEH lanjut. Kalau `false`, fungsi ini
 * SUDAH mengirim response 429 -- caller tinggal `return` tanpa melakukan
 * apapun lagi.
 */
export async function enforceRateLimit(
  supabase: SupabaseClient,
  res: VercelResponse,
  key: string,
  limit: number,
  windowSeconds: number
): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('check_and_increment_rate_limit', {
      p_key: key,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });

    if (error) {
      // Fail-open dengan log console: kalau RPC rate-limit sendiri error
      // (mis. migration belum jalan di environment tertentu), lebih baik
      // request tetap diproses daripada seluruh endpoint down karena
      // fitur proteksi tambahan ini gagal.
      console.error(`[rateLimiter] RPC error untuk key "${key}":`, error.message);
      return true;
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.allowed) {
      res.setHeader('Retry-After', String(row?.retry_after_seconds ?? windowSeconds));
      res.status(429).json({
        error: 'Terlalu banyak permintaan. Coba lagi beberapa saat lagi.',
        retry_after_seconds: row?.retry_after_seconds ?? windowSeconds,
      });
      return false;
    }

    return true;
  } catch (err) {
    console.error(`[rateLimiter] Exception untuk key "${key}":`, err);
    return true;
  }
}

/**
 * Ambil IP klien dari header yang di-set Vercel edge network. Dipakai
 * untuk rate-limit endpoint publik/tanpa-auth berdasarkan IP, bukan user
 * ID (karena belum tentu ada user yang login).
 */
export function getClientIp(req: VercelRequest): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length > 0) {
    return fwd.split(',')[0].trim();
  }
  if (Array.isArray(fwd) && fwd.length > 0) {
    return fwd[0];
  }
  const remote = (req.socket as any)?.remoteAddress;
  return remote || 'unknown';
}
