-- Migration: Support Admin Panel and User Roles
-- Date: 2026-06-24
-- Description: Add role and is_banned to public.users and update RLS policies for Admins/Owners

-- 1. Add columns to public.users
ALTER TABLE public.users 
    ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user' CHECK (role IN ('owner', 'admin', 'user')),
    ADD COLUMN IF NOT EXISTS is_banned BOOLEAN DEFAULT FALSE;

-- 2. Ensure initial owner exists
-- NOTE: We can seed the current user or specific email as owner/admin if needed,
-- but normally the first user can be promoted in Supabase dashboard or via helper.
-- Here we'll make sure there are no infinite recursion issues in policies.

-- 3. Create helper function security definer to avoid RLS policy recursion
CREATE OR REPLACE FUNCTION public.is_admin_or_owner()
RETURNS BOOLEAN SECURITY DEFINER AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role IN ('admin', 'owner')
  );
END;
$$ LANGUAGE plpgsql;

-- 4. Re-configure RLS policies on public.users
DROP POLICY IF EXISTS "Users can select their own profile" ON public.users;
DROP POLICY IF EXISTS "Admins can select all users" ON public.users;

CREATE POLICY "Users can select their own profile" ON public.users FOR SELECT
    USING (auth.uid() = id OR public.is_admin_or_owner());

DROP POLICY IF EXISTS "Users can update their own profile" ON public.users;
DROP POLICY IF EXISTS "Admins can update all users" ON public.users;

CREATE POLICY "Users can update their own profile" ON public.users FOR UPDATE
    USING (auth.uid() = id OR public.is_admin_or_owner());
