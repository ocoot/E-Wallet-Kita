-- Migration: RPC Status Scheduled Jobs (pg_cron) untuk Admin Panel
-- Date: 2026-09-01
-- Root cause / why:
--   Insiden 14/7/2026 (lihat migration 20260831000000_reschedule_missing_cron_jobs.sql):
--   4 job pg_cron hilang total dari `cron.job` selama ~18 hari, TIDAK
--   TERDETEKSI oleh AdminErrorMonitor.tsx sama sekali -- karena kalau job
--   tidak pernah dipanggil (bukan dipanggil-lalu-gagal), tidak ada satupun
--   baris yang masuk ke `error_logs`. Error monitor cuma bisa lihat
--   kegagalan yang TERCATAT, buta terhadap kegagalan berupa "job-nya
--   sendiri sudah tidak ada / tidak pernah jalan".
--
--   RPC ini kebalikannya: baca `cron.job` + `cron.job_run_details`
--   LANGSUNG dari sumbernya (schema `cron`, milik pg_cron), supaya Admin
--   Panel bisa jawab "kapan terakhir tiap job ini BENAR-BENAR jalan?"
--   tanpa perlu psql/SQL Editor manual seperti proses debug insiden ini.
--
-- Kenapa RPC baru, bukan endpoint Vercel baru:
--   Sisa slot endpoint Vercel tinggal sedikit (limit 12) -- pola yang sama
--   dipakai gold-price-sync/backup: akses ke resource privileged lewat
--   RPC SECURITY DEFINER + guard is_admin_or_owner(), dipanggil langsung
--   dari Supabase client di AdminErrorMonitor.tsx (RPC only, 0 endpoint
--   Vercel baru).
--
-- expected_interval_minutes di-hardcode per jobname (CASE), bukan
-- di-parse dari kolom `schedule` (cron expression) -- parsing cron
-- expression generik ke "interval dalam menit" jauh lebih kompleks
-- (mis. `5 0 1 * *` = bulanan, tidak bisa direduksi ke satu angka menit
-- secara akurat) dan cuma dipakai 6 job yang sudah diketahui persis
-- jadwalnya. Kalau nanti ada job baru, tambahkan 1 baris CASE di sini.
--
-- is_overdue pakai buffer 1.5x dari expected_interval supaya tidak
-- false-positive kena delay startup/jitter pg_cron yang wajar (mis. job
-- jam-jaman yang telat beberapa menit bukan berarti mati).

CREATE OR REPLACE FUNCTION public.get_scheduled_jobs_status()
RETURNS JSON
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_result JSON;
BEGIN
  IF NOT public.is_admin_or_owner() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  WITH last_run AS (
    SELECT jrd.jobid, MAX(jrd.start_time) AS last_run_at
    FROM cron.job_run_details jrd
    GROUP BY jrd.jobid
  ),
  last_status AS (
    SELECT DISTINCT ON (jrd.jobid) jrd.jobid, jrd.status, jrd.return_message
    FROM cron.job_run_details jrd
    ORDER BY jrd.jobid, jrd.start_time DESC
  ),
  expected AS (
    SELECT
      j.jobid,
      CASE j.jobname
        WHEN 'gold-price-sync-daily'          THEN 24 * 60
        WHEN 'bill-reminder-notify-hourly'     THEN 60
        WHEN 'bill-reminder-reset-monthly'     THEN 31 * 24 * 60
        WHEN 'cleanup-error-logs-daily'        THEN 24 * 60
        WHEN 'birthday-reminder-notify-hourly' THEN 60
        WHEN 'mark-stale-backup-logs'          THEN 15
        ELSE 24 * 60 -- default aman untuk job yang belum dikenal di sini
      END AS expected_interval_minutes
    FROM cron.job j
  )
  SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.jobname), '[]'::json)
  INTO v_result
  FROM (
    SELECT
      j.jobname,
      j.schedule,
      j.active,
      lr.last_run_at,
      ls.status AS last_run_status,
      ls.return_message AS last_run_message,
      e.expected_interval_minutes,
      (
        lr.last_run_at IS NULL
        OR lr.last_run_at < NOW() - (e.expected_interval_minutes * 1.5 || ' minutes')::INTERVAL
      ) AS is_overdue
    FROM cron.job j
    LEFT JOIN last_run lr ON lr.jobid = j.jobid
    LEFT JOIN last_status ls ON ls.jobid = j.jobid
    LEFT JOIN expected e ON e.jobid = j.jobid
  ) t;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_scheduled_jobs_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_scheduled_jobs_status() TO authenticated;

COMMENT ON FUNCTION public.get_scheduled_jobs_status() IS
    'Dipakai Admin Panel > Monitor Error (kartu "Status Scheduled Jobs") untuk mendeteksi job pg_cron yang hilang/berhenti TANPA meninggalkan jejak di error_logs -- lihat root cause insiden 2026-07-14 di komentar migration ini.';
