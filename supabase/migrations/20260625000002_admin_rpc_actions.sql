-- Migration: Secure Admin RPC Actions
-- Date: 2026-06-25
-- Description: Semua aksi admin (toggle premium, ban, role change) 
--              harus lewat RPC SECURITY DEFINER, bukan direct update dari client.

-- RPC 1: Toggle Premium oleh Admin
CREATE OR REPLACE FUNCTION public.admin_set_premium(
  p_target_user_id UUID,
  p_is_premium BOOLEAN
)
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_caller_role TEXT;
  v_target_role TEXT;
BEGIN
  -- Cek role pemanggil
  SELECT role INTO v_caller_role FROM public.users WHERE id = auth.uid();
  IF v_caller_role NOT IN ('admin', 'owner') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Hanya admin atau owner yang dapat melakukan aksi ini.';
  END IF;

  -- Cek role target (owner tidak boleh diubah)
  SELECT role INTO v_target_role FROM public.users WHERE id = p_target_user_id;
  IF v_target_role = 'owner' THEN
    RAISE EXCEPTION 'FORBIDDEN: Status premium owner tidak dapat diubah.';
  END IF;

  UPDATE public.users
  SET is_premium = p_is_premium
  WHERE id = p_target_user_id;

  -- Tulis audit log
  INSERT INTO public.admin_audit_logs (admin_id, target_user_id, action, new_value)
  VALUES (auth.uid(), p_target_user_id, 
    CASE WHEN p_is_premium THEN 'grant_premium' ELSE 'revoke_premium' END,
    p_is_premium::TEXT);

  RETURN TRUE;
END;
$$;

-- RPC 2: Toggle Ban oleh Admin
CREATE OR REPLACE FUNCTION public.admin_set_ban(
  p_target_user_id UUID,
  p_is_banned BOOLEAN
)
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_caller_role TEXT;
  v_target_role TEXT;
BEGIN
  -- Cek role pemanggil
  SELECT role INTO v_caller_role FROM public.users WHERE id = auth.uid();
  IF v_caller_role NOT IN ('admin', 'owner') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Hanya admin atau owner yang dapat melakukan aksi ini.';
  END IF;

  -- Tidak boleh ban diri sendiri
  IF p_target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'FORBIDDEN: Tidak dapat melakukan aksi ini pada diri sendiri.';
  END IF;

  -- Tidak boleh ban owner
  SELECT role INTO v_target_role FROM public.users WHERE id = p_target_user_id;
  IF v_target_role = 'owner' THEN
    RAISE EXCEPTION 'FORBIDDEN: Owner tidak dapat di-suspend.';
  END IF;

  UPDATE public.users
  SET is_banned = p_is_banned
  WHERE id = p_target_user_id;

  -- Tulis audit log
  INSERT INTO public.admin_audit_logs (admin_id, target_user_id, action, new_value)
  VALUES (auth.uid(), p_target_user_id,
    CASE WHEN p_is_banned THEN 'ban' ELSE 'unban' END,
    p_is_banned::TEXT);

  RETURN TRUE;
END;
$$;

-- RPC 3: Toggle Role oleh Admin/Owner
CREATE OR REPLACE FUNCTION public.admin_set_role(
  p_target_user_id UUID,
  p_new_role TEXT
)
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_caller_role TEXT;
  v_target_role TEXT;
BEGIN
  -- Validasi nilai role
  IF p_new_role NOT IN ('user', 'admin') THEN
    RAISE EXCEPTION 'INVALID: Role hanya boleh "user" atau "admin".';
  END IF;

  -- Cek role pemanggil (hanya owner yang boleh ubah role)
  SELECT role INTO v_caller_role FROM public.users WHERE id = auth.uid();
  IF v_caller_role != 'owner' THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Hanya owner yang dapat mengubah role pengguna.';
  END IF;

  -- Tidak boleh ubah diri sendiri
  IF p_target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'FORBIDDEN: Tidak dapat mengubah role diri sendiri.';
  END IF;

  -- Tidak boleh ubah owner lain
  SELECT role INTO v_target_role FROM public.users WHERE id = p_target_user_id;
  IF v_target_role = 'owner' THEN
    RAISE EXCEPTION 'FORBIDDEN: Role owner tidak dapat diubah.';
  END IF;

  UPDATE public.users
  SET role = p_new_role
  WHERE id = p_target_user_id;

  -- Tulis audit log
  INSERT INTO public.admin_audit_logs (admin_id, target_user_id, action, old_value, new_value)
  VALUES (auth.uid(), p_target_user_id, 'set_role', v_target_role, p_new_role);

  RETURN TRUE;
END;
$$;
