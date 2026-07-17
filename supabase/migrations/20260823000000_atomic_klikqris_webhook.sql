-- Migration: Atomic KlikQRIS webhook processing
-- Date: 2026-08-23
-- Description: api/premium/payment.ts (PUT handler) previously did
--   check-then-act across 3 separate sequential awaits (select tx ->
--   update premium_transactions -> update users) before responding to
--   KlikQRIS. This had two problems:
--     1. Response blocking: 3 round trips before res.status(200), risking
--        timeout if the DB is briefly slow (KlikQRIS treats timeout as
--        failure -> retries -> since we always ack 200 on error, the
--        retry would repeat the same slow path).
--     2. Race condition: two near-simultaneous webhook deliveries for the
--        same order_id could both read status != 'SUCCESS' before either
--        write landed, both attempting to grant premium (idempotent in
--        effect here, but wasteful and unsafe if logic ever grows to
--        include side effects that aren't naturally idempotent, e.g.
--        sending a "you're premium now" push notification twice).
--   This mirrors the pattern already used for Telegram update dedup
--   (see 20260712000000_db_backed_rate_limiting_and_dedup.sql): move the
--   whole check-and-update into a single SECURITY DEFINER function that
--   locks the row with FOR UPDATE, so the entire operation is atomic and
--   takes one round trip instead of three.

CREATE OR REPLACE FUNCTION public.process_klikqris_webhook(
  p_order_id  TEXT,
  p_signature TEXT,
  p_status    TEXT
)
RETURNS TABLE(outcome TEXT, tx_user_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tx public.premium_transactions;
BEGIN
  -- Lock the row so a concurrent delivery for the same order_id has to
  -- wait for this one to finish (and will then see the updated status).
  SELECT * INTO v_tx
  FROM public.premium_transactions
  WHERE order_id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'NOT_FOUND'::TEXT, NULL::UUID;
    RETURN;
  END IF;

  IF v_tx.signature IS DISTINCT FROM p_signature THEN
    RETURN QUERY SELECT 'SIGNATURE_MISMATCH'::TEXT, v_tx.user_id;
    RETURN;
  END IF;

  -- Idempotency guard: duplicate delivery for an already-settled order.
  IF v_tx.status = 'SUCCESS' THEN
    RETURN QUERY SELECT 'ALREADY_SUCCESS'::TEXT, v_tx.user_id;
    RETURN;
  END IF;

  IF p_status IN ('PAID', 'SUCCESS') THEN
    UPDATE public.premium_transactions
    SET status = 'SUCCESS', paid_at = NOW(), updated_at = NOW()
    WHERE order_id = p_order_id;

    UPDATE public.users
    SET is_premium = TRUE, premium_paid_at = NOW()
    WHERE id = v_tx.user_id;

    RETURN QUERY SELECT 'MARKED_SUCCESS'::TEXT, v_tx.user_id;
    RETURN;
  ELSIF p_status = 'EXPIRED' THEN
    UPDATE public.premium_transactions
    SET status = 'EXPIRED', updated_at = NOW()
    WHERE order_id = p_order_id;

    RETURN QUERY SELECT 'MARKED_EXPIRED'::TEXT, v_tx.user_id;
    RETURN;
  END IF;

  -- Unknown/irrelevant status payload (e.g. a heartbeat) — nothing to do.
  RETURN QUERY SELECT 'NOOP'::TEXT, v_tx.user_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.process_klikqris_webhook(TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_klikqris_webhook(TEXT, TEXT, TEXT) TO service_role;
