-- Migration: Notifikasi Telegram untuk Bill Reminders (pg_cron + Edge Function)
-- Date: 2026-07-09
-- Root cause / why:
--   bill_reminders (migrasi 20260708000000) baru bisa dilihat di web app;
--   tidak ada mekanisme proaktif yang mengingatkan user lewat Telegram saat
--   tagihan mendekati/jatuh tempo, padahal bot Telegram sudah jadi kanal
--   utama interaksi cepat untuk fitur lain (parse transaksi, receipt OCR).
--
-- Desain:
--   - pg_cron HANYA scheduler ringan: 1 job tiap jam memanggil Edge Function
--     `bill-reminder-notifier` lewat pg_net (semua logic kirim ada di Edge
--     Function, bukan di sini) + 1 job tanggal 1 tiap bulan yang memanggil
--     RPC reset langsung lewat SQL (tidak butuh Telegram, jadi tidak perlu
--     lewat Edge Function).
--   - Kenapa cron tiap jam (bukan tiap hari)? Reminder dikirim jam 19:00
--     WAKTU LOKAL masing-masing user (users.timezone), bukan jam server.
--     Karena pg_cron cuma punya 1 jadwal global, job jalan tiap jam dan
--     RPC `get_due_bill_reminders_for_notification` sendiri yang menyaring
--     baris mana yang "jam lokalnya sedang jam 19:00 sekarang".
--   - compute_next_due_date(): port 1:1 dari logic computeNextDueDate() di
--     src/hooks/useBillReminders.ts, supaya tanggal jatuh tempo & urgency
--     yang dihitung backend selalu identik dengan yang ditampilkan di web.
--     INI SUMBER KEBENARAN BARU untuk perhitungan jatuh tempo — kalau nanti
--     ada perubahan logic di useBillReminders.ts, fungsi SQL ini WAJIB
--     disinkronkan juga (lihat catatan drift ala §6 di master prompt).
--   - Window kirim: H-3, H-2, H-1, H+0 (4 hari kirim setiap hari menjelang
--     & saat jatuh tempo), tidak mengirim lagi setelah lewat (overdue tidak
--     di-reminder ulang lewat jalur ini, sudah ada badge "Terlewat" di web).
--   - Dedup: 1 baris log per (bill_id, untuk_tanggal) di
--     bill_reminder_notifications, supaya restart/duplikat invocation cron
--     tidak mengirim pesan dobel untuk siklus jatuh tempo yang sama.
--   - Reset is_paid: HANYA recurrence_type 'monthly' dan 'yearly' (sesuai
--     keputusan eksplisit user), 'one_time' TIDAK PERNAH direset otomatis.
--     Monthly direset tiap tanggal 1 (siklus baru tiap bulan). Yearly
--     direset pada tanggal 1 di bulan SETELAH bulan jatuh tempo bill itu
--     (mengikuti compute_next_due_date: begitu due date lewat & unpaid,
--     next due date sudah roll ke tahun depan -- reset is_paid mengikuti
--     titik roll yang sama, bukan serentak 1 Januari untuk semua bill).
--   - Tombol "Tandai Lunas" di bot Telegram: RPC mark_bill_paid_via_bot
--     dipanggil dari callback_query handler di api/telegram-webhook.ts
--     (lihat update di file itu), supaya user tidak perlu buka web app.

-- ─────────────────────────────────────────────────────────────
-- 0. Extensions yang dibutuhkan (idempotent)
-- ─────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ─────────────────────────────────────────────────────────────
-- 1. compute_next_due_date(): port dari useBillReminders.ts
--    Mengembalikan (next_due_date, days_until_due) untuk SATU bill,
--    dievaluasi relatif ke p_today (tanggal, bukan timestamp, supaya
--    pemanggil bisa pass tanggal lokal user, bukan tanggal server).
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.compute_next_due_date(
    p_recurrence_type TEXT,
    p_due_day         INTEGER,
    p_due_date        DATE,
    p_is_paid         BOOLEAN,
    p_today           DATE
)
RETURNS DATE
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v_candidate DATE;
BEGIN
    IF p_recurrence_type = 'monthly' AND p_due_day IS NOT NULL THEN
        -- PENTING: sengaja TIDAK di-clamp ke akhir bulan. useBillReminders.ts
        -- pakai `new Date(year, month, due_day)` di JS, yang overflow ke bulan
        -- berikutnya kalau due_day > jumlah hari di bulan itu (mis. due_day=31
        -- di bulan Februari -> otomatis jadi 2-3 Maret). Pakai date_trunc +
        -- offset hari (bukan make_date/LEAST) supaya overflow-nya identik
        -- dengan perilaku JS Date di atas, bukan di-clamp ke akhir bulan.
        v_candidate := (date_trunc('month', p_today)::DATE + (p_due_day - 1));
        IF v_candidate < p_today AND NOT p_is_paid THEN
            v_candidate := ((date_trunc('month', p_today) + INTERVAL '1 month')::DATE + (p_due_day - 1));
        END IF;
        RETURN v_candidate;
    END IF;

    IF p_recurrence_type = 'yearly' AND p_due_date IS NOT NULL THEN
        -- Sama prinsipnya: replikasi `new Date(year, base.getMonth(), base.getDate())`
        -- yang overflow (bukan error/clamp) kalau tanggalnya tidak ada di tahun
        -- tsb (mis. due_date 29 Feb pada tahun bukan kabisat -> overflow ke 1 Mar).
        -- Dibangun dari 1 Jan tahun target + offset (bulan-1) + (hari-1) supaya
        -- tidak pernah RAISE error seperti make_date(y, 2, 29) akan lakukan.
        v_candidate := (
            make_date(EXTRACT(YEAR FROM p_today)::INT, 1, 1)
            + (EXTRACT(MONTH FROM p_due_date)::INT - 1) * INTERVAL '1 month'
            + (EXTRACT(DAY FROM p_due_date)::INT - 1) * INTERVAL '1 day'
        )::DATE;
        IF v_candidate < p_today AND NOT p_is_paid THEN
            v_candidate := (
                make_date(EXTRACT(YEAR FROM p_today)::INT + 1, 1, 1)
                + (EXTRACT(MONTH FROM p_due_date)::INT - 1) * INTERVAL '1 month'
                + (EXTRACT(DAY FROM p_due_date)::INT - 1) * INTERVAL '1 day'
            )::DATE;
        END IF;
        RETURN v_candidate;
    END IF;

    -- one_time
    RETURN p_due_date;
END;
$$;

COMMENT ON FUNCTION public.compute_next_due_date IS
    'Port dari computeNextDueDate() di src/hooks/useBillReminders.ts. Jika logic frontend berubah, sinkronkan juga fungsi ini (lihat migration 20260709000000).';

-- ─────────────────────────────────────────────────────────────
-- 1b. Helper: validasi nama timezone IANA dengan aman.
--    users.timezone diisi otomatis dari Intl.DateTimeFormat() di browser
--    (lihat src/contexts/AuthContext.tsx) sehingga seharusnya selalu valid,
--    tapi kolom ini bebas teks tanpa CHECK constraint di DB. Helper ini
--    cuma untuk jaga-jaga supaya SATU baris user dengan nilai aneh tidak
--    menggagalkan `AT TIME ZONE` untuk seluruh batch query di RPC reminder
--    (fail-safe ke 'Asia/Jakarta', bukan fail-open lewati user tersebut,
--    supaya user itu tetap kebagian reminder meski di jam yang mungkin
--    sedikit meleset).
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.safe_user_timezone(p_timezone TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
    IF p_timezone IS NULL THEN
        RETURN 'Asia/Jakarta';
    END IF;
    PERFORM NOW() AT TIME ZONE p_timezone;
    RETURN p_timezone;
EXCEPTION WHEN OTHERS THEN
    RETURN 'Asia/Jakarta';
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- 2. Log pengiriman notifikasi (anti-duplikat)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bill_reminder_notifications (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bill_id         UUID NOT NULL REFERENCES public.bill_reminders(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    due_date        DATE NOT NULL,       -- siklus jatuh tempo yang direminder
    days_until_due  INTEGER NOT NULL,    -- -? tidak dipakai disini (selalu 0..3), disimpan untuk audit
    sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (bill_id, due_date, days_until_due)
);

ALTER TABLE public.bill_reminder_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can select their own bill reminder notifications" ON public.bill_reminder_notifications;
CREATE POLICY "Users can select their own bill reminder notifications"
    ON public.bill_reminder_notifications FOR SELECT
    USING (auth.uid() = user_id);

-- Tidak ada policy INSERT/UPDATE/DELETE untuk authenticated/anon: baris ini
-- hanya pernah ditulis oleh service-role (dari RPC SECURITY DEFINER di bawah
-- / Edge Function), bukan dari client.

CREATE INDEX IF NOT EXISTS idx_bill_reminder_notif_bill_due
    ON public.bill_reminder_notifications(bill_id, due_date);

-- ─────────────────────────────────────────────────────────────
-- 3. RPC: ambil bill yang harus diingatkan SEKARANG (dipanggil Edge Function)
--    Menyaring: belum lunas, jam lokal user = 19:00, days_until_due 0..3,
--    fitur bill_reminders tidak dikunci admin, belum pernah dikirim untuk
--    (bill_id, due_date, days_until_due) yang sama.
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
    -- Hormati maintenance feature-lock (fail-open: kalau baris setting tidak
    -- ada / NULL, anggap tidak terkunci, sama seperti fallback di maintenance.ts)
    SELECT COALESCE(
        (SELECT mfl.is_locked
         FROM public.maintenance_feature_locks mfl
         JOIN public.maintenance_settings ms ON ms.id = 1
         WHERE mfl.feature_key = 'bill_reminders' AND ms.is_active = TRUE),
        FALSE
    ) INTO v_feature_locked;

    IF v_feature_locked THEN
        RETURN; -- tidak ada baris dikembalikan, Edge Function tidak kirim apa pun
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
        -- jam lokal user sekarang persis jam 19 (window 1 jam dari cron tiap jam)
        AND EXTRACT(HOUR FROM (NOW() AT TIME ZONE public.safe_user_timezone(u.timezone))) = 19
        -- window H-3 .. H+0
        AND nd.days_until_due BETWEEN 0 AND 3
        -- belum pernah dikirim untuk siklus jatuh tempo & hari-ke ini
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

-- ─────────────────────────────────────────────────────────────
-- 4. RPC: catat bahwa notifikasi sudah dikirim (dipanggil Edge Function
--    setelah sendMessage Telegram sukses, supaya kegagalan kirim tidak
--    ikut tercatat sebagai "sudah dikirim")
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.log_bill_reminder_sent(
    p_bill_id UUID,
    p_user_id UUID,
    p_due_date DATE,
    p_days_until_due INTEGER
)
RETURNS VOID
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO public.bill_reminder_notifications (bill_id, user_id, due_date, days_until_due)
    VALUES (p_bill_id, p_user_id, p_due_date, p_days_until_due)
    ON CONFLICT (bill_id, due_date, days_until_due) DO NOTHING;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.log_bill_reminder_sent(UUID, UUID, DATE, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_bill_reminder_sent(UUID, UUID, DATE, INTEGER) TO service_role;

-- ─────────────────────────────────────────────────────────────
-- 5. RPC: tandai lunas dari bot Telegram (tombol "Tandai Lunas")
--    Mengikuti pola insert_telegram_transaction: cari user dari chat_id,
--    lalu pastikan bill itu memang milik user tersebut sebelum update.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mark_bill_paid_via_bot(
    p_chat_id BIGINT,
    p_bill_id UUID
)
RETURNS TABLE (
    id UUID,
    name TEXT,
    is_paid BOOLEAN,
    paid_at TIMESTAMPTZ
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    v_user_id UUID;
BEGIN
    SELECT u.id INTO v_user_id FROM public.users u WHERE u.telegram_chat_id = p_chat_id LIMIT 1;

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'User not found for telegram_chat_id %', p_chat_id;
    END IF;

    RETURN QUERY
    UPDATE public.bill_reminders b
    SET is_paid = TRUE,
        paid_at = NOW(),
        updated_at = NOW()
    WHERE b.id = p_bill_id
      AND b.user_id = v_user_id
      AND b.is_paid = FALSE
    RETURNING b.id, b.name, b.is_paid, b.paid_at;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_bill_paid_via_bot(BIGINT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_bill_paid_via_bot(BIGINT, UUID) TO service_role;

-- ─────────────────────────────────────────────────────────────
-- 6. RPC: reset is_paid awal bulan, HANYA monthly & yearly (one_time
--    tidak pernah disentuh). Dipanggil langsung oleh pg_cron lewat SQL,
--    tanpa Edge Function, karena murni operasi DB tanpa Telegram.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reset_recurring_bill_payment_status()
RETURNS INTEGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    v_count INTEGER := 0;
    v_today DATE := CURRENT_DATE; -- tanggal server; job hanya jalan tgl 1
BEGIN
    -- Monthly: reset semua, siklus baru mulai tiap tanggal 1.
    WITH updated AS (
        UPDATE public.bill_reminders
        SET is_paid = FALSE, paid_at = NULL, updated_at = NOW()
        WHERE recurrence_type = 'monthly' AND is_paid = TRUE
        RETURNING id
    )
    SELECT COUNT(*) INTO v_count FROM updated;

    -- Yearly: reset HANYA bill yang bulan jatuh temponya adalah bulan LALU
    -- (yaitu sekarang sudah masuk bulan setelah due_date-nya), supaya tidak
    -- reset prematur untuk yearly bill yang due date-nya masih jauh.
    WITH updated_yearly AS (
        UPDATE public.bill_reminders
        SET is_paid = FALSE, paid_at = NULL, updated_at = NOW()
        WHERE recurrence_type = 'yearly'
          AND is_paid = TRUE
          AND EXTRACT(MONTH FROM due_date) = EXTRACT(MONTH FROM (v_today - INTERVAL '1 month'))
        RETURNING id
    )
    SELECT v_count + COUNT(*) INTO v_count FROM updated_yearly;

    -- one_time: SENGAJA tidak disentuh sama sekali.

    RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reset_recurring_bill_payment_status() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_recurring_bill_payment_status() TO service_role, postgres;

-- ─────────────────────────────────────────────────────────────
-- 7. pg_cron jobs
--    PENTING: ganti placeholder URL & header Authorization di bawah dengan
--    Project URL & service role key project ini sebelum/Sesudah migration
--    dijalankan (lihat ringkasan & catatan setup manual di akhir jawaban).
--    cron.schedule aman dipanggil ulang (unschedule dulu by jobname) supaya
--    migration idempotent kalau di-re-run.
-- ─────────────────────────────────────────────────────────────
DO $$
BEGIN
    -- Bersihkan dulu kalau sudah ada (idempotent re-run)
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'bill-reminder-notify-hourly';
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'bill-reminder-reset-monthly';
EXCEPTION WHEN OTHERS THEN
    NULL; -- aman kalau belum pernah dijadwalkan sebelumnya
END $$;

-- Job 1: tiap jam, panggil Edge Function bill-reminder-notifier.
-- Edge Function sendiri yang query get_due_bill_reminders_for_notification()
-- dan menentukan siapa yang jam lokalnya pas jam 19:00 sekarang.
SELECT cron.schedule(
    'bill-reminder-notify-hourly',
    '0 * * * *',
    $$
    SELECT net.http_post(
        url := 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/bill-reminder-notifier',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY'
        ),
        body := '{}'::jsonb
    );
    $$
);

-- Job 2: tanggal 1 tiap bulan jam 00:05 (waktu server/UTC), reset is_paid
-- untuk monthly & yearly. Panggil RPC langsung, tidak lewat Edge Function.
SELECT cron.schedule(
    'bill-reminder-reset-monthly',
    '5 0 1 * *',
    $$ SELECT public.reset_recurring_bill_payment_status(); $$
);

COMMENT ON FUNCTION public.get_due_bill_reminders_for_notification IS
    'Dipanggil oleh Edge Function supabase/functions/bill-reminder-notifier via service-role client, dijadwalkan oleh pg_cron job bill-reminder-notify-hourly.';
