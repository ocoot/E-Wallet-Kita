-- Migration: DB-backed rate limiting & Telegram update dedup
-- Date: 2026-07-12
-- Description: api/telegram-webhook.ts and api/parse-transaction.ts used
--   plain in-memory `Map`s (processedTelegramUpdates, linkRateLimiter,
--   rateLimiter) to dedupe Telegram retries and rate-limit users. On
--   Vercel, each serverless invocation can land on a fresh container with
--   empty memory, so none of that state was reliable: duplicate Telegram
--   retries could slip through and get processed twice, the /link brute
--   force lockout could be bypassed by simply landing on a new instance,
--   and per-user AI rate limits could be exceeded by a few multiples
--   depending on how many warm instances were alive. This migration moves
--   all three to Postgres, where a single row (locked with `FOR UPDATE` /
--   `INSERT ... ON CONFLICT`) makes the check-and-update atomic regardless
--   of which serverless instance handles the request.

-- ─────────────────────────────────────────────────────────────
-- 1. Telegram update dedup (replaces `processedTelegramUpdates` Map)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.telegram_processed_updates (
  update_id    BIGINT      PRIMARY KEY,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_telegram_processed_updates_processed_at
  ON public.telegram_processed_updates (processed_at);

ALTER TABLE public.telegram_processed_updates ENABLE ROW LEVEL SECURITY;
-- No policies for anon/authenticated on purpose — this table is only ever
-- touched by the webhook via the service role, through the RPC below.

-- Atomically records an update_id as seen and reports whether it was new.
-- Returns TRUE if this is the first time we've seen p_update_id (caller
-- should process it), FALSE if it's a duplicate (caller should ignore it).
-- The INSERT ... ON CONFLICT is what makes this safe under concurrent
-- requests for the same update_id (e.g. two near-simultaneous Telegram
-- retries) — only one of them can win the insert.
CREATE OR REPLACE FUNCTION public.check_and_mark_telegram_update(p_update_id BIGINT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows INTEGER;
BEGIN
  INSERT INTO public.telegram_processed_updates (update_id)
  VALUES (p_update_id)
  ON CONFLICT (update_id) DO NOTHING;

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  -- Best-effort housekeeping so this table doesn't grow forever. Cheap:
  -- indexed on processed_at, and this mirrors the existing pattern of
  -- inline cleanup already used by cleanup_expired_pending_transactions().
  DELETE FROM public.telegram_processed_updates
  WHERE processed_at < NOW() - INTERVAL '20 minutes';

  RETURN v_rows > 0;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.check_and_mark_telegram_update(BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_and_mark_telegram_update(BIGINT) TO service_role;

-- ─────────────────────────────────────────────────────────────
-- 2. /link brute-force lockout (replaces `linkRateLimiter` Map)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.telegram_link_attempts (
  chat_id      BIGINT      PRIMARY KEY,
  attempts     INTEGER     NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.telegram_link_attempts ENABLE ROW LEVEL SECURITY;
-- Service role only, same rationale as above.

-- Returns the active lockout timestamp for this chat, or NULL if it isn't
-- currently locked out (never failed enough, or a previous lock expired).
CREATE OR REPLACE FUNCTION public.get_telegram_link_lockout(p_chat_id BIGINT)
RETURNS TIMESTAMPTZ
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT locked_until
  FROM public.telegram_link_attempts
  WHERE chat_id = p_chat_id
    AND locked_until IS NOT NULL
    AND locked_until > NOW();
$$;

-- Records the outcome of one /link attempt for a chat.
-- - On success: clears all attempt state for that chat (fresh start).
-- - On failure: increments the attempt counter; once it reaches
--   p_max_attempts, (re-)applies a p_lockout_seconds lockout. This mirrors
--   the original in-memory logic exactly, including that a lock, once
--   triggered, re-applies on the very next failed attempt after it
--   expires (attempts are only ever reset by a successful link).
CREATE OR REPLACE FUNCTION public.record_telegram_link_attempt(
  p_chat_id         BIGINT,
  p_success         BOOLEAN,
  p_max_attempts    INTEGER DEFAULT 5,
  p_lockout_seconds INTEGER DEFAULT 900
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_attempts INTEGER;
BEGIN
  IF p_success THEN
    DELETE FROM public.telegram_link_attempts WHERE chat_id = p_chat_id;
    RETURN;
  END IF;

  INSERT INTO public.telegram_link_attempts AS t (chat_id, attempts, updated_at)
  VALUES (p_chat_id, 1, NOW())
  ON CONFLICT (chat_id) DO UPDATE
    SET attempts = t.attempts + 1,
        updated_at = NOW()
  RETURNING attempts INTO v_new_attempts;

  IF v_new_attempts >= p_max_attempts THEN
    UPDATE public.telegram_link_attempts
    SET locked_until = NOW() + (p_lockout_seconds || ' seconds')::INTERVAL
    WHERE chat_id = p_chat_id;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_telegram_link_lockout(BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_telegram_link_lockout(BIGINT) TO service_role;
REVOKE EXECUTE ON FUNCTION public.record_telegram_link_attempt(BIGINT, BOOLEAN, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_telegram_link_attempt(BIGINT, BOOLEAN, INTEGER, INTEGER) TO service_role;

-- ─────────────────────────────────────────────────────────────
-- 3. Per-user AI/parse rate limiting (replaces `rateLimiter` Map in
--    api/parse-transaction.ts)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.api_rate_limits (
  user_id         UUID        PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  count           INTEGER     NOT NULL DEFAULT 0,
  window_start    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ai_count        INTEGER     NOT NULL DEFAULT 0,
  ai_window_start TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.api_rate_limits ENABLE ROW LEVEL SECURITY;
-- Service role only — clients never touch this table directly.

-- Atomically checks AND increments both the regular and AI rate-limit
-- counters for one user in a single round trip, locking the row with
-- `FOR UPDATE` so two concurrent requests from the same user can't both
-- read a stale count and both be admitted past the limit.
CREATE OR REPLACE FUNCTION public.check_and_increment_parse_rate_limit(
  p_user_id           UUID,
  p_will_use_ai       BOOLEAN,
  p_limit             INTEGER DEFAULT 10,
  p_window_seconds    INTEGER DEFAULT 60,
  p_ai_limit          INTEGER DEFAULT 5,
  p_ai_window_seconds INTEGER DEFAULT 60
)
RETURNS TABLE(allowed BOOLEAN, reason TEXT, retry_after_seconds INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.api_rate_limits;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  INSERT INTO public.api_rate_limits (user_id, count, window_start, ai_count, ai_window_start)
  VALUES (p_user_id, 0, v_now, 0, v_now)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO v_row FROM public.api_rate_limits WHERE user_id = p_user_id FOR UPDATE;

  -- Roll each window forward independently if it has elapsed, same as the
  -- old Map-based "lastReset"/"lastAiReset" logic.
  IF v_now - v_row.window_start > (p_window_seconds || ' seconds')::INTERVAL THEN
    v_row.count := 0;
    v_row.window_start := v_now;
  END IF;
  IF v_now - v_row.ai_window_start > (p_ai_window_seconds || ' seconds')::INTERVAL THEN
    v_row.ai_count := 0;
    v_row.ai_window_start := v_now;
  END IF;

  IF v_row.count >= p_limit THEN
    UPDATE public.api_rate_limits
    SET count = v_row.count, window_start = v_row.window_start
    WHERE user_id = p_user_id;

    RETURN QUERY SELECT
      FALSE,
      'rate_limit'::TEXT,
      CEIL(EXTRACT(EPOCH FROM (v_row.window_start + (p_window_seconds || ' seconds')::INTERVAL - v_now)))::INTEGER;
    RETURN;
  END IF;

  IF p_will_use_ai AND v_row.ai_count >= p_ai_limit THEN
    UPDATE public.api_rate_limits
    SET count = v_row.count, window_start = v_row.window_start,
        ai_count = v_row.ai_count, ai_window_start = v_row.ai_window_start
    WHERE user_id = p_user_id;

    RETURN QUERY SELECT
      FALSE,
      'ai_rate_limit'::TEXT,
      CEIL(EXTRACT(EPOCH FROM (v_row.ai_window_start + (p_ai_window_seconds || ' seconds')::INTERVAL - v_now)))::INTEGER;
    RETURN;
  END IF;

  v_row.count := v_row.count + 1;
  IF p_will_use_ai THEN
    v_row.ai_count := v_row.ai_count + 1;
  END IF;

  UPDATE public.api_rate_limits
  SET count = v_row.count, window_start = v_row.window_start,
      ai_count = v_row.ai_count, ai_window_start = v_row.ai_window_start
  WHERE user_id = p_user_id;

  RETURN QUERY SELECT TRUE, NULL::TEXT, NULL::INTEGER;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.check_and_increment_parse_rate_limit(UUID, BOOLEAN, INTEGER, INTEGER, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_and_increment_parse_rate_limit(UUID, BOOLEAN, INTEGER, INTEGER, INTEGER, INTEGER) TO service_role;
