/**
 * Helper untuk membaca preferensi notifikasi per-user (lihat migration
 * 20260820000000_notification_preferences.sql) dari kode backend Node/Vercel
 * (api/telegram-webhook.ts, api/admin/broadcast.ts, dst).
 *
 * Fail-open by design: kalau baris preferensi tidak ada (user belum pernah
 * membuka Settings) ATAU query-nya sendiri gagal (mis. tabel belum ke-deploy
 * di suatu environment), kategori dianggap ENABLED. Ini konsisten dengan
 * pola fail-open lain di project ini (maintenance feature lock,
 * safe_user_timezone) -- kegagalan di jalur preferensi TIDAK BOLEH jadi
 * alasan user berhenti menerima notifikasi yang sudah mereka andalkan.
 *
 * CATATAN: kategori "Balasan Admin Support Chat" SENGAJA tidak ada di sini
 * -- channel itu dikecualikan dari fitur toggle, tetap selalu ON (lihat
 * notify_support_reply_push() di migration 20260819010000, tidak diubah).
 */

import { logError } from "./errorLogger.js";

export type NotificationPreferenceKey =
  | "push_transaction"
  | "telegram_budget_alert"
  | "push_bill_reminder"
  | "telegram_bill_reminder"
  | "push_broadcast"
  | "telegram_broadcast";

export interface NotificationPreferences {
  push_transaction: boolean;
  telegram_budget_alert: boolean;
  push_bill_reminder: boolean;
  telegram_bill_reminder: boolean;
  push_broadcast: boolean;
  telegram_broadcast: boolean;
}

const ALL_ENABLED: NotificationPreferences = {
  push_transaction: true,
  telegram_budget_alert: true,
  push_bill_reminder: true,
  telegram_bill_reminder: true,
  push_broadcast: true,
  telegram_broadcast: true,
};

/**
 * Ambil satu preferensi untuk satu user. `supabaseBackend` harus berupa
 * client service-role (bypass RLS) -- sama seperti pola pemanggil
 * sendPushNotificationToUser lainnya.
 */
export async function isNotificationEnabled(
  supabaseBackend: any,
  userId: string,
  key: NotificationPreferenceKey
): Promise<boolean> {
  try {
    const { data, error } = await supabaseBackend
      .from("user_notification_preferences")
      .select(key)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.warn(`[notificationPreferences] Gagal baca preferensi (${key}), fail-open ke true:`, error.message);
      void logError(supabaseBackend, {
        source: "notification-preferences",
        level: "warning",
        message: error.message,
        userId,
        context: { fn: "isNotificationEnabled", key },
      });
      return ALL_ENABLED[key];
    }
    if (!data) return ALL_ENABLED[key];

    const value = (data as Record<string, unknown>)[key];
    return typeof value === "boolean" ? value : ALL_ENABLED[key];
  } catch (err) {
    console.warn(`[notificationPreferences] Exception baca preferensi (${key}), fail-open ke true:`, err);
    void logError(supabaseBackend, {
      source: "notification-preferences",
      level: "warning",
      message: err instanceof Error ? err.message : String(err),
      userId,
      context: { fn: "isNotificationEnabled", key },
    });
    return ALL_ENABLED[key];
  }
}

/**
 * Ambil set user_id yang MEMATIKAN satu kategori tertentu -- dipakai untuk
 * memfilter daftar penerima broadcast (mis. push_broadcast) tanpa perlu
 * query per-user satu-satu. Baris yang tidak ada di tabel preferensi TIDAK
 * masuk ke set ini (fail-open: dianggap enabled / tetap jadi penerima).
 */
export async function getUsersWithDisabledPreference(
  supabaseBackend: any,
  key: NotificationPreferenceKey
): Promise<Set<string>> {
  try {
    const { data, error } = await supabaseBackend
      .from("user_notification_preferences")
      .select("user_id")
      .eq(key, false);

    if (error) {
      console.warn(`[notificationPreferences] Gagal ambil daftar disabled (${key}), fail-open (tidak ada yang di-skip):`, error.message);
      void logError(supabaseBackend, {
        source: "notification-preferences",
        level: "warning",
        message: error.message,
        context: { fn: "getUsersWithDisabledPreference", key },
      });
      return new Set();
    }
    return new Set((data || []).map((row: { user_id: string }) => row.user_id));
  } catch (err) {
    console.warn(`[notificationPreferences] Exception ambil daftar disabled (${key}), fail-open:`, err);
    void logError(supabaseBackend, {
      source: "notification-preferences",
      level: "warning",
      message: err instanceof Error ? err.message : String(err),
      context: { fn: "getUsersWithDisabledPreference", key },
    });
    return new Set();
  }
}
