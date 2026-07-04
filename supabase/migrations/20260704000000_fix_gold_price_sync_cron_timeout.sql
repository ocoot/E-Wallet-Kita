-- Migration: Perbaiki timeout net.http_post untuk job gold-price-sync-daily
-- Date: 2026-07-04
--
-- Root cause / why:
--   cron.job_run_details mencatat job 'gold-price-sync-daily' SELALU
--   "succeeded" tiap jam 02:00 UTC, TAPI tidak ada satupun baris yang
--   cocok di net._http_response untuk panggilan ke gold-price-sync (beda
--   dengan bill-reminder-notify-hourly yang responsnya selalu tercatat).
--
--   net.http_post() bersifat asynchronous -- ia cuma menaruh request ke
--   antrean pg_net dan langsung return, TIDAK menunggu response. Artinya
--   status "succeeded" di cron.job_run_details hanya berarti perintah SQL
--   net.http_post() itu sendiri berhasil dijalankan (request berhasil
--   di-enqueue), BUKAN berarti Edge Function-nya berhasil dipanggil/
--   merespons.
--
--   Migration 20260803000000_gold_savings.sql men-schedule job ini TANPA
--   parameter timeout_milliseconds eksplisit, sehingga pg_net memakai
--   default-nya: 5000ms (5 detik). gold-price-sync memproses 4 brand
--   secara SEQUENTIAL, tiap brand fetch ke API eksternal (primary
--   logam-mulia-api, dan kalau gagal, fallback emas.maulanar.my.id) --
--   total waktu tempuh yang wajar untuk 4 brand x kemungkinan primary+
--   fallback sangat mungkin melebihi 5 detik, terutama kalau salah satu
--   API eksternal sedang agak lambat. Kalau request pg_net timeout
--   sebelum Edge Function selesai merespons, tidak ada baris response
--   yang tercatat di net._http_response untuk request tsb -- persis
--   gejala yang ditemukan.
--
--   Test manual lewat tombol "Test" di Supabase Dashboard tidak kena
--   batas 5 detik ini (bukan lewat pg_net), makanya selalu berhasil.
--
-- Fix: re-schedule job yang sama dengan timeout_milliseconds = 20000
-- (20 detik) -- cukup untuk 4 brand x primary+fallback dengan margin,
-- tapi masih jauh di bawah batas eksekusi Edge Function (~150 detik).

DO $$
BEGIN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'gold-price-sync-daily';
EXCEPTION WHEN OTHERS THEN
    NULL; -- aman kalau belum pernah dijadwalkan
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

COMMENT ON EXTENSION pg_cron IS
    'gold-price-sync-daily memanggil Edge Function gold-price-sync via net.http_post dengan timeout_milliseconds=20000 (dinaikkan dari default 5000ms -- lihat migration 20260704000000 untuk root cause: 4 brand sequential fetch ke API eksternal gampang melebihi 5 detik, menyebabkan request pg_net timeout tanpa tercatat di net._http_response sama sekali, walau cron.job_run_details tetap melaporkan "succeeded" karena net.http_post cuma meng-enqueue request, tidak menunggu response-nya).';
