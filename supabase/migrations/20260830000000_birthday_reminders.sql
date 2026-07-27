-- Migration: Notifikasi Telegram H-1 untuk Ulang Tahun (pg_cron + Edge Function)
-- Date: 2026-08-30
-- Root cause / why:
--   users.birth_date (migration 20260829000000) sudah bisa diisi & sudah
--   ditandai di halaman Kalender (CalendarPage.tsx), tapi itu pasif -- user
--   harus buka halaman Kalender sendiri untuk sadar ulang tahunnya sudah
--   dekat. Migration ini menambah jalur proaktif via bot Telegram, H-1
--   (sehari sebelum), mengikuti arsitektur yang sama persis dengan
--   bill_reminder_notifications (migration 20260709000000) supaya
--   konsisten dengan pola yang sudah ada di project ini.
--
-- Desain:
--   - get_observed_birthday(): port SQL dari getObservedBirthday() di
--     src/lib/birthday.ts. Kalau birth_date = 29 Februari, di tahun
--     non-kabisat DIRAYAKAN 1 Maret (keputusan eksplisit user), BUKAN
--     28 Februari dan BUKAN dilewati. WAJIB disinkronkan dengan
--     src/lib/birthday.ts kalau aturan ini berubah di kemudian hari.
--   - Window kirim: HANYA H-1 (persis 1 hari sebelum tanggal yang
--     dirayakan), bukan rentang H-3..H0 seperti bill reminder -- sesuai
--     keputusan eksplisit user ("Notifikasi H-1").
--   - Jam kirim: 19:00 waktu lokal user (sama seperti bill reminder),
--     lewat pg_cron tiap jam + safe_user_timezone() yang sudah ada.
--   - Dedup: 1 baris log per (user_id, observed_date) di
--     birthday_reminder_notifications, supaya tidak dikirim dobel untuk
--     ulang tahun tahun yang sama walau cron jalan tiap jam.
--   - Hanya user yang sudah menghubungkan Telegram (telegram_chat_id
--     NOT NULL) yang menerima pesan ini -- user lain cukup mengandalkan
--     banner in-app (lihat App.tsx, getBirthdayReminderKind()), yang
--     TIDAK butuh Telegram maupun infra kirim apa pun.
--   - Menghormati maintenance_feature_locks untuk feature_key 'calendar'
--     (fitur tempat tanggal lahir & penanda ulang tahun ditampilkan),
--     fail-open kalau baris setting tidak ada -- sama seperti pola di
--     get_due_bill_reminders_for_notification().

-- ─────────────────────────────────────────────────────────────
-- 1. get_observed_birthday(): port dari getObservedBirthday() di
--    src/lib/birthday.ts.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_observed_birthday(
    p_birth_date DATE,
    p_year       INTEGER
)
RETURNS DATE
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v_month INTEGER := EXTRACT(MONTH FROM p_birth_date)::INTEGER;
    v_day   INTEGER := EXTRACT(DAY FROM p_birth_date)::INTEGER;
    v_is_leap BOOLEAN;
BEGIN
    v_is_leap := (p_year % 4 = 0 AND p_year % 100 <> 0) OR (p_year % 400 = 0);

    IF v_month = 2 AND v_day = 29 AND NOT v_is_leap THEN
        RETURN make_date(p_year, 3, 1);
    END IF;

    RETURN make_date(p_year, v_month, v_day);
END;
$$;

COMMENT ON FUNCTION public.get_observed_birthday IS
    'Port dari getObservedBirthday() di src/lib/birthday.ts. Kalau logic frontend berubah (mis. aturan pergeseran 29 Feb), WAJIB disinkronkan juga di sini.';

-- ─────────────────────────────────────────────────────────────
-- 2. Log pengiriman notifikasi (anti-duplikat per user per tahun)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.birthday_reminder_notifications (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    observed_date   DATE NOT NULL,   -- tanggal ulang tahun yang dirayakan tahun ybs.
    sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, observed_date)
);

ALTER TABLE public.birthday_reminder_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can select their own birthday reminder notifications" ON public.birthday_reminder_notifications;
CREATE POLICY "Users can select their own birthday reminder notifications"
    ON public.birthday_reminder_notifications FOR SELECT
    USING (auth.uid() = user_id);

-- Tidak ada policy INSERT/UPDATE/DELETE untuk authenticated/anon: baris ini
-- hanya pernah ditulis oleh service-role (Edge Function lewat RPC di bawah).

CREATE INDEX IF NOT EXISTS idx_birthday_reminder_notif_user_date
    ON public.birthday_reminder_notifications(user_id, observed_date);

-- ─────────────────────────────────────────────────────────────
-- 3. RPC: ambil user yang harus diingatkan SEKARANG (dipanggil Edge Function)
--    Menyaring: birth_date terisi, telegram terhubung, jam lokal user =
--    19:00, PERSIS H-1 dari tanggal yang dirayakan tahun ini (atau tahun
--    depan kalau tanggal tahun ini sudah lewat), fitur 'calendar' tidak
--    dikunci admin, belum pernah dikirim untuk (user_id, observed_date).
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_due_birthday_reminders_for_notification()
RETURNS TABLE (
    user_id        UUID,
    chat_id        BIGINT,
    lang           TEXT,
    display_name   TEXT,
    observed_date  DATE
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
         WHERE mfl.feature_key = 'calendar' AND ms.is_active = TRUE),
        FALSE
    ) INTO v_feature_locked;

    IF v_feature_locked THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT
        u.id,
        u.telegram_chat_id,
        COALESCE(u.preferred_language, 'id'),
        u.display_name,
        nd.observed_date
    FROM public.users u
    CROSS JOIN LATERAL (
        SELECT
            CASE
                WHEN public.get_observed_birthday(u.birth_date, EXTRACT(YEAR FROM v.today)::INT) >= v.today
                    THEN public.get_observed_birthday(u.birth_date, EXTRACT(YEAR FROM v.today)::INT)
                ELSE public.get_observed_birthday(u.birth_date, EXTRACT(YEAR FROM v.today)::INT + 1)
            END AS observed_date,
            v.today AS today
        FROM (
            SELECT (NOW() AT TIME ZONE public.safe_user_timezone(u.timezone))::DATE AS today
        ) v
    ) nd
    WHERE
        u.birth_date IS NOT NULL
        AND u.telegram_chat_id IS NOT NULL
        AND EXTRACT(HOUR FROM (NOW() AT TIME ZONE public.safe_user_timezone(u.timezone))) = 19
        AND (nd.observed_date - nd.today) = 1  -- persis H-1
        AND NOT EXISTS (
            SELECT 1 FROM public.birthday_reminder_notifications n
            WHERE n.user_id = u.id
              AND n.observed_date = nd.observed_date
        );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_due_birthday_reminders_for_notification() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_due_birthday_reminders_for_notification() TO service_role;

-- ─────────────────────────────────────────────────────────────
-- 4. RPC: catat bahwa notifikasi sudah dikirim (dipanggil Edge Function
--    setelah sendMessage Telegram sukses)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.log_birthday_reminder_sent(
    p_user_id UUID,
    p_observed_date DATE
)
RETURNS VOID
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO public.birthday_reminder_notifications (user_id, observed_date)
    VALUES (p_user_id, p_observed_date)
    ON CONFLICT (user_id, observed_date) DO NOTHING;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.log_birthday_reminder_sent(UUID, DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_birthday_reminder_sent(UUID, DATE) TO service_role;

-- ─────────────────────────────────────────────────────────────
-- 5. pg_cron job
--    Memakai vault secret 'service_role_key' langsung (BUKAN literal
--    placeholder) -- lihat migration 20260728000001 untuk root cause
--    kenapa placeholder literal berbahaya (job gagal 401 diam-diam).
--    Prasyarat: secret 'service_role_key' sudah ada di Supabase Vault
--    (sudah dibuat untuk job bill-reminder-notify-hourly, dipakai ulang
--    di sini).
-- ─────────────────────────────────────────────────────────────
DO $$
BEGIN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'birthday-reminder-notify-hourly';
EXCEPTION WHEN OTHERS THEN
    NULL; -- aman kalau belum pernah dijadwalkan
END $$;

SELECT cron.schedule(
    'birthday-reminder-notify-hourly',
    '0 * * * *',
    $$
    SELECT net.http_post(
        url := 'https://enzooigugdeaiqhnvims.supabase.co/functions/v1/birthday-reminder-notifier',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
        ),
        body := '{}'::jsonb
    );
    $$
);

COMMENT ON EXTENSION pg_cron IS
    'birthday-reminder-notify-hourly memanggil Edge Function birthday-reminder-notifier via net.http_post (H-1, jam 19:00 lokal user), selain job bill-reminder-notify-hourly yang sudah ada. Authorization header dari Supabase Vault (secret: service_role_key).';
