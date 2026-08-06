-- Migration: Generic rate limiter (reusable, keyed bucket)
-- Date: 2026-09-02
-- Description: Security audit found several serverless functions with NO
--   rate limiting at all -- api/premium/payment.ts (POST/GET),
--   api/account/privacy.ts (GET export / DELETE account), api/admin/broadcast.ts
--   and api/admin/backup.ts (admin-authenticated, but a stolen admin token
--   could still hammer them), and api/utils.ts?type=weather (public,
--   unauthenticated, proxies to free third-party APIs -> abuse risk).
--
--   Rather than repeating the per-feature column pattern from
--   20260712000000_db_backed_rate_limiting_and_dedup.sql and
--   20260823000001_receipt_and_support_rate_limiting.sql (one pair of
--   columns added to api_rate_limits per feature), this introduces ONE
--   generic keyed-bucket table so future endpoints don't need a new
--   migration every time. The key is caller-defined, e.g.:
--     'payment:create:<user_id>', 'privacy:export:<user_id>',
--     'admin:broadcast:<user_id>', 'weather:<ip>'
--   letting the same function rate-limit per-user AND per-IP (needed for
--   public endpoints where there is no authenticated user yet).
--
--   Existing feature-specific columns/functions on api_rate_limits are
--   left untouched -- this is purely additive.

CREATE TABLE IF NOT EXISTS public.rate_limit_buckets (
  key           TEXT PRIMARY KEY,
  count         INTEGER NOT NULL DEFAULT 0,
  window_start  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Buckets are short-lived (windows are minutes, not days) but the table
-- has no natural TTL/expiry on its own -- a lightweight periodic cleanup
-- avoids unbounded growth from one-off keys (e.g. per-IP keys from many
-- distinct visitors). Kept generous (7 days) since this is just a safety
-- net, not the primary rate-limit logic.
CREATE INDEX IF NOT EXISTS idx_rate_limit_buckets_updated_at
  ON public.rate_limit_buckets (updated_at);

ALTER TABLE public.rate_limit_buckets ENABLE ROW LEVEL SECURITY;
-- No policies added on purpose: only service_role (which bypasses RLS)
-- and the SECURITY DEFINER function below ever touch this table.

CREATE OR REPLACE FUNCTION public.check_and_increment_rate_limit(
  p_key            TEXT,
  p_limit          INTEGER,
  p_window_seconds INTEGER
)
RETURNS TABLE(allowed BOOLEAN, retry_after_seconds INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.rate_limit_buckets;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  INSERT INTO public.rate_limit_buckets (key, count, window_start, updated_at)
  VALUES (p_key, 0, v_now, v_now)
  ON CONFLICT (key) DO NOTHING;

  SELECT * INTO v_row FROM public.rate_limit_buckets WHERE key = p_key FOR UPDATE;

  IF v_now - v_row.window_start > (p_window_seconds || ' seconds')::INTERVAL THEN
    v_row.count := 0;
    v_row.window_start := v_now;
  END IF;

  IF v_row.count >= p_limit THEN
    UPDATE public.rate_limit_buckets
    SET count = v_row.count, window_start = v_row.window_start, updated_at = v_now
    WHERE key = p_key;

    RETURN QUERY SELECT
      FALSE,
      CEIL(EXTRACT(EPOCH FROM (v_row.window_start + (p_window_seconds || ' seconds')::INTERVAL - v_now)))::INTEGER;
    RETURN;
  END IF;

  v_row.count := v_row.count + 1;

  UPDATE public.rate_limit_buckets
  SET count = v_row.count, window_start = v_row.window_start, updated_at = v_now
  WHERE key = p_key;

  RETURN QUERY SELECT TRUE, NULL::INTEGER;
END;
$$;

-- Only backend code (service_role) may call this -- never exposed to
-- anon/authenticated clients directly, same convention as the other
-- rate-limit functions in this project.
REVOKE EXECUTE ON FUNCTION public.check_and_increment_rate_limit(TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_and_increment_rate_limit(TEXT, INTEGER, INTEGER) TO service_role;

-- Cleanup helper -- safe to call periodically (e.g. piggyback on an
-- existing pg_cron job) to keep the table small. Not scheduled
-- automatically by this migration to avoid surprising interactions with
-- existing cron jobs; wire it up manually if desired.
CREATE OR REPLACE FUNCTION public.cleanup_old_rate_limit_buckets()
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.rate_limit_buckets WHERE updated_at < NOW() - INTERVAL '7 days';
$$;

REVOKE EXECUTE ON FUNCTION public.cleanup_old_rate_limit_buckets() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_old_rate_limit_buckets() TO service_role;
