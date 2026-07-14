-- Migration: Watchdog untuk backup_logs yang nyangkut di status "running"
-- Date: 2026-08-18
-- Description:
--   Insiden 14/7/2026: run "Database Backup" di GitHub Actions selesai
--   SUKSES (centang hijau), tapi row backup_logs terkait tetap
--   status='running' selamanya -> Admin Panel menampilkan "Berjalan" terus
--   walau backup sebenarnya sudah kelar.
--
--   Root cause: step PATCH status di db-backup.yml pakai `curl` TANPA
--   flag -f/--fail, jadi kalau PATCH ke PostgREST gagal (mis. log_id
--   kosong/invalid karena jq gagal parse response insert awal), curl
--   tetap exit code 0 -> step & job tetap dianggap sukses oleh GitHub
--   Actions, padahal row di DB tidak pernah ter-update.
--
--   Perbaikan utama sudah dilakukan di db-backup.yml (curl -sSf + validasi
--   UUID log_id sebelum lanjut, supaya kegagalan sekarang IKUT membuat run
--   gagal/kelihatan di GitHub Actions, bukan silent).
--
--   Migration ini adalah SAFETY NET tambahan di level DB, untuk kasus lain
--   yang tidak bisa dicegah dari sisi workflow saja, misalnya:
--     - runner GitHub Actions mati/di-cancel paksa sebelum step PATCH manapun
--       sempat jalan (mis. `timeout-minutes: 20` tercapai, OOM, dsb)
--     - outage GitHub Actions / Supabase saat step notifikasi jalan
--   Tanpa watchdog ini, kasus di atas akan tetap membuat row nyangkut di
--   "running" walau perbaikan curl -f sudah ada, karena step PATCH-nya
--   sendiri tidak pernah sempat dieksekusi sama sekali.
--
--   Job ini jalan tiap 15 menit, menandai row 'running' yang started_at
--   lebih tua dari batas wajar (timeout-minutes backup = 20 menit, dikasih
--   buffer jadi 30 menit) sebagai 'failed' dengan pesan yang jelas.

CREATE OR REPLACE FUNCTION public.mark_stale_backup_logs_as_failed()
RETURNS void
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.backup_logs
  SET status = 'failed',
      error_message = COALESCE(error_message, '')
        || CASE WHEN error_message IS NOT NULL AND error_message <> '' THEN ' | ' ELSE '' END
        || 'Ditandai gagal otomatis oleh watchdog: tidak ada update status dari GitHub Actions setelah 30 menit (kemungkinan run mati/timeout/cancelled sebelum sempat lapor selesai).',
      finished_at = NOW()
  WHERE status = 'running'
    AND started_at < NOW() - INTERVAL '30 minutes';
END;
$$;

REVOKE ALL ON FUNCTION public.mark_stale_backup_logs_as_failed() FROM PUBLIC;
-- Tidak perlu GRANT ke anon/authenticated -- fungsi ini hanya dipanggil
-- oleh pg_cron (jalan sebagai role yang menjadwalkannya, biasanya
-- postgres/supabase_admin), bukan lewat client browser.

SELECT cron.schedule(
    'mark-stale-backup-logs',
    '*/15 * * * *',
    $$ SELECT public.mark_stale_backup_logs_as_failed(); $$
);
