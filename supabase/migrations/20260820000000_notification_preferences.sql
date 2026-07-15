-- Migration: Preferensi notifikasi per-user (toggle on/off per kategori)
-- Date: 2026-08-20
-- Description:
--   Sebelum migration ini, SEMUA jalur pengiriman notifikasi (push FCM
--   maupun Telegram) langsung kirim begitu ada trigger, tanpa ada cara
--   bagi user untuk mematikan kategori tertentu. Migration ini menambah
--   tabel preferensi + menyambungkannya ke titik-titik pengiriman yang
--   sudah ada di backend.
--
--   SENGAJA TIDAK termasuk toggle untuk "Balasan Admin Support Chat"
--   (notify_support_reply_push() di migration 20260819010000) -- itu
--   dikecualikan sesuai keputusan eksplisit, jadi channel itu tetap
--   selalu ON dan tidak disentuh di sini.
--
--   Kategori yang DI-TOGGLE (6 kolom):
--     1. push_transaction      -- push saat transaksi baru / struk tercatat
--                                  (via bot Telegram, lihat api/telegram-webhook.ts)
--     2. telegram_budget_alert -- pesan Telegram saat budget kategori
--                                  mendekati/lewat limit (api/_lib/budget.ts
--                                  dipanggil dari telegram-webhook.ts)
--     3. push_bill_reminder    -- push pengingat tagihan (secondary channel,
--                                  lihat sendFcmReminder di Edge Function)
--     4. telegram_bill_reminder-- pesan Telegram pengingat tagihan (primary
--                                  channel, dikirim oleh Edge Function
--                                  bill-reminder-notifier)
--     5. push_broadcast        -- push broadcast dari admin (termasuk
--                                  notifikasi "app_update" dari CI/CD, karena
--                                  keduanya lewat handlePushBroadcast() yang
--                                  sama di api/admin/broadcast.ts)
--     6. telegram_broadcast    -- broadcast Telegram dari admin
--
--   Desain fail-open: KALAU baris preferensi user tidak ada (belum pernah
--   membuka Settings/menyimpan), semua kategori dianggap ENABLED (default
--   TRUE di kolom + COALESCE(..., TRUE) di semua query pembaca). Ini
--   konsisten dengan pola fail-open yang sudah dipakai di project ini
--   (maintenance_feature_locks, safe_user_timezone) -- user lama TIDAK
--   tiba-tiba berhenti menerima notifikasi yang sudah mereka andalkan
--   hanya karena baris preferensi belum pernah dibuat.

-- ─────────────────────────────────────────────────────────────
-- 1. Tabel preferensi
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_notification_preferences (
  user_id                 UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  push_transaction        BOOLEAN NOT NULL DEFAULT TRUE,
  telegram_budget_alert   BOOLEAN NOT NULL DEFAULT TRUE,
  push_bill_reminder      BOOLEAN NOT NULL DEFAULT TRUE,
  telegram_bill_reminder  BOOLEAN NOT NULL DEFAULT TRUE,
  push_broadcast          BOOLEAN NOT NULL DEFAULT TRUE,
  telegram_broadcast      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_notification_preferences ENABLE ROW LEVEL SECURITY;

-- Pola sama seperti user_push_tokens: user hanya boleh baca/tulis barisnya
-- sendiri. Backend (service-role) selalu bypass RLS untuk kebutuhan kirim.
DROP POLICY IF EXISTS "Users can manage their own notification preferences" ON public.user_notification_preferences;
CREATE POLICY "Users can manage their own notification preferences"
  ON public.user_notification_preferences
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_notification_prefs_user_id
  ON public.user_notification_preferences(user_id);

-- Trigger updated_at, mengikuti pola kolom updated_at lain di project ini.
CREATE OR REPLACE FUNCTION public.touch_notification_preferences_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notification_prefs_touch_updated_at ON public.user_notification_preferences;
CREATE TRIGGER trg_notification_prefs_touch_updated_at
  BEFORE UPDATE ON public.user_notification_preferences
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_notification_preferences_updated_at();

COMMENT ON TABLE public.user_notification_preferences IS
  'Toggle on/off per kategori notifikasi (push FCM & Telegram) milik user. Baris tidak ada = semua kategori dianggap enabled (fail-open), lihat komentar migration 20260820000000.';

-- ─────────────────────────────────────────────────────────────
-- 2. get_due_bill_reminders_for_notification(): sekarang juga menyaring
--    berdasarkan telegram_bill_reminder (kalau FALSE, bill itu di-skip
--    total dari batch -- tidak dikirim Telegram maupun push turunannya),
--    dan mengembalikan kolom tambahan push_bill_reminder_enabled supaya
--    Edge Function bisa memutuskan sendiri apakah perlu memanggil channel
--    FCM sekunder untuk baris itu.
-- ─────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.get_due_bill_reminders_for_notification();

CREATE OR REPLACE FUNCTION public.get_due_bill_reminders_for_notification()
RETURNS TABLE (
    bill_id                      UUID,
    user_id                      UUID,
    chat_id                      BIGINT,
    lang                         TEXT,
    name                         TEXT,
    category_key                 TEXT,
    amount                       NUMERIC,
    next_due_date                DATE,
    days_until_due                INTEGER,
    push_bill_reminder_enabled   BOOLEAN
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    v_feature_locked BOOLEAN := FALSE;
BEGIN
    SELECT COALESCE(
        (SELECT mfl.is_locked
         FROM public.maintenance_feature_locks mfl
         JOIN public.maintenance_settings ms ON ms.id = 1
         WHERE mfl.feature_key = 'bill_reminders' AND ms.is_active = TRUE),
        FALSE
    ) INTO v_feature_locked;

    IF v_feature_locked THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT
        b.id,
        b.user_id,
        u.telegram_chat_id,
        COALESCE(u.preferred_language, 'id'),
        b.name,
        b.category_key,
        b.amount,
        nd.next_due_date,
        nd.days_until_due,
        COALESCE(np.push_bill_reminder, TRUE)
    FROM public.bill_reminders b
    JOIN public.users u ON u.id = b.user_id
    LEFT JOIN public.user_notification_preferences np ON np.user_id = b.user_id
    CROSS JOIN LATERAL (
        SELECT v.next_due_date, (v.next_due_date - v.today) AS days_until_due
        FROM (
            SELECT
                public.compute_next_due_date(
                    b.recurrence_type, b.due_day, b.due_date, b.is_paid,
                    (NOW() AT TIME ZONE public.safe_user_timezone(u.timezone))::DATE
                ) AS next_due_date,
                (NOW() AT TIME ZONE public.safe_user_timezone(u.timezone))::DATE AS today
        ) v
    ) nd
    WHERE
        b.is_paid = FALSE
        AND u.telegram_chat_id IS NOT NULL
        -- Kategori "telegram_bill_reminder" dimatikan user -> skip total dari
        -- batch (bukan cuma skip kirim Telegram-nya saja), karena push
        -- reminder ini murni turunan dari sukses-nya kirim Telegram di
        -- Edge Function (lihat sendFcmReminder, hanya dipanggil setelah
        -- sendTelegramReminder sukses).
        AND COALESCE(np.telegram_bill_reminder, TRUE) = TRUE
        AND EXTRACT(HOUR FROM (NOW() AT TIME ZONE public.safe_user_timezone(u.timezone))) = 19
        AND nd.days_until_due BETWEEN 0 AND 3
        AND NOT EXISTS (
            SELECT 1 FROM public.bill_reminder_notifications n
            WHERE n.bill_id = b.id
              AND n.due_date = nd.next_due_date
              AND n.days_until_due = nd.days_until_due
        );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_due_bill_reminders_for_notification() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_due_bill_reminders_for_notification() TO service_role;

COMMENT ON FUNCTION public.get_due_bill_reminders_for_notification IS
    'Lihat migration 20260709000000. Sejak 20260820000000: juga menyaring baris yang telegram_bill_reminder = FALSE, dan mengembalikan push_bill_reminder_enabled untuk dipakai Edge Function memutuskan channel FCM sekunder.';

-- ─────────────────────────────────────────────────────────────
-- 3. admin_get_telegram_chat_ids(): skip user yang mematikan
--    telegram_broadcast.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_get_telegram_chat_ids()
RETURNS TABLE (
  user_id      UUID,
  display_name TEXT,
  chat_id      BIGINT
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_role TEXT;
BEGIN
  SELECT role INTO v_role FROM public.users WHERE id = auth.uid();
  IF v_role NOT IN ('admin', 'owner') THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  RETURN QUERY
  SELECT u.id, u.display_name, u.telegram_chat_id
  FROM public.users u
  LEFT JOIN public.user_notification_preferences np ON np.user_id = u.id
  WHERE u.telegram_chat_id IS NOT NULL
    AND u.is_banned = FALSE
    AND COALESCE(np.telegram_broadcast, TRUE) = TRUE;
END;
$$;

COMMENT ON FUNCTION public.admin_get_telegram_chat_ids IS
  'Lihat migration 20260625000005. Sejak 20260820000000: skip user yang telegram_broadcast = FALSE di user_notification_preferences (fail-open kalau baris tidak ada).';
