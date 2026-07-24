import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { reportFrontendError } from "../lib/errorReporter";

/**
 * Kategori notifikasi yang bisa di-toggle di Settings. SENGAJA TIDAK
 * termasuk "Balasan Admin Support Chat" -- channel itu dikecualikan dari
 * fitur ini dan tetap selalu ON (lihat trigger notify_support_reply_push()
 * di migration 20260819010000, tidak diubah oleh preferensi ini).
 */
export interface NotificationPreferences {
  push_transaction: boolean;
  telegram_budget_alert: boolean;
  push_bill_reminder: boolean;
  telegram_bill_reminder: boolean;
  push_broadcast: boolean;
  telegram_broadcast: boolean;
}

export type NotificationPreferenceKey = keyof NotificationPreferences;

// Sama seperti fail-open di backend (lihat api/_lib/notificationPreferences.ts):
// kalau user belum pernah menyimpan baris preferensi, semua kategori
// dianggap enabled.
const DEFAULT_PREFERENCES: NotificationPreferences = {
  push_transaction: true,
  telegram_budget_alert: true,
  push_bill_reminder: true,
  telegram_bill_reminder: true,
  push_broadcast: true,
  telegram_broadcast: true,
};

/**
 * Baca & ubah preferensi notifikasi user yang sedang login. Mengikuti pola
 * RLS "user hanya boleh baca/tulis barisnya sendiri" yang sama seperti
 * user_push_tokens (lihat migration 20260820000000_notification_preferences.sql).
 *
 * Update per-toggle bersifat optimistic (UI langsung berubah), lalu di-upsert
 * ke DB di background -- kalau upsert gagal, state di-rollback ke nilai
 * sebelumnya supaya UI tidak "berbohong" soal preferensi yang tersimpan.
 */
export function useNotificationPreferences(userId: string | undefined) {
  const [preferences, setPreferences] = useState<NotificationPreferences>(DEFAULT_PREFERENCES);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<NotificationPreferenceKey | null>(null);

  const load = useCallback(async () => {
    if (!userId) {
      setPreferences(DEFAULT_PREFERENCES);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("user_notification_preferences")
        .select("push_transaction, telegram_budget_alert, push_bill_reminder, telegram_bill_reminder, push_broadcast, telegram_broadcast")
        .eq("user_id", userId)
        .maybeSingle();

      if (error) {
        console.error("useNotificationPreferences load error:", error);
        void reportFrontendError({
          source: "frontend:settings-notification",
          message: error.message,
          context: { fn: "useNotificationPreferences.load" },
        });
        setPreferences(DEFAULT_PREFERENCES);
      } else if (data) {
        setPreferences({ ...DEFAULT_PREFERENCES, ...data });
      } else {
        // Belum ada baris -- fail-open, semua dianggap enabled sampai user
        // pertama kali men-toggle sesuatu (baru saat itu baris dibuat).
        setPreferences(DEFAULT_PREFERENCES);
      }
    } catch (err) {
      console.error("useNotificationPreferences load exception:", err);
      void reportFrontendError({
        source: "frontend:settings-notification",
        message: err instanceof Error ? err.message : String(err),
        context: { fn: "useNotificationPreferences.load" },
      });
      setPreferences(DEFAULT_PREFERENCES);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const setPreference = useCallback(
    async (key: NotificationPreferenceKey, value: boolean): Promise<boolean> => {
      if (!userId) return false;

      const previous = preferences[key];
      setSavingKey(key);
      setPreferences((prev) => ({ ...prev, [key]: value }));

      try {
        const { error } = await supabase
          .from("user_notification_preferences")
          .upsert(
            { user_id: userId, [key]: value },
            { onConflict: "user_id" }
          );

        if (error) throw error;
        return true;
      } catch (err) {
        console.error(`useNotificationPreferences setPreference(${key}) error:`, err);
        void reportFrontendError({
          source: "frontend:settings-notification",
          message: err instanceof Error ? err.message : String(err),
          context: { fn: "useNotificationPreferences.setPreference", key, value },
        });
        // Rollback -- jangan biarkan UI menampilkan status yang sebenarnya
        // gagal tersimpan.
        setPreferences((prev) => ({ ...prev, [key]: previous }));
        return false;
      } finally {
        setSavingKey(null);
      }
    },
    [userId, preferences]
  );

  return { preferences, loading, savingKey, setPreference };
}
