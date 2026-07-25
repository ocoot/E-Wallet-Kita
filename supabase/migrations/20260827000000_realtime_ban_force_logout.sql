-- Migration: Realtime ban/suspend -> instant force logout
-- Date: 2026-08-27
-- Description: src/contexts/AuthContext.tsx previously only checked
--   `users.is_banned` at SIGNED_IN / INITIAL_SESSION (a fresh login or
--   app open). If an admin suspended a user via AdminUserManager
--   (admin_set_ban RPC) while that user already had an active session
--   open on another device, that device had NO WAY of finding out --
--   `is_banned` isn't enforced by RLS on any data table (transactions,
--   wallets, etc; it's only used to filter push-notification targets and
--   for the admin panel's own display), so the session wasn't going to
--   hit a 403 on its next request either. It would simply keep working
--   until the user happened to close and reopen the app.
--
--   Fix: `public.users` is added to the `supabase_realtime` publication
--   below so AuthContext can subscribe to postgres_changes on the
--   logged-in user's OWN row (filter `id=eq.<uid>`) and force sign-out
--   the instant `is_banned` flips to true. The existing RLS policy
--   "Users can select their own profile" (auth.uid() = id, from
--   20260620000000_init.sql) is what makes this safe to broadcast: a
--   client's realtime subscription is authorized against that same
--   policy, so a user's channel can only ever receive changes to their
--   own row, never another user's.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'users'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.users;
  END IF;
END $$;
