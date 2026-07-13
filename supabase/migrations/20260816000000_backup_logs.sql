-- Migration: Database Backup Logs
-- Date: 2026-08-16
-- Description: Mencatat riwayat backup database off-site (dijalankan oleh
--              GitHub Actions workflow `.github/workflows/db-backup.yml`,
--              mirip pola cron+pg_dump+rclone di server tradisional, tapi
--              tanpa perlu VPS karena stack ini Vercel + Supabase free tier).
--
-- Kenapa bukan RPC untuk insert/update log?
--   Workflow GH Actions menulis pakai SERVICE ROLE KEY langsung (bukan lewat
--   client browser), dan service role SELALU bypass RLS di Postgres/Supabase.
--   Jadi REVOKE di bawah ini murni untuk mencegah user biasa/admin menulis
--   log palsu lewat browser -- bukan untuk membatasi service role.

CREATE TABLE IF NOT EXISTS public.backup_logs (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  status            TEXT        NOT NULL DEFAULT 'running',
  -- status: 'running' | 'success' | 'failed'
  triggered_by      TEXT        NOT NULL DEFAULT 'cron',
  -- triggered_by: 'cron' (jadwal harian) | 'manual' (tombol di Admin Panel)
  triggered_by_admin UUID       REFERENCES public.users(id) ON DELETE SET NULL,
  file_name         TEXT,
  file_size_bytes   BIGINT,
  storage_provider  TEXT        NOT NULL DEFAULT 'google_drive',
  storage_path      TEXT,
  -- storage_path: path/nama file di Google Drive tujuan (bukan link publik,
  -- karena file backup TIDAK pernah dibuat publik)
  error_message     TEXT,
  started_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at       TIMESTAMPTZ,
  duration_ms       INTEGER,
  CONSTRAINT backup_logs_status_check
    CHECK (status IN ('running', 'success', 'failed')),
  CONSTRAINT backup_logs_triggered_by_check
    CHECK (triggered_by IN ('cron', 'manual'))
);

CREATE INDEX IF NOT EXISTS idx_backup_logs_started_at ON public.backup_logs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_backup_logs_status     ON public.backup_logs(status);

ALTER TABLE public.backup_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read backup logs" ON public.backup_logs;
CREATE POLICY "Admins can read backup logs"
  ON public.backup_logs FOR SELECT
  USING (public.is_admin_or_owner());

-- Tidak ada policy INSERT/UPDATE/DELETE untuk anon/authenticated sama sekali
-- -> hanya service role (dipakai GH Actions) yang bisa menulis.
REVOKE INSERT, UPDATE, DELETE ON public.backup_logs FROM anon, authenticated;

-- RPC ringkas untuk Admin Panel: status backup TERAKHIR + 30 riwayat terakhir
-- dalam satu round-trip (menghindari 2 query terpisah dari client).
CREATE OR REPLACE FUNCTION public.get_backup_status()
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

  SELECT json_build_object(
    'latest', (
      SELECT row_to_json(l) FROM (
        SELECT id, status, triggered_by, file_name, file_size_bytes,
               storage_provider, error_message, started_at, finished_at, duration_ms
        FROM public.backup_logs
        ORDER BY started_at DESC
        LIMIT 1
      ) l
    ),
    'history', (
      SELECT COALESCE(json_agg(h), '[]'::json) FROM (
        SELECT id, status, triggered_by, file_name, file_size_bytes,
               storage_provider, error_message, started_at, finished_at, duration_ms
        FROM public.backup_logs
        ORDER BY started_at DESC
        LIMIT 30
      ) h
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_backup_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_backup_status() TO authenticated;
