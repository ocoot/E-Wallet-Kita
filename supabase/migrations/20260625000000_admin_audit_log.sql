-- Migration: Admin Audit Log Table
-- Date: 2026-06-25
-- Description: Mencatat semua aksi admin untuk akuntabilitas dan debugging.

CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id        UUID        NOT NULL REFERENCES public.users(id) ON DELETE SET NULL,
  target_user_id  UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  action          TEXT        NOT NULL,
  -- action values: 'grant_premium' | 'revoke_premium' | 'ban' | 'unban' | 'set_role'
  old_value       TEXT,
  new_value       TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index untuk query cepat by admin atau by target user
CREATE INDEX IF NOT EXISTS idx_audit_admin_id        ON public.admin_audit_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_audit_target_user_id  ON public.admin_audit_logs(target_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_created_at      ON public.admin_audit_logs(created_at DESC);

-- Aktifkan RLS
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

-- Hanya owner & admin yang bisa baca audit log
CREATE POLICY "Admins can read audit logs"
  ON public.admin_audit_logs FOR SELECT
  USING (public.is_admin_or_owner());

-- Insert hanya via service role / SECURITY DEFINER RPC (tidak dari client langsung)
REVOKE INSERT, UPDATE, DELETE ON public.admin_audit_logs FROM anon, authenticated;
