import { next, ipAddress } from '@vercel/functions';

/**
 * Vercel Routing Middleware -- lapisan pertama sebelum request menyentuh
 * rewrite SPA (vercel.json) atau serverless function manapun.
 *
 * CATATAN: project ini pakai Vite (bukan Next.js), jadi middleware ini
 * SENGAJA memakai `@vercel/functions` (helper resmi Vercel untuk project
 * non-Next.js) -- BUKAN `next/server`, yang tidak ter-install di project
 * ini dan hanya berlaku untuk aplikasi Next.js.
 *
 * KENAPA DI SINI (bukan di dalam masing-masing api/*.ts):
 *   1. Routing Middleware TIDAK dihitung ke limit 12 serverless function
 *      di Vercel Hobby plan -- ini mekanisme terpisah yang jalan di Edge
 *      Runtime SEBELUM function manapun dipanggil.
 *   2. Sebelumnya, path seperti /.env, /wp-admin/, /phpinfo.php selalu
 *      dijawab 200 OK berisi index.html karena rule catch-all SPA di
 *      vercel.json ("/(.*)" -> "/index.html"). Itu SEBENARNYA aman (tidak
 *      ada file asli yang bocor), tapi scanner otomatis salah baca ini
 *      sebagai "file ditemukan". Middleware ini mencegat path semacam itu
 *      DULU dan menjawab 403/404 langsung -- lebih jujur secara HTTP
 *      semantic DAN otomatis membersihkan noise di laporan security scan
 *      berikutnya.
 *
 * ARSITEKTUR IP-BLOCK (karena serverless/edge itu stateless):
 *   - Daftar IP yang sedang diblokir di-cache di module-level Set, dengan
 *     TTL pendek (30 detik), supaya TIDAK query DB di setiap request
 *     normal -- cukup 1 query setiap ~30 detik per edge-instance yang aktif.
 *   - Cache ini best-effort, BUKAN sumber kebenaran satu-satunya: tiap
 *     edge region/instance bisa punya cache-nya sendiri (khas arsitektur
 *     edge terdistribusi Vercel), jadi ada jeda singkat sebelum ban 100%
 *     efektif di semua region. Untuk kebutuhan anti-abuse (bukan
 *     pertahanan real-time terhadap serangan yang sangat presisi), ini
 *     cukup -- dan tetap jauh lebih baik daripada tanpa proteksi apapun.
 *   - Request ke path yang "mencurigakan" (lihat SUSPICIOUS_PATH_PATTERNS)
 *     DICATAT ke security_events lewat RPC log_and_maybe_autoban_ip, yang
 *     otomatis mem-ban IP kalau sudah >= 5 kejadian mencurigakan dalam 10
 *     menit terakhir (lihat migration 20260903000000_ip_security_system.sql
 *     untuk threshold persisnya).
 */

export const config = {
  runtime: 'edge' as const,
  // Jalan di semua path KECUALI asset statis yang jelas legit (JS/CSS/
  // gambar/font hasil build) supaya tidak menambah latency ke aset yang
  // sudah pasti aman dan sering di-fetch.
  matcher: [
    '/((?!assets/|.*\\.(?:js|css|png|jpg|jpeg|svg|ico|webp|webmanifest|json)$).*)',
  ],
};

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Pola path yang TIDAK PERNAH menjadi bagian sah dari aplikasi ini (SPA
// React + serverless functions di /api/*) -- kemunculannya nyaris selalu
// berarti scanner/bot otomatis sedang meraba-raba endpoint umum yang
// rentan di CMS/stack lain (WordPress, PHP, .git, credential files, dst).
const SUSPICIOUS_PATH_PATTERNS: RegExp[] = [
  /^\/\.env/i,
  /^\/\.git/i,
  /^\/\.aws/i,
  /^\/\.htaccess/i,
  /^\/\.htpasswd/i,
  /^\/\.ssh/i,
  /^\/wp-admin/i,
  /^\/wp-login/i,
  /^\/wp-content/i,
  /^\/wp-includes/i,
  /^\/xmlrpc\.php/i,
  /^\/phpinfo\.php/i,
  /^\/php\.ini/i,
  /\.php$/i,
  /^\/server-status/i,
  /^\/backup\.(zip|sql|tar|gz)$/i,
  /^\/(dump|database)\.sql$/i,
  /^\/config\.(json|yml|yaml|php|ini)$/i,
  /^\/\.well-known\/(?!acme-challenge)/i, // /.well-known/acme-challenge itu legit (Let's Encrypt)
  /^\/admin\/(login|config)?\.php/i,
  /^\/vendor\/phpunit/i,
  /^\/cgi-bin/i,
  /\betc\/passwd\b/i,
  /\.\.[\/\\]/,              // path traversal
  /<script[\s>]/i,           // XSS probe di query/path
  /\bunion\s+select\b/i,     // SQL injection probe
  /\bselect\b.+\bfrom\b.+--/i,
];

// Path publik yang SAH dan wajib tetap boleh diakses tanpa dicek --
// terutama /api/* itu sendiri (endpoint aplikasi asli, jangan sampai
// tertangkap pola generik di atas).
function isKnownSafePath(pathname: string): boolean {
  return pathname.startsWith('/api/');
}

// ── Cache in-memory sederhana (per edge-instance, best-effort) ──────────
let blockedIpCache: Set<string> = new Set();
let cacheLastFetched = 0;
const CACHE_TTL_MS = 30_000;

async function getBlockedIpSet(): Promise<Set<string>> {
  const now = Date.now();
  if (now - cacheLastFetched < CACHE_TTL_MS) {
    return blockedIpCache;
  }
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return blockedIpCache;

  try {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/list_active_blocked_ips`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
    });
    if (resp.ok) {
      const rows = (await resp.json()) as Array<{ ip: string }>;
      blockedIpCache = new Set(rows.map((r) => r.ip));
      cacheLastFetched = now;
    }
  } catch (err) {
    // Fail-open: kalau Supabase tidak terjangkau, jangan sampai SELURUH
    // situs down gara-gara fitur proteksi tambahan ini gagal. Cache lama
    // (kalau ada) tetap dipakai sampai fetch berikutnya berhasil.
    console.error('[middleware] Gagal fetch blocked IP list:', err);
  }
  return blockedIpCache;
}

async function logAndMaybeAutoban(
  ip: string,
  path: string,
  method: string,
  eventType: 'suspicious_path' | 'blocked_request',
  userAgent: string | null
): Promise<boolean> {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return false;
  try {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/log_and_maybe_autoban_ip`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        p_ip: ip,
        p_path: path,
        p_method: method,
        p_event_type: eventType,
        p_user_agent: userAgent,
      }),
    });
    if (!resp.ok) return false;
    const rows = (await resp.json()) as Array<{ banned: boolean }>;
    return rows?.[0]?.banned === true;
  } catch (err) {
    console.error('[middleware] Gagal log security event:', err);
    return false;
  }
}

export default async function middleware(request: Request) {
  const url = new URL(request.url);
  const { pathname, search } = url;
  // Helper resmi Vercel (@vercel/functions) untuk baca IP klien dari
  // header edge network -- lebih andal daripada parsing x-forwarded-for
  // manual karena mengikuti konvensi Vercel apa adanya (termasuk kalau
  // formatnya berubah di masa depan).
  const ip = ipAddress(request) || 'unknown';
  const method = request.method;
  const userAgent = request.headers.get('user-agent');

  // ── 1. IP sudah diblokir? Tolak langsung, tidak perlu cek apapun lagi. ──
  const blockedSet = await getBlockedIpSet();
  if (blockedSet.has(ip)) {
    // Tetap dicatat (tanpa menunggu selesai) supaya dashboard Security
    // Monitor menunjukkan aktivitas IP yang sudah diban tapi masih
    // mencoba akses.
    void logAndMaybeAutoban(ip, pathname, method, 'blocked_request', userAgent);
    return new Response('Forbidden', { status: 403 });
  }

  // ── 2. Path/query mencurigakan? Tolak + catat (bisa memicu auto-ban). ──
  if (!isKnownSafePath(pathname)) {
    const fullTarget = pathname + search;
    const isSuspicious = SUSPICIOUS_PATH_PATTERNS.some((re) => re.test(fullTarget));
    if (isSuspicious) {
      const nowBanned = await logAndMaybeAutoban(ip, pathname, method, 'suspicious_path', userAgent);
      return new Response(nowBanned ? 'Forbidden' : 'Not Found', {
        status: nowBanned ? 403 : 404,
      });
    }
  }

  // Tidak ada temuan -- lanjutkan ke rewrite/handler normal.
  return next();
}
