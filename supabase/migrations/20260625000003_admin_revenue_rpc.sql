-- Migration: Revenue & Premium Transaction Monitor RPCs
-- Date: 2026-06-25

-- RPC 1: Revenue metrics untuk admin panel
CREATE OR REPLACE FUNCTION public.get_admin_revenue_metrics()
RETURNS JSON
SECURITY DEFINER
SET search_path = public
LANGUAGE sql
AS $$
  SELECT json_build_object(
    'totalRevenue',      COALESCE(SUM(total_amount) FILTER (WHERE status = 'SUCCESS'), 0),
    'totalTransactions', COUNT(*),
    'successCount',      COUNT(*) FILTER (WHERE status = 'SUCCESS'),
    'pendingCount',      COUNT(*) FILTER (WHERE status = 'PENDING'),
    'expiredCount',      COUNT(*) FILTER (WHERE status = 'EXPIRED'),
    'failedCount',       COUNT(*) FILTER (WHERE status = 'FAILED')
  )
  FROM public.premium_transactions;
$$;

-- RPC 2: List semua premium transactions untuk admin (dengan pagination)
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
  SELECT role INTO v_caller_role FROM public.users WHERE id = auth.uid();
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

-- RPC 3: Hitung total rows untuk pagination
CREATE OR REPLACE FUNCTION public.admin_count_premium_transactions(
  p_status TEXT DEFAULT 'all'
)
RETURNS INT
SECURITY DEFINER
SET search_path = public
LANGUAGE sql
AS $$
  SELECT COUNT(*)::INT
  FROM public.premium_transactions
  WHERE (p_status = 'all' OR status = p_status);
$$;
