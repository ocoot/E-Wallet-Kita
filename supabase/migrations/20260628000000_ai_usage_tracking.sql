-- Migration: AI Usage Tracking
-- Date: 2026-06-28
-- Tabel untuk mencatat setiap pemakaian AI provider (Gemini, OpenAI, Claude)
-- agar admin bisa memonitor persentase kuota yang terpakai per key.

CREATE TABLE IF NOT EXISTS public.ai_usage_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider     TEXT NOT NULL CHECK (provider IN ('gemini', 'openai', 'anthropic')),
  key_alias    TEXT NOT NULL,   -- e.g. "gemini_key_1", "openai_key_2"
  model        TEXT NOT NULL,
  source       TEXT NOT NULL,   -- 'receipt_parser' | 'parse_transaction' | dll
  success      BOOLEAN NOT NULL DEFAULT TRUE,
  error_code   TEXT,            -- '429', '503', dll — diisi jika gagal
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index untuk query agregasi per provider / per hari
CREATE INDEX IF NOT EXISTS idx_ai_usage_provider_created
  ON public.ai_usage_logs (provider, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_usage_key_alias_created
  ON public.ai_usage_logs (key_alias, created_at DESC);

-- Nonaktifkan akses langsung dari client; hanya service role yang boleh insert
ALTER TABLE public.ai_usage_logs ENABLE ROW LEVEL SECURITY;

-- Policy: tidak ada akses dari anon/authenticated — semua lewat RPC SECURITY DEFINER
CREATE POLICY "ai_usage_logs_no_direct_access"
  ON public.ai_usage_logs FOR ALL
  USING (FALSE);

-- ─────────────────────────────────────────────────────────────
-- RPC: get_ai_usage_summary
-- Mengembalikan ringkasan pemakaian per key_alias per periode
-- p_days: jumlah hari ke belakang (default 30)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_ai_usage_summary(p_days INT DEFAULT 30)
RETURNS JSON
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_caller_role TEXT;
  v_since TIMESTAMPTZ;
  v_result JSON;
BEGIN
  SELECT role INTO v_caller_role FROM public.users WHERE id = auth.uid();
  IF v_caller_role NOT IN ('admin', 'owner') THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  v_since := NOW() - (p_days || ' days')::INTERVAL;

  SELECT json_build_object(
    'period_days', p_days,
    'since',       v_since,
    'by_key',      (
      SELECT json_agg(row_to_json(r)) FROM (
        SELECT
          provider,
          key_alias,
          model,
          COUNT(*)                                        AS total_calls,
          COUNT(*) FILTER (WHERE success = TRUE)          AS success_calls,
          COUNT(*) FILTER (WHERE success = FALSE)         AS failed_calls,
          COUNT(*) FILTER (WHERE error_code = '429')      AS quota_exceeded_calls,
          MAX(created_at)                                 AS last_used_at
        FROM public.ai_usage_logs
        WHERE created_at >= v_since
        GROUP BY provider, key_alias, model
        ORDER BY provider, key_alias, total_calls DESC
      ) r
    ),
    'by_provider', (
      SELECT json_agg(row_to_json(p)) FROM (
        SELECT
          provider,
          COUNT(*)                                        AS total_calls,
          COUNT(*) FILTER (WHERE success = TRUE)          AS success_calls,
          COUNT(*) FILTER (WHERE success = FALSE)         AS failed_calls,
          COUNT(*) FILTER (WHERE error_code = '429')      AS quota_exceeded_calls
        FROM public.ai_usage_logs
        WHERE created_at >= v_since
        GROUP BY provider
        ORDER BY total_calls DESC
      ) p
    ),
    'daily_trend', (
      SELECT json_agg(row_to_json(d)) FROM (
        SELECT
          DATE(created_at AT TIME ZONE 'UTC') AS date,
          provider,
          COUNT(*)                             AS calls
        FROM public.ai_usage_logs
        WHERE created_at >= v_since
        GROUP BY DATE(created_at AT TIME ZONE 'UTC'), provider
        ORDER BY date DESC
      ) d
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- RPC: log_ai_usage (dipanggil dari server dengan service role)
-- Tidak perlu auth.uid() karena dipanggil dari backend
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.log_ai_usage(
  p_provider   TEXT,
  p_key_alias  TEXT,
  p_model      TEXT,
  p_source     TEXT,
  p_success    BOOLEAN,
  p_error_code TEXT DEFAULT NULL
)
RETURNS VOID
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.ai_usage_logs (provider, key_alias, model, source, success, error_code)
  VALUES (p_provider, p_key_alias, p_model, p_source, p_success, p_error_code);
END;
$$;

-- Revoke akses execute dari public; hanya service_role yang bisa log
REVOKE EXECUTE ON FUNCTION public.log_ai_usage FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.log_ai_usage TO service_role;

-- get_ai_usage_summary boleh dipanggil authenticated (dicek di dalam function)
GRANT EXECUTE ON FUNCTION public.get_ai_usage_summary TO authenticated;
