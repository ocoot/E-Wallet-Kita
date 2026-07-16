-- Migration: Rate limiting for receipt OCR and support chat messages
-- Date: 2026-07-23
-- Description: Backend audit found two endpoints with no rate limiting at
--   all (unlike api/parse.ts and the /link lockout, which already use the
--   DB-backed pattern from 20260712000000_db_backed_rate_limiting_and_dedup.sql):
--
--   1. api/receipt.ts (action=parse) — premium receipt OCR, calls a paid
--      AI/vision API per request with zero limit on how often a premium
--      user can hit it.
--   2. supabase/functions/support-bridge (mode=user_message) — public edge
--      function, callable with any session_id and no ownership check or
--      rate limit, so it could be used to spam another user's support
--      session (and the Telegram notification that fires on every insert).
--
--   Same atomic check-and-increment pattern as before: one row per
--   subject, locked with FOR UPDATE, so it holds regardless of which
--   serverless/edge instance handles the request.

-- ─────────────────────────────────────────────────────────────
-- 1. Receipt OCR rate limiting (per user)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.api_rate_limits
  ADD COLUMN IF NOT EXISTS receipt_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS receipt_window_start TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Separate column/bucket from the text & voice parse counters on purpose:
-- receipt OCR is a distinct premium feature with its own cost profile, and
-- coupling it to the general AI bucket would mean a burst of voice notes
-- could silently eat into a user's receipt-scan allowance (or vice versa).
CREATE OR REPLACE FUNCTION public.check_and_increment_receipt_rate_limit(
  p_user_id        UUID,
  p_limit          INTEGER DEFAULT 5,
  p_window_seconds INTEGER DEFAULT 60
)
RETURNS TABLE(allowed BOOLEAN, retry_after_seconds INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.api_rate_limits;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  INSERT INTO public.api_rate_limits (user_id, receipt_count, receipt_window_start)
  VALUES (p_user_id, 0, v_now)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO v_row FROM public.api_rate_limits WHERE user_id = p_user_id FOR UPDATE;

  IF v_now - v_row.receipt_window_start > (p_window_seconds || ' seconds')::INTERVAL THEN
    v_row.receipt_count := 0;
    v_row.receipt_window_start := v_now;
  END IF;

  IF v_row.receipt_count >= p_limit THEN
    UPDATE public.api_rate_limits
    SET receipt_count = v_row.receipt_count, receipt_window_start = v_row.receipt_window_start
    WHERE user_id = p_user_id;

    RETURN QUERY SELECT
      FALSE,
      CEIL(EXTRACT(EPOCH FROM (v_row.receipt_window_start + (p_window_seconds || ' seconds')::INTERVAL - v_now)))::INTEGER;
    RETURN;
  END IF;

  v_row.receipt_count := v_row.receipt_count + 1;

  UPDATE public.api_rate_limits
  SET receipt_count = v_row.receipt_count, receipt_window_start = v_row.receipt_window_start
  WHERE user_id = p_user_id;

  RETURN QUERY SELECT TRUE, NULL::INTEGER;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.check_and_increment_receipt_rate_limit(UUID, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_and_increment_receipt_rate_limit(UUID, INTEGER, INTEGER) TO service_role;

-- ─────────────────────────────────────────────────────────────
-- 2. Support chat "user_message" rate limiting (per session)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.support_message_rate_limits (
  session_id   UUID        PRIMARY KEY REFERENCES public.support_sessions(id) ON DELETE CASCADE,
  count        INTEGER     NOT NULL DEFAULT 0,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.support_message_rate_limits ENABLE ROW LEVEL SECURITY;
-- No anon/authenticated policies on purpose — only touched by the
-- support-bridge edge function via service role, through the RPC below.

CREATE OR REPLACE FUNCTION public.check_and_increment_support_message_rate_limit(
  p_session_id     UUID,
  p_limit          INTEGER DEFAULT 10,
  p_window_seconds INTEGER DEFAULT 60
)
RETURNS TABLE(allowed BOOLEAN, retry_after_seconds INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.support_message_rate_limits;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  INSERT INTO public.support_message_rate_limits (session_id, count, window_start)
  VALUES (p_session_id, 0, v_now)
  ON CONFLICT (session_id) DO NOTHING;

  SELECT * INTO v_row FROM public.support_message_rate_limits WHERE session_id = p_session_id FOR UPDATE;

  IF v_now - v_row.window_start > (p_window_seconds || ' seconds')::INTERVAL THEN
    v_row.count := 0;
    v_row.window_start := v_now;
  END IF;

  IF v_row.count >= p_limit THEN
    UPDATE public.support_message_rate_limits
    SET count = v_row.count, window_start = v_row.window_start
    WHERE session_id = p_session_id;

    RETURN QUERY SELECT
      FALSE,
      CEIL(EXTRACT(EPOCH FROM (v_row.window_start + (p_window_seconds || ' seconds')::INTERVAL - v_now)))::INTEGER;
    RETURN;
  END IF;

  v_row.count := v_row.count + 1;

  UPDATE public.support_message_rate_limits
  SET count = v_row.count, window_start = v_row.window_start
  WHERE session_id = p_session_id;

  RETURN QUERY SELECT TRUE, NULL::INTEGER;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.check_and_increment_support_message_rate_limit(UUID, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_and_increment_support_message_rate_limit(UUID, INTEGER, INTEGER) TO service_role;
