-- Migration: Admin Broadcast — ambil semua telegram_chat_id yang terhubung
-- Date: 2026-06-25

CREATE OR REPLACE FUNCTION public.admin_get_telegram_chat_ids()
RETURNS TABLE (
  user_id      UUID,
  display_name TEXT,
  chat_id      BIGINT
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
  SELECT u.id, u.display_name, u.telegram_chat_id
  FROM public.users u
  WHERE u.telegram_chat_id IS NOT NULL
    AND u.is_banned = FALSE;
END;
$$;
