-- Migration: IP blocklist + security event log + admin RPCs
-- Date: 2026-09-03
-- Description: Backs the new Admin Panel > Security Monitor page. Two
--   tables:
--     - security_events : append-only log of suspicious/abusive requests
--       (attack-probe paths, rate-limit hits, etc), written by
--       middleware.ts (Vercel Edge Middleware) and backend endpoints.
--     - blocked_ips      : IP addresses currently denied access, either
--       banned manually by an admin or automatically by the auto-ban
--       logic below after repeated suspicious hits within a short window.
--
--   Everything here follows the existing admin RPC convention from
--   20260625000002_admin_rpc_actions.sql (SECURITY DEFINER, checks
--   auth.uid()'s role in public.users, writes to admin_audit_logs) for
--   the admin-facing functions, PLUS a second class of functions meant to
--   be called only by service_role (middleware/backend), gated the same
--   way as check_and_increment_rate_limit -- REVOKEd from
--   anon/authenticated, GRANTed to service_role only.
--
--   Known limitation (documented for whoever extends this): request IP
--   is read from the x-forwarded-for header set by Vercel's edge network,
--   which is trustworthy on Vercel (clients cannot forge it -- Vercel
--   overwrites this header itself), but if this app is ever proxied
--   through another layer (e.g. Cloudflare in front of Vercel) the header
--   chain needs re-checking so IP bans keep targeting the real client IP
--   and not the proxy's own IP.

-- ─────────────────────────────────────────────────────────────
-- 1. Tables
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.security_events (
  id          BIGSERIAL PRIMARY KEY,
  ip          TEXT NOT NULL,
  path        TEXT,
  method      TEXT,
  event_type  TEXT NOT NULL, -- 'suspicious_path' | 'rate_limit_hit' | 'blocked_request' | 'auth_failure'
  user_agent  TEXT,
  details     JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_security_events_ip_created_at
  ON public.security_events (ip, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_created_at
  ON public.security_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_type
  ON public.security_events (event_type);

ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;
-- No direct policies: reads go through admin_* SECURITY DEFINER
-- functions below (role-checked), writes go through service_role only.

CREATE TABLE IF NOT EXISTS public.blocked_ips (
  id          BIGSERIAL PRIMARY KEY,
  ip          TEXT NOT NULL UNIQUE,
  reason      TEXT NOT NULL,
  banned_by   UUID REFERENCES public.users(id) ON DELETE SET NULL, -- NULL = auto-banned by system
  banned_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ, -- NULL = permanent until manually unbanned
  is_active   BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_blocked_ips_active ON public.blocked_ips (ip) WHERE is_active;

ALTER TABLE public.blocked_ips ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────
-- 2. Service-role-only functions (called from middleware.ts / API code)
-- ─────────────────────────────────────────────────────────────

-- Fast existence check used on (almost) every request. Treats an expired
-- temporary ban as "not blocked" without needing a separate cleanup job.
CREATE OR REPLACE FUNCTION public.is_ip_currently_blocked(p_ip TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.blocked_ips
    WHERE ip = p_ip
      AND is_active
      AND (expires_at IS NULL OR expires_at > NOW())
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_ip_currently_blocked(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_ip_currently_blocked(TEXT) TO service_role;

-- Bulk list for middleware's in-memory cache (refreshed periodically
-- instead of querying per-request -- see middleware.ts). Keeping this
-- list small in practice (active bans only) is what makes the cache
-- approach viable.
CREATE OR REPLACE FUNCTION public.list_active_blocked_ips()
RETURNS TABLE(ip TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT b.ip FROM public.blocked_ips b
  WHERE b.is_active AND (b.expires_at IS NULL OR b.expires_at > NOW());
$$;

REVOKE EXECUTE ON FUNCTION public.list_active_blocked_ips() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_active_blocked_ips() TO service_role;

-- Logs one event and, if this IP has racked up >= p_autoban_threshold
-- suspicious/blocked events within the last p_autoban_window_minutes,
-- automatically bans it for p_autoban_duration_hours. One round trip so
-- middleware doesn't need two separate calls on the hot path.
CREATE OR REPLACE FUNCTION public.log_and_maybe_autoban_ip(
  p_ip                      TEXT,
  p_path                    TEXT,
  p_method                  TEXT,
  p_event_type              TEXT,
  p_user_agent              TEXT DEFAULT NULL,
  p_details                 JSONB DEFAULT NULL,
  p_autoban_threshold       INTEGER DEFAULT 5,
  p_autoban_window_minutes  INTEGER DEFAULT 10,
  p_autoban_duration_hours  INTEGER DEFAULT 24
)
RETURNS TABLE(banned BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recent_count INTEGER;
  v_already_banned BOOLEAN;
BEGIN
  INSERT INTO public.security_events (ip, path, method, event_type, user_agent, details)
  VALUES (p_ip, p_path, p_method, p_event_type, p_user_agent, p_details);

  SELECT EXISTS (
    SELECT 1 FROM public.blocked_ips
    WHERE ip = p_ip AND is_active AND (expires_at IS NULL OR expires_at > NOW())
  ) INTO v_already_banned;

  IF v_already_banned THEN
    RETURN QUERY SELECT TRUE;
    RETURN;
  END IF;

  SELECT COUNT(*) INTO v_recent_count
  FROM public.security_events
  WHERE ip = p_ip
    AND event_type IN ('suspicious_path', 'rate_limit_hit', 'blocked_request')
    AND created_at > NOW() - (p_autoban_window_minutes || ' minutes')::INTERVAL;

  IF v_recent_count >= p_autoban_threshold THEN
    INSERT INTO public.blocked_ips (ip, reason, banned_by, banned_at, expires_at, is_active)
    VALUES (
      p_ip,
      format('Auto-ban: %s kejadian mencurigakan dalam %s menit terakhir', v_recent_count, p_autoban_window_minutes),
      NULL,
      NOW(),
      NOW() + (p_autoban_duration_hours || ' hours')::INTERVAL,
      TRUE
    )
    ON CONFLICT (ip) DO UPDATE SET
      is_active = TRUE,
      reason = EXCLUDED.reason,
      banned_at = NOW(),
      expires_at = NOW() + (p_autoban_duration_hours || ' hours')::INTERVAL,
      banned_by = NULL;

    RETURN QUERY SELECT TRUE;
    RETURN;
  END IF;

  RETURN QUERY SELECT FALSE;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.log_and_maybe_autoban_ip(TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, INTEGER, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_and_maybe_autoban_ip(TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, INTEGER, INTEGER, INTEGER) TO service_role;

-- ─────────────────────────────────────────────────────────────
-- 3. Admin-facing functions (role-checked via auth.uid(), same
--    convention as admin_set_ban / admin_set_premium)
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_list_blocked_ips()
RETURNS SETOF public.blocked_ips
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role TEXT;
BEGIN
  SELECT role INTO v_caller_role FROM public.users WHERE id = auth.uid();
  IF v_caller_role NOT IN ('admin', 'owner') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Hanya admin atau owner yang dapat melakukan aksi ini.';
  END IF;

  RETURN QUERY SELECT * FROM public.blocked_ips ORDER BY banned_at DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_list_blocked_ips() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_blocked_ips() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_ban_ip(
  p_ip          TEXT,
  p_reason      TEXT,
  p_expires_at  TIMESTAMPTZ DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role TEXT;
BEGIN
  SELECT role INTO v_caller_role FROM public.users WHERE id = auth.uid();
  IF v_caller_role NOT IN ('admin', 'owner') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Hanya admin atau owner yang dapat melakukan aksi ini.';
  END IF;

  IF p_ip IS NULL OR length(trim(p_ip)) = 0 THEN
    RAISE EXCEPTION 'IP tidak valid.';
  END IF;

  INSERT INTO public.blocked_ips (ip, reason, banned_by, banned_at, expires_at, is_active)
  VALUES (trim(p_ip), COALESCE(NULLIF(trim(p_reason), ''), 'Diblokir manual oleh admin'), auth.uid(), NOW(), p_expires_at, TRUE)
  ON CONFLICT (ip) DO UPDATE SET
    is_active = TRUE,
    reason = COALESCE(NULLIF(trim(p_reason), ''), 'Diblokir manual oleh admin'),
    banned_by = auth.uid(),
    banned_at = NOW(),
    expires_at = p_expires_at;

  INSERT INTO public.admin_audit_logs (admin_id, target_user_id, action, new_value)
  VALUES (auth.uid(), NULL, 'ban_ip', trim(p_ip));

  RETURN TRUE;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_ban_ip(TEXT, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_ban_ip(TEXT, TEXT, TIMESTAMPTZ) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_unban_ip(p_ip TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role TEXT;
BEGIN
  SELECT role INTO v_caller_role FROM public.users WHERE id = auth.uid();
  IF v_caller_role NOT IN ('admin', 'owner') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Hanya admin atau owner yang dapat melakukan aksi ini.';
  END IF;

  UPDATE public.blocked_ips SET is_active = FALSE WHERE ip = trim(p_ip);

  INSERT INTO public.admin_audit_logs (admin_id, target_user_id, action, new_value)
  VALUES (auth.uid(), NULL, 'unban_ip', trim(p_ip));

  RETURN TRUE;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_unban_ip(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_unban_ip(TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_security_events(
  p_limit       INTEGER DEFAULT 50,
  p_offset      INTEGER DEFAULT 0,
  p_event_type  TEXT DEFAULT 'all',
  p_ip          TEXT DEFAULT NULL
)
RETURNS SETOF public.security_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role TEXT;
BEGIN
  SELECT role INTO v_caller_role FROM public.users WHERE id = auth.uid();
  IF v_caller_role NOT IN ('admin', 'owner') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Hanya admin atau owner yang dapat melakukan aksi ini.';
  END IF;

  RETURN QUERY
  SELECT * FROM public.security_events e
  WHERE (p_event_type = 'all' OR e.event_type = p_event_type)
    AND (p_ip IS NULL OR e.ip = p_ip)
  ORDER BY e.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_list_security_events(INTEGER, INTEGER, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_security_events(INTEGER, INTEGER, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_count_security_events(
  p_event_type  TEXT DEFAULT 'all',
  p_ip          TEXT DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role TEXT;
  v_count BIGINT;
BEGIN
  SELECT role INTO v_caller_role FROM public.users WHERE id = auth.uid();
  IF v_caller_role NOT IN ('admin', 'owner') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Hanya admin atau owner yang dapat melakukan aksi ini.';
  END IF;

  SELECT COUNT(*) INTO v_count FROM public.security_events e
  WHERE (p_event_type = 'all' OR e.event_type = p_event_type)
    AND (p_ip IS NULL OR e.ip = p_ip);

  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_count_security_events(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_count_security_events(TEXT, TEXT) TO authenticated;

-- Summary stats for the top of the Security Monitor page: totals over a
-- period + the noisiest source IPs, similar in spirit to
-- admin_get_error_stats (see AdminErrorMonitor.tsx) so the page follows
-- an already-familiar layout.
CREATE OR REPLACE FUNCTION public.admin_get_security_stats(p_hours INTEGER DEFAULT 24)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role TEXT;
  v_result JSON;
BEGIN
  SELECT role INTO v_caller_role FROM public.users WHERE id = auth.uid();
  IF v_caller_role NOT IN ('admin', 'owner') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Hanya admin atau owner yang dapat melakukan aksi ini.';
  END IF;

  SELECT json_build_object(
    'period_hours', p_hours,
    'total_events', (SELECT COUNT(*) FROM public.security_events WHERE created_at > NOW() - (p_hours || ' hours')::INTERVAL),
    'suspicious_path_count', (SELECT COUNT(*) FROM public.security_events WHERE event_type = 'suspicious_path' AND created_at > NOW() - (p_hours || ' hours')::INTERVAL),
    'rate_limit_hit_count', (SELECT COUNT(*) FROM public.security_events WHERE event_type = 'rate_limit_hit' AND created_at > NOW() - (p_hours || ' hours')::INTERVAL),
    'blocked_request_count', (SELECT COUNT(*) FROM public.security_events WHERE event_type = 'blocked_request' AND created_at > NOW() - (p_hours || ' hours')::INTERVAL),
    'currently_banned_count', (SELECT COUNT(*) FROM public.blocked_ips WHERE is_active AND (expires_at IS NULL OR expires_at > NOW())),
    'top_ips', (
      SELECT COALESCE(json_agg(t), '[]'::json) FROM (
        SELECT ip, COUNT(*) AS event_count
        FROM public.security_events
        WHERE created_at > NOW() - (p_hours || ' hours')::INTERVAL
        GROUP BY ip
        ORDER BY COUNT(*) DESC
        LIMIT 10
      ) t
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_get_security_stats(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_security_stats(INTEGER) TO authenticated;
