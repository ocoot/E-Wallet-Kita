import type { SupabaseClient } from "@supabase/supabase-js";

export type ErrorLevel = "error" | "warning" | "info";

interface LogErrorParams {
  source: string;               // e.g. "telegram-webhook", "parse-transaction"
  level?: ErrorLevel;           // default: "error"
  message: string;
  context?: Record<string, unknown>;
  userId?: string | null;
  traceId?: string | null;
}

/**
 * Catat satu event ke tabel `error_logs` supaya muncul di
 * Admin Panel > Monitor Error.
 *
 * SENGAJA soft-fail: kalau insert log ini gagal (mis. network blip ke
 * Supabase), request ASLI yang sedang ditangani tidak boleh ikut gagal
 * hanya gara-gara logging-nya gagal. Karena itu fungsi ini tidak pernah
 * `throw` -- selalu tertelan dan cuma dicatat ke console sebagai fallback.
 *
 * Dipanggil dengan `supabaseBackend` (service_role client) yang sudah ada
 * di tiap Vercel function, bukan lewat endpoint baru -- supaya tidak
 * menambah jumlah serverless function (project ini sudah dekat limit di
 * Vercel Hobby plan).
 */
export async function logError(
  supabase: SupabaseClient,
  { source, level = "error", message, context, userId, traceId }: LogErrorParams
): Promise<void> {
  try {
    await supabase.from("error_logs").insert({
      source,
      level,
      message: message.slice(0, 2000),
      context: context ?? null,
      user_id: userId ?? null,
      trace_id: traceId ?? null,
    });
  } catch (err) {
    console.error("[errorLogger] Gagal mencatat error log (soft-fail, request asli tetap lanjut):", err);
  }
}
