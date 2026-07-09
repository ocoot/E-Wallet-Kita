import { supabase } from "./supabase";

type FrontendErrorSource =
  | "frontend:react-boundary"
  | "frontend:unhandled-rejection"
  | "frontend:runtime"
  | "frontend:resource";

interface ReportFrontendErrorParams {
  source: FrontendErrorSource;
  message: string;
  context?: Record<string, unknown>;
}

// Dedupe sederhana in-memory: error yang sama persis (source+message) dalam
// 60 detik terakhir tidak dikirim ulang. Mencegah satu render loop / satu
// promise yang gagal berulang membanjiri error_logs sebelum sempat kena
// rate limit di DB (lihat migration 20260805000000_frontend_error_capture.sql).
const recentlyReported = new Map<string, number>();
const DEDUPE_WINDOW_MS = 60_000;

function shouldSkipDuplicate(key: string): boolean {
  const last = recentlyReported.get(key);
  const now = Date.now();
  if (last && now - last < DEDUPE_WINDOW_MS) return true;
  recentlyReported.set(key, now);
  return false;
}

/**
 * Kirim satu event error frontend ke tabel `error_logs` supaya muncul di
 * Admin Panel > Monitor Error, ditandai dengan source "frontend:*".
 *
 * Soft-fail total: kalau pengiriman log ini sendiri gagal (mis. offline,
 * RLS reject, rate limit kena), JANGAN pernah throw -- UX pengguna tidak
 * boleh terganggu gara-gara laporan error gagal terkirim.
 */
export async function reportFrontendError({
  source,
  message,
  context,
}: ReportFrontendErrorParams): Promise<void> {
  try {
    const dedupeKey = `${source}::${message.slice(0, 200)}`;
    if (shouldSkipDuplicate(dedupeKey)) return;

    const { data: { user } } = await supabase.auth.getUser();
    // Belum login (mis. crash di halaman auth) -- tidak bisa dicatat karena
    // RLS policy mewajibkan user_id = auth.uid(). Biarkan saja, cukup
    // console.error di local dev.
    if (!user) return;

    await supabase.from("error_logs").insert({
      source,
      level: "error",
      message: message.slice(0, 2000),
      user_id: user.id,
      context: {
        ...context,
        url: typeof window !== "undefined" ? window.location.href : null,
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : null,
      },
    });
  } catch (err) {
    console.error("[errorReporter] Gagal mengirim frontend error log (soft-fail):", err);
  }
}
