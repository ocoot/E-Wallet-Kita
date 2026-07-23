import { supabase } from "./supabase";

type FrontendErrorSource =
  | "frontend:react-boundary"
  | "frontend:unhandled-rejection"
  | "frontend:runtime"
  | "frontend:resource"
  // ── Ditambahkan supaya error di fitur-fitur inti (bukan cuma crash
  // render/promise yang lolos) juga tercatat -- lihat withErrorReporting
  // di bawah. Tambah entri baru di sini kalau mau cover fitur lain.
  | "frontend:transaction"
  | "frontend:pdf-export"
  | "frontend:premium-receipt"
  | "frontend:wallet";

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

/**
 * Pembungkus generik supaya catch block di tiap fitur (transaksi, export
 * PDF, struk premium, wallet, dll) TIDAK perlu manual memanggil
 * `reportFrontendError` + menyusun `context` (stack, dsb) satu-satu.
 *
 * PENTING: fungsi ini SENGAJA melempar ulang (`throw`) error aslinya
 * setelah melaporkannya. Ini BUKAN pengganti try/catch yang sudah ada di
 * tiap view -- toast, audioFeedback, setState, `finally` untuk
 * mematikan loading, dll di layar tetap jalan seperti biasa. Cukup
 * bungkus badan async yang mau dipantau dengan fungsi ini di DALAM
 * try block yang sudah ada:
 *
 *   try {
 *     await withErrorReporting("frontend:transaction", async () => {
 *       ...logika asli...
 *     });
 *   } catch {
 *     showToast(...); // tidak berubah
 *   } finally {
 *     setIsLoading(false); // tidak berubah
 *   }
 *
 * `context` opsional berguna untuk menambahkan info spesifik fitur (mis.
 * walletId, orderId) yang membantu triase di Admin Panel > Monitor Error.
 */
export async function withErrorReporting<T>(
  source: FrontendErrorSource,
  fn: () => Promise<T>,
  context?: Record<string, unknown>
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    void reportFrontendError({
      source,
      message: err instanceof Error ? err.message : String(err),
      context: {
        ...context,
        stack: err instanceof Error ? err.stack?.slice(0, 1500) : null,
      },
    });
    throw err; // rethrow -- catch block asli di caller tetap yang menentukan UX
  }
}
