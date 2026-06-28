-- Migration: Fix "column reference \"id\" is ambiguous" di admin_get_premium_transactions
-- Date: 2026-06-26 (disusulkan setelah ditemukan lewat audit -- root cause
-- sebenarnya berasal dari migration 20260625000003_admin_revenue_rpc.sql)
--
-- Root cause:
--   admin_get_premium_transactions() punya RETURNS TABLE (id UUID, ...).
--   Di PL/pgSQL, setiap kolom RETURNS TABLE otomatis jadi variabel OUT
--   bernama sama yang berlaku di seluruh body fungsi. Body fungsi ini
--   punya baris:
--
--       SELECT role INTO v_caller_role FROM public.users WHERE id = auth.uid();
--
--   "id" di WHERE clause itu ambigu: bisa merujuk ke kolom users.id ATAU
--   ke variabel OUT "id" dari RETURNS TABLE. PostgreSQL menolak query ini
--   dengan error "column reference \"id\" is ambiguous" -- inilah yang
--   muncul di Admin Panel > Monitoring Premium saat memuat daftar
--   transaksi premium.
--
-- Fix: qualify "id" dengan alias tabel (u2.id) supaya tidak ambigu lagi.
-- Tidak ada perubahan behavior lain -- query & RETURNS TABLE tetap sama.

CREATE OR REPLACE FUNCTION public.admin_get_premium_transactions(
  p_limit  INT DEFAULT 20,
  p_offset INT DEFAULT 0,
  p_status TEXT DEFAULT 'all'
)
RETURNS TABLE (
  id           UUID,
  user_id      UUID,
  display_name TEXT,
  email        TEXT,
  order_id     TEXT,
  amount       INT,
  total_amount INT,
  status       TEXT,
  is_sandbox   BOOLEAN,
  paid_at      TIMESTAMPTZ,
  expired_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_caller_role TEXT;
BEGIN
  -- Pakai alias (u2.id) -- bare "id" ambigu karena RETURNS TABLE di
  -- fungsi ini juga punya kolom OUT bernama "id" (lihat root cause di
  -- atas). Ini akar penyebab error "column reference \"id\" is ambiguous"
  -- di Admin Panel - Monitoring Premium.
  SELECT u2.role INTO v_caller_role FROM public.users u2 WHERE u2.id = auth.uid();
  IF v_caller_role NOT IN ('admin', 'owner') THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  RETURN QUERY
  SELECT
    pt.id,
    pt.user_id,
    u.display_name,
    u.email,
    pt.order_id,
    pt.amount,
    pt.total_amount,
    pt.status,
    pt.is_sandbox,
    pt.paid_at,
    pt.expired_at,
    pt.created_at
  FROM public.premium_transactions pt
  LEFT JOIN public.users u ON u.id = pt.user_id
  WHERE (p_status = 'all' OR pt.status = p_status)
  ORDER BY pt.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

COMMENT ON FUNCTION public.admin_get_premium_transactions IS
    'List premium_transactions untuk Admin Panel - Monitoring Premium, dengan pagination. Fixed: ambiguous column reference "id" (lihat migration 20260626000001 untuk root cause).';
