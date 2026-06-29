-- Fix: duplicate key error di AdminAiMonitor
--
-- Root cause: get_ai_usage_summary melakukan GROUP BY provider, key_alias, model
-- sehingga satu key alias yang dipakai untuk beberapa model (misalnya gemini_key_1
-- dipakai untuk gemini-1.5-flash DAN gemini-1.5-pro) menghasilkan lebih dari satu
-- baris dengan provider+key_alias yang sama. React lalu melempar warning
-- "duplicate key" karena key={`${provider}-${key_alias}`} tidak unik.
--
-- Fix: GROUP BY hanya provider + key_alias (hapus model dari group),
-- lalu gunakan string_agg untuk menampilkan semua model yang pernah dipakai
-- oleh key tersebut sebagai satu string (e.g. "gemini-1.5-flash, gemini-2.0-flash").
-- Dengan ini satu key alias = tepat satu baris, key React selalu unik.

CREATE OR REPLACE FUNCTION public.get_ai_usage_summary(p_days INT DEFAULT 30)
RETURNS JSON
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_caller_role TEXT;
  v_since       TIMESTAMPTZ;
  v_result      JSON;
BEGIN
  SELECT role INTO v_caller_role FROM public.users WHERE id = auth.uid();
  IF v_caller_role NOT IN ('admin', 'owner') THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  v_since := NOW() - (p_days || ' days')::INTERVAL;

  SELECT json_build_object(
    'period_days', p_days,
    'since',       v_since,

    -- by_key: GROUP BY provider + key_alias saja (bukan model)
    -- model di-aggregate supaya 1 key alias = 1 baris → key React selalu unik
    'by_key', (
      SELECT json_agg(row_to_json(r)) FROM (
        SELECT
          provider,
          key_alias,
          string_agg(DISTINCT model, ', ' ORDER BY model)    AS model,
          COUNT(*)                                            AS total_calls,
          COUNT(*) FILTER (WHERE success = TRUE)              AS success_calls,
          COUNT(*) FILTER (WHERE success = FALSE)             AS failed_calls,
          COUNT(*) FILTER (WHERE error_code = '429')          AS quota_exceeded_calls,
          MAX(created_at)                                     AS last_used_at
        FROM public.ai_usage_logs
        WHERE created_at >= v_since
        GROUP BY provider, key_alias
        ORDER BY provider, key_alias
      ) r
    ),

    -- by_provider: tidak berubah
    'by_provider', (
      SELECT json_agg(row_to_json(p)) FROM (
        SELECT
          provider,
          COUNT(*)                                            AS total_calls,
          COUNT(*) FILTER (WHERE success = TRUE)              AS success_calls,
          COUNT(*) FILTER (WHERE success = FALSE)             AS failed_calls,
          COUNT(*) FILTER (WHERE error_code = '429')          AS quota_exceeded_calls
        FROM public.ai_usage_logs
        WHERE created_at >= v_since
        GROUP BY provider
        ORDER BY total_calls DESC
      ) p
    ),

    -- daily_trend: tidak berubah
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
