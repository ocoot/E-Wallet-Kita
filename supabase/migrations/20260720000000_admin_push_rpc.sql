-- ─────────────────────────────────────────────────────────────
-- Migration: Admin Push Broadcast — ambil semua FCM token
-- Date: 2026-07-20
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_get_push_tokens()
RETURNS TABLE (
  user_id   UUID,
  fcm_token TEXT
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_role TEXT;
BEGIN
  SELECT role INTO v_role FROM public.users WHERE id = auth.uid();
  IF v_role NOT IN ('admin', 'owner') THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  RETURN QUERY
  SELECT t.user_id, t.fcm_token
  FROM public.user_push_tokens t
  JOIN public.users u ON u.id = t.user_id
  WHERE u.is_banned = FALSE;
END;
$$;
