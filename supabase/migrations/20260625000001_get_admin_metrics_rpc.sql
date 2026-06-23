-- Migration: Efficient Admin Metrics via Aggregated RPC
-- Date: 2026-06-25
-- Description: Ganti fetch semua baris user hanya untuk hitung metrics.
--              RPC ini return aggregated counts langsung dari DB.

CREATE OR REPLACE FUNCTION public.get_admin_metrics()
RETURNS JSON
SECURITY DEFINER
SET search_path = public
LANGUAGE sql
AS $$
  SELECT json_build_object(
    'totalUsers',   COUNT(*),
    'premiumUsers', COUNT(*) FILTER (WHERE is_premium = TRUE),
    'adminUsers',   COUNT(*) FILTER (WHERE role IN ('admin', 'owner')),
    'bannedUsers',  COUNT(*) FILTER (WHERE is_banned = TRUE)
  )
  FROM public.users;
$$;
