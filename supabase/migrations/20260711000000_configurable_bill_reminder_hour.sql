-- Migration: Jam reminder tagihan Telegram yang bisa diatur pengguna
-- Date: 2026-07-11
-- Root cause / why:
--   get_due_bill_reminders_for_notification() (migration 20260709000000)
--   hardcode jam 19:00 WAKTU LOKAL user untuk SEMUA user. Tidak ada cara
--   bagi user untuk memilih jam reminder yang lebih cocok dengan
--   rutinitasnya sendiri (mis. jam istirahat siang, sebelum tidur, dst).
--
-- Desain:
--   - Tambah kolom users.bill_reminder_hour (SMALLINT, default 19) yang
--     diisi user dari halaman Settings (web), bukan dari Telegram.
--   - Pilihan yang diizinkan dibatasi (CHECK) ke 5 slot yang masuk akal:
--     09:00, 12:00, 15:00, 18:00, 21:00 -- sesuai permintaan produk, supaya
--     pg_cron job tiap jam (sudah ada, tidak berubah) tetap cukup untuk
--     menangkap semua slot ini tanpa perlu jadwal baru.
--   - get_due_bill_reminders_for_notification() diubah dari
--     `EXTRACT(HOUR ...) = 19` (hardcode) menjadi
--     `EXTRACT(HOUR ...) = COALESCE(u.bill_reminder_hour, 19)` supaya user
--     lama yang belum pernah mengatur preferensi tetap fallback ke 19:00
--     (perilaku sebelumnya, tidak ada breaking change).

-- ─────────────────────────────────────────────────────────────
-- 1. Kolom preferensi jam reminder per user
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS bill_reminder_hour SMALLINT NOT NULL DEFAULT 19;

DO $$
BEGIN
    ALTER TABLE public.users
        ADD CONSTRAINT users_bill_reminder_hour_check
        CHECK (bill_reminder_hour IN (9, 12, 15, 18, 21));
EXCEPTION WHEN duplicate_object THEN
    NULL; -- idempotent re-run
END $$;

COMMENT ON COLUMN public.users.bill_reminder_hour IS
    'Jam lokal (0-23, salah satu dari 9/12/15/18/21) saat user ingin diingatkan tagihan via Telegram. Diatur dari Settings web app. Default 19 (perilaku lama sebelum kolom ini ada).';

-- ─────────────────────────────────────────────────────────────
-- 2. Update RPC: pakai bill_reminder_hour user, bukan hardcode 19
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_due_bill_reminders_for_notification()
RETURNS TABLE (
    bill_id          UUID,
    user_id          UUID,
    chat_id          BIGINT,
    lang             TEXT,
    name             TEXT,
    category_key     TEXT,
    amount           NUMERIC,
    next_due_date    DATE,
    days_until_due   INTEGER
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
        nd.days_until_due
    FROM public.bill_reminders b
    JOIN public.users u ON u.id = b.user_id
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
        -- jam lokal user sekarang persis jam yang dia pilih sendiri
        -- (fallback 19 untuk baris lama / NULL, lihat COALESCE di kolom)
        AND EXTRACT(HOUR FROM (NOW() AT TIME ZONE public.safe_user_timezone(u.timezone)))
            = COALESCE(u.bill_reminder_hour, 19)
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
    'Dipanggil oleh Edge Function supabase/functions/bill-reminder-notifier via service-role client, dijadwalkan oleh pg_cron job bill-reminder-notify-hourly. Jam kirim sekarang per-user lewat users.bill_reminder_hour (migration 20260711000000), fallback 19 kalau NULL.';
