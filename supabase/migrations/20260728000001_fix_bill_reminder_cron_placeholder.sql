-- Migration: Perbaiki placeholder di job cron bill-reminder-notify-hourly
-- Date: 2026-07-28
-- Root cause / why:
--   Migration 20260709000000_bill_reminder_notifications.sql membuat job
--   pg_cron `bill-reminder-notify-hourly` dengan URL & Authorization header
--   yang masih literal PLACEHOLDER ('YOUR-PROJECT-REF', 'YOUR_SERVICE_ROLE_KEY'),
--   bukan instruksi "ganti manual sebelum jalan" yang benar-benar diikuti --
--   placeholder itu ikut ter-apply ke production apa adanya.
--
--   Akibatnya job otomatis tiap jam SELALU gagal 401 (Authorization:
--   Bearer YOUR_SERVICE_ROLE_KEY bukan JWT valid), sehingga reminder Telegram
--   & push tidak pernah benar-benar terkirim secara otomatis -- hanya
--   berhasil saat dipanggil manual lewat curl dengan service role key asli.
--
--   Perbaikan production sebelumnya dilakukan langsung lewat SQL Editor
--   (cron.schedule ulang, pakai vault secret 'service_role_key'), TIDAK
--   lewat migration file. Artinya kalau migration 20260709000000 di-replay
--   di environment lain (staging baru, disaster recovery, dst), job akan
--   ter-create ulang dengan placeholder yang rusak lagi.
--
--   Migration ini menambal itu: re-create job yang sama dengan command yang
--   benar (vault secret), supaya migration history project ini konsisten
--   dengan state production yang sebenarnya, dan aman di-replay di
--   environment manapun.
--
-- Prasyarat (HARUS sudah ada sebelum migration ini jalan, idempotent
-- kalau sudah ada):
--   Secret 'service_role_key' di Supabase Vault, isinya service role key
--   project ini. Kalau belum ada, buat dulu lewat:
--     select vault.create_secret('<SERVICE_ROLE_KEY_ASLI>', 'service_role_key');
--   (Dashboard -> Project Settings -> Vault, atau lewat SQL Editor sebagai
--   superuser/owner.)

DO $$
BEGIN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'bill-reminder-notify-hourly';
EXCEPTION WHEN OTHERS THEN
    NULL; -- aman kalau belum pernah dijadwalkan
END $$;

-- NOTE: URL project di-hardcode (bukan placeholder) karena project ref
-- bersifat publik/tidak rahasia -- yang sensitif hanya service role key,
-- dan itu sudah diambil dari Vault, bukan literal. Ganti URL ini kalau
-- migration ini dijalankan di project Supabase yang berbeda.
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

COMMENT ON EXTENSION pg_cron IS
    'bill-reminder-notify-hourly memanggil Edge Function bill-reminder-notifier via net.http_post. Authorization header diambil dari Supabase Vault (secret: service_role_key) -- BUKAN literal/placeholder. Lihat migration 20260728000001 untuk root cause kenapa ini penting (riwayat bug: placeholder literal sempat ter-apply ke production dan membuat job gagal 401 terus-menerus tanpa terdeteksi).';
