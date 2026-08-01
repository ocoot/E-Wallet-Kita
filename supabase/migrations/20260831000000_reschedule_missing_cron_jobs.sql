-- Migration: Reschedule 4 pg_cron job yang hilang total dari scheduler
-- Date: 2026-08-31
-- Root cause / why:
--   Ditemukan lewat audit langsung ke `cron.job` & `cron.job_run_details`
--   project Supabase (via MCP, bukan asumsi dari migration file): SELURUH
--   eksekusi pg_cron di project ini berhenti total pada 2026-07-14 11:45:00
--   UTC dan tidak pernah jalan lagi sejak itu -- termasuk untuk 2 job yang
--   statusnya masih `active = true` (birthday-reminder-notify-hourly,
--   mark-stale-backup-logs), yang keduanya nol eksekusi walau seharusnya
--   jalan tiap jam / 15 menit.
--
--   Selain itu, 4 job berikut HILANG TOTAL dari `cron.job` (bukan cuma
--   berhenti jalan -- barisnya sendiri tidak ada):
--     - gold-price-sync-daily      (dibuat oleh 20260704000001, 20260803000000)
--     - bill-reminder-notify-hourly (dibuat oleh 20260709000000, 20260728000001)
--     - bill-reminder-reset-monthly (dibuat oleh 20260709000000)
--     - cleanup-error-logs-daily    (dibuat oleh 20260804000000)
--   Vault secret 'service_role_key' yang dipakai job-job http_post di atas
--   juga sempat hilang (sudah dibuat ulang manual oleh user lewat SQL
--   Editor SEBELUM migration ini dijalankan -- lihat prasyarat di bawah).
--
--   Karena migration yang tadinya membuat job-job ini (0704/0709/0728/0803/
--   0804) sudah tercatat "applied" di `supabase_migrations.schema_migrations`,
--   mereka TIDAK akan otomatis re-run untuk mengembalikan job yang hilang --
--   makanya perlu migration baru ini, murni untuk reschedule ulang.
--
-- Dampak sebelum fix ini (terverifikasi lewat `gold_prices.fetched_at` --
-- stuck di 2026-07-14): harga emas basi, reminder tagihan Telegram/push
-- tidak terkirim otomatis, reset status lunas tagihan bulanan tidak jalan,
-- error_logs >30 hari tidak ke-cleanup.
--
-- Prasyarat (HARUS sudah ada sebelum migration ini jalan):
--   Secret 'service_role_key' di Supabase Vault berisi service role key
--   project ini yang valid & AKTIF (bukan yang lama/revoked). Kalau belum:
--     select vault.create_secret('<SERVICE_ROLE_KEY_ASLI>', 'service_role_key');
--
-- Definisi tiap job di bawah disalin dari versi PALING TERAKHIR/BENAR di
-- migration aslinya masing-masing (bukan versi pertama yang sempat salah/
-- regresi) -- lihat komentar per job.

-- ── 1. gold-price-sync-daily ─────────────────────────────────────────────
-- Versi timeout_milliseconds=20000 dari 20260704000001 (fix timeout 5s
-- default pg_net) -- sempat REGRESI ke default 5000ms lagi di
-- 20260803000000_gold_savings.sql yang reschedule tanpa parameter ini.
-- Migration ini mengembalikan yang benar (20000ms) sekaligus reschedule.
DO $$
BEGIN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'gold-price-sync-daily';
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

SELECT cron.schedule(
    'gold-price-sync-daily',
    '0 2 * * *',
    $$
    SELECT net.http_post(
        url := 'https://enzooigugdeaiqhnvims.supabase.co/functions/v1/gold-price-sync',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 20000
    );
    $$
);

-- ── 2. bill-reminder-notify-hourly ───────────────────────────────────────
-- Versi dari 20260728000001 (fix placeholder literal -> vault secret asli).
DO $$
BEGIN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'bill-reminder-notify-hourly';
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

SELECT cron.schedule(
    'bill-reminder-notify-hourly',
    '0 * * * *',
    $$
    SELECT net.http_post(
        url := 'https://enzooigugdeaiqhnvims.supabase.co/functions/v1/bill-reminder-notifier',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
        ),
        body := '{}'::jsonb
    );
    $$
);

-- ── 3. bill-reminder-reset-monthly ───────────────────────────────────────
-- Tidak pernah berubah sejak 20260709000000 (tidak pakai http_post/vault,
-- panggil RPC langsung -- tidak terdampak masalah placeholder/vault).
DO $$
BEGIN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'bill-reminder-reset-monthly';
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

SELECT cron.schedule(
    'bill-reminder-reset-monthly',
    '5 0 1 * *',
    $$ SELECT public.reset_recurring_bill_payment_status(); $$
);

-- ── 4. cleanup-error-logs-daily ──────────────────────────────────────────
-- Tidak pernah berubah sejak 20260804000000.
DO $$
BEGIN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'cleanup-error-logs-daily';
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

SELECT cron.schedule(
    'cleanup-error-logs-daily',
    '0 3 * * *',
    $$ SELECT public.cleanup_old_error_logs(); $$
);

COMMENT ON EXTENSION pg_cron IS
    'Ke-6 job aktif per 2026-08-31: birthday-reminder-notify-hourly, mark-stale-backup-logs (tidak sempat hilang), gold-price-sync-daily, bill-reminder-notify-hourly, bill-reminder-reset-monthly, cleanup-error-logs-daily (4 terakhir ini di-reschedule ulang oleh migration ini setelah ditemukan hilang total dari cron.job sejak insiden ~2026-07-14 -- lihat komentar lengkap di 20260831000000_reschedule_missing_cron_jobs.sql). Kalau di masa depan ada job pg_cron yang statusnya "active" tapi cron.job_run_details tidak pernah bertambah, curigai dulu apakah pg_cron background worker project ini benar-benar jalan (butuh restart Postgres lewat Dashboard > Settings > Database > Restart kalau macet), BUKAN cuma masalah di command job itu sendiri.';
