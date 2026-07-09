-- Migration: AI-style Error Monitoring untuk Admin Panel
-- Date: 2026-08-04
--
-- Kenapa: sejauh ini error di backend (Vercel functions & Edge Functions)
-- cuma kelihatan lewat `console.error`, yang berarti developer baru sadar
-- ada masalah setelah buka Vercel/Supabase log manual atau ada user
-- komplain. Migration ini menambahkan tabel `error_logs` + RPC admin
-- read-only supaya error bisa dipantau langsung dari Admin Panel, mengikuti
-- pola yang sama dengan admin_get_premium_transactions /
-- get_admin_revenue_metrics (RPC SECURITY DEFINER dengan cek role di
-- dalam fungsi, BUKAN direct table access dari client).
--
-- Sengaja TIDAK dibuatkan endpoint Vercel baru (project ini sudah dekat
-- limit function count di Hobby plan) -- caller (Vercel functions / Edge
-- Functions) insert langsung pakai service_role client yang sudah mereka
-- punya masing-masing, dan Admin Panel baca lewat RPC di bawah ini
-- menggunakan client auth biasa (bukan service_role) sama seperti panel
-- admin lainnya.

-- ─── Tabel ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.error_logs (
  id BIGSERIAL PRIMARY KEY,
  source TEXT NOT NULL,                          -- e.g. 'telegram-webhook', 'gold-price-sync', 'parse-transaction'
  level TEXT NOT NULL DEFAULT 'error' CHECK (level IN ('error', 'warning', 'info')),
  message TEXT NOT NULL,
  context JSONB,                                  -- payload bebas: traceId, stack, brand, chatId, dll
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  trace_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_error_logs_created_at ON public.error_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_logs_source ON public.error_logs (source);
CREATE INDEX IF NOT EXISTS idx_error_logs_level ON public.error_logs (level);

-- RLS aktif tapi TANPA policy untuk anon/authenticated -- satu-satunya
-- jalur tulis adalah service_role (dipakai backend, otomatis bypass RLS)
-- dan satu-satunya jalur baca adalah RPC SECURITY DEFINER di bawah, yang
-- melakukan cek role admin/owner sendiri di dalam fungsi.
ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;

-- ─── RPC: ambil daftar error log (paginated + filter) ──────────────────
CREATE OR REPLACE FUNCTION public.admin_get_error_logs(
  p_limit INT DEFAULT 25,
  p_offset INT DEFAULT 0,
  p_level TEXT DEFAULT 'all',
  p_source TEXT DEFAULT 'all'
)
RETURNS SETOF public.error_logs
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_caller_role TEXT;
BEGIN
  SELECT role INTO v_caller_role FROM public.users WHERE id = auth.uid();
  IF v_caller_role NOT IN ('admin', 'owner') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Hanya admin atau owner yang dapat mengakses log error.';
  END IF;

  RETURN QUERY
  SELECT *
  FROM public.error_logs
  WHERE (p_level = 'all' OR level = p_level)
    AND (p_source = 'all' OR source = p_source)
  ORDER BY created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

-- ─── RPC: hitung total baris (untuk pagination) ────────────────────────
CREATE OR REPLACE FUNCTION public.admin_count_error_logs(
  p_level TEXT DEFAULT 'all',
  p_source TEXT DEFAULT 'all'
)
RETURNS BIGINT
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_caller_role TEXT;
  v_count BIGINT;
BEGIN
  SELECT role INTO v_caller_role FROM public.users WHERE id = auth.uid();
  IF v_caller_role NOT IN ('admin', 'owner') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Hanya admin atau owner yang dapat mengakses log error.';
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM public.error_logs
  WHERE (p_level = 'all' OR level = p_level)
    AND (p_source = 'all' OR source = p_source);

  RETURN v_count;
END;
$$;

-- ─── RPC: ringkasan statistik untuk dashboard cards + trend chart ──────
CREATE OR REPLACE FUNCTION public.admin_get_error_stats(p_hours INT DEFAULT 24)
RETURNS JSON
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_caller_role TEXT;
  v_since TIMESTAMPTZ := now() - (p_hours || ' hours')::INTERVAL;
  v_result JSON;
BEGIN
  SELECT role INTO v_caller_role FROM public.users WHERE id = auth.uid();
  IF v_caller_role NOT IN ('admin', 'owner') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Hanya admin atau owner yang dapat mengakses log error.';
  END IF;

  SELECT json_build_object(
    'period_hours', p_hours,
    'total',    COUNT(*),
    'errors',   COUNT(*) FILTER (WHERE level = 'error'),
    'warnings', COUNT(*) FILTER (WHERE level = 'warning'),
    'info',     COUNT(*) FILTER (WHERE level = 'info'),
    'by_source', COALESCE((
      SELECT json_agg(row_to_json(s) ORDER BY s.count DESC)
      FROM (
        SELECT source, COUNT(*) AS count
        FROM public.error_logs
        WHERE created_at >= v_since
        GROUP BY source
      ) s
    ), '[]'::json),
    'trend', COALESCE((
      SELECT json_agg(row_to_json(tr) ORDER BY tr.bucket)
      FROM (
        SELECT date_trunc('hour', created_at) AS bucket, COUNT(*) AS count
        FROM public.error_logs
        WHERE created_at >= v_since
        GROUP BY bucket
      ) tr
    ), '[]'::json)
  )
  INTO v_result
  FROM public.error_logs
  WHERE created_at >= v_since;

  RETURN v_result;
END;
$$;

-- ─── Retention: buang log lebih dari 30 hari (samakan dengan kebiasaan
-- tools eksternal seperti Sentry free tier) supaya tabel tidak membengkak
-- tanpa batas ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cleanup_old_error_logs()
RETURNS VOID
SECURITY DEFINER
SET search_path = public
LANGUAGE sql
AS $$
  DELETE FROM public.error_logs WHERE created_at < now() - INTERVAL '30 days';
$$;

DO $$
BEGIN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'cleanup-error-logs-daily';
EXCEPTION WHEN OTHERS THEN
    NULL; -- aman kalau belum pernah dijadwalkan
END $$;

SELECT cron.schedule(
    'cleanup-error-logs-daily',
    '0 3 * * *',
    $$ SELECT public.cleanup_old_error_logs(); $$
);
