-- Migration: DB-level enforcement of is_banned on financial tables
-- Date: 2026-08-28
-- Description: Follow-up to 20260827000000_realtime_ban_force_logout.sql.
--   That migration made an ALREADY-OPEN session log itself out the instant
--   an admin flips is_banned -- but that is still purely a CLIENT-side
--   reaction (AuthContext calling supabase.auth.signOut() after a realtime
--   event). Nothing on the database itself was ever checking is_banned:
--   every RLS policy on transactions/wallets/budgets/etc. only checks
--   "does this row belong to auth.uid()", never "is auth.uid() currently
--   banned". That means a banned account whose device is offline when the
--   ban happens, or whose still-valid JWT is replayed directly against the
--   API (bypassing the app's UI/JS entirely), could keep writing data
--   indefinitely -- the client-side signOut has nothing to enforce against
--   in that case.
--
--   Fix: a single SECURITY DEFINER helper (is_current_user_banned) plus a
--   BEFORE INSERT OR UPDATE OR DELETE trigger, attached to every table
--   that represents a user-initiated financial action. The trigger (not
--   rewritten RLS policies) is deliberately the enforcement point here:
--   there are 60+ existing RLS policies accumulated across many
--   migrations for these tables, and editing each one's USING/WITH CHECK
--   clause individually would be high-risk (easy to miss one, or to
--   subtly change what a policy already allows). A single trigger
--   function attached uniformly is one place to audit, and doesn't touch
--   any existing policy at all.
--
--   Scope: only tables representing money movement / financial-account
--   usage (transactions, wallets, budgets, bill_reminders, installments,
--   savings & gold pockets + their entries). Deliberately NOT applied to
--   public.users itself (would risk interfering with the admin_set_ban
--   RPC's own UPDATE, and profile fields like display_name/theme aren't
--   a "financial action"), and not to receipt_drafts / voucher claims in
--   this pass -- kept to the core finance surface the report was about.
--
--   Known limitation (unchanged from before this migration, noted for
--   whoever picks this up next): auth.uid() is only set for requests
--   carrying a user JWT. Backend jobs that use the service_role key
--   (Telegram webhook, bill-reminder cron) run with auth.uid() = NULL,
--   so this trigger does not (and structurally cannot, via RLS/triggers
--   alone) stop THOSE paths from writing on behalf of a banned user --
--   they would need their own explicit is_banned check in application
--   code (api/telegram-webhook.ts, the cron job) if that's ever needed.

-- ─────────────────────────────────────────────────────────────
-- 1. Helper: is the currently authenticated user banned right now?
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_current_user_banned()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_banned FROM public.users WHERE id = auth.uid()),
    FALSE
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_current_user_banned() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_current_user_banned() TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- 2. Trigger function: reject the write with a recognizable error code
--    if the calling session belongs to a banned user. NULL auth.uid()
--    (service_role / cron / no JWT context) is NOT banned by definition
--    -- see "Known limitation" above -- so those paths pass through
--    untouched, same as before this migration.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reject_write_if_banned()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_current_user_banned() THEN
    RAISE EXCEPTION 'ACCOUNT_SUSPENDED: Akun ini sedang ditangguhkan dan tidak dapat melakukan perubahan data.'
      USING ERRCODE = 'P0001';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- 3. Attach to every table that represents a user-initiated financial
--    action. DROP + CREATE (not CREATE OR REPLACE TRIGGER) to match the
--    idempotent DROP POLICY IF EXISTS / CREATE POLICY convention already
--    used throughout this codebase's migrations.
-- ─────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_reject_write_if_banned ON public.transactions;
CREATE TRIGGER trg_reject_write_if_banned
  BEFORE INSERT OR UPDATE OR DELETE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.reject_write_if_banned();

DROP TRIGGER IF EXISTS trg_reject_write_if_banned ON public.wallets;
CREATE TRIGGER trg_reject_write_if_banned
  BEFORE INSERT OR UPDATE OR DELETE ON public.wallets
  FOR EACH ROW EXECUTE FUNCTION public.reject_write_if_banned();

DROP TRIGGER IF EXISTS trg_reject_write_if_banned ON public.budgets;
CREATE TRIGGER trg_reject_write_if_banned
  BEFORE INSERT OR UPDATE OR DELETE ON public.budgets
  FOR EACH ROW EXECUTE FUNCTION public.reject_write_if_banned();

DROP TRIGGER IF EXISTS trg_reject_write_if_banned ON public.bill_reminders;
CREATE TRIGGER trg_reject_write_if_banned
  BEFORE INSERT OR UPDATE OR DELETE ON public.bill_reminders
  FOR EACH ROW EXECUTE FUNCTION public.reject_write_if_banned();

DROP TRIGGER IF EXISTS trg_reject_write_if_banned ON public.installments;
CREATE TRIGGER trg_reject_write_if_banned
  BEFORE INSERT OR UPDATE OR DELETE ON public.installments
  FOR EACH ROW EXECUTE FUNCTION public.reject_write_if_banned();

DROP TRIGGER IF EXISTS trg_reject_write_if_banned ON public.savings_pockets;
CREATE TRIGGER trg_reject_write_if_banned
  BEFORE INSERT OR UPDATE OR DELETE ON public.savings_pockets
  FOR EACH ROW EXECUTE FUNCTION public.reject_write_if_banned();

DROP TRIGGER IF EXISTS trg_reject_write_if_banned ON public.savings_pocket_entries;
CREATE TRIGGER trg_reject_write_if_banned
  BEFORE INSERT OR UPDATE OR DELETE ON public.savings_pocket_entries
  FOR EACH ROW EXECUTE FUNCTION public.reject_write_if_banned();

DROP TRIGGER IF EXISTS trg_reject_write_if_banned ON public.gold_pockets;
CREATE TRIGGER trg_reject_write_if_banned
  BEFORE INSERT OR UPDATE OR DELETE ON public.gold_pockets
  FOR EACH ROW EXECUTE FUNCTION public.reject_write_if_banned();

DROP TRIGGER IF EXISTS trg_reject_write_if_banned ON public.gold_pocket_entries;
CREATE TRIGGER trg_reject_write_if_banned
  BEFORE INSERT OR UPDATE OR DELETE ON public.gold_pocket_entries
  FOR EACH ROW EXECUTE FUNCTION public.reject_write_if_banned();
