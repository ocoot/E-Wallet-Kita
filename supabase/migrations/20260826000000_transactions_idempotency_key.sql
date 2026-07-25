-- Migration: Idempotency key for transaction creation
-- Date: 2026-08-26
-- Description: src/lib/db.ts#saveTransaction is called directly from the
--   client (RLS-scoped insert, no server-side endpoint in front of it) from
--   NewTransaction.tsx's confirm flow. On flaky mobile connections the
--   underlying request can be retried (by the browser/fetch layer, or by a
--   user who double-taps "Simpan" before the button's disabled state has
--   re-rendered) without any change in payload, which previously produced
--   two identical rows for what the user experienced as a single save.
--   UI-level disabling (isLoading) only protects against a re-render race
--   won by React, not a network-level retry of the exact same request.
--
--   Fix: the client now generates one idempotency key per "confirm & save"
--   attempt (see src/views/NewTransaction.tsx) and sends it along with the
--   insert. A unique index on (user_id, idempotency_key) makes a duplicate
--   insert with the same key fail atomically at the database level
--   regardless of which serverless/browser retry wins the race; saveTransaction
--   catches that unique-violation and returns the row that already exists
--   instead of surfacing an error, so a retried request is a no-op from the
--   user's perspective rather than a duplicate transaction or a failure.

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

-- Partial unique index: only enforced when an idempotency_key was actually
-- supplied, so older rows (and any future insert paths that don't pass one,
-- e.g. server-side flows like topup/transfer/bill/installment postings)
-- remain unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_user_idempotency_key
  ON public.transactions (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

COMMENT ON COLUMN public.transactions.idempotency_key IS
  'Client-generated key (UUID) identifying one logical "save" attempt from '
  'the transaction form. Used to make retried/duplicate inserts (double-tap, '
  'network retry) idempotent -- see saveTransaction() in src/lib/db.ts.';
