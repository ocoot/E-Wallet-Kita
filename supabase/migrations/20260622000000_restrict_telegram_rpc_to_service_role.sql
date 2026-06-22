-- Restrict all Telegram bot RPC functions to service_role only
-- This migration revokes public/anon/authenticated access and grants service_role

REVOKE EXECUTE ON FUNCTION public.link_telegram_user(TEXT, BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.link_telegram_user(TEXT, BIGINT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.confirm_and_insert_telegram_tx(BIGINT, DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_and_insert_telegram_tx(BIGINT, DATE) TO service_role;

REVOKE EXECUTE ON FUNCTION public.delete_last_telegram_transaction(BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_last_telegram_transaction(BIGINT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.delete_pending_telegram_tx(BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_pending_telegram_tx(BIGINT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_telegram_recent_transactions(BIGINT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_telegram_recent_transactions(BIGINT, INTEGER) TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_telegram_user_summary_v2(BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_telegram_user_summary_v2(BIGINT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_user_by_telegram_chat_id(BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_by_telegram_chat_id(BIGINT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.set_telegram_language(BIGINT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_telegram_language(BIGINT, TEXT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.unlink_telegram_user(BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.unlink_telegram_user(BIGINT) TO service_role;

-- Deprecated but still present in the database (superseded by get_telegram_user_summary_v2,
-- not called anywhere in current code, but locking it down too since it still exists):
REVOKE EXECUTE ON FUNCTION public.get_telegram_user_summary(BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_telegram_user_summary(BIGINT) TO service_role;

-- NOTE: insert_telegram_transaction and upsert_pending_telegram_tx and
-- get_pending_telegram_tx and cleanup_expired_pending_transactions also
-- exist and should be locked down — see the full list below if you haven't
-- run those yet.
REVOKE EXECUTE ON FUNCTION public.insert_telegram_transaction(BIGINT, TEXT, TEXT, NUMERIC, TEXT, DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.insert_telegram_transaction(BIGINT, TEXT, TEXT, NUMERIC, TEXT, DATE) TO service_role;

REVOKE EXECUTE ON FUNCTION public.upsert_pending_telegram_tx(BIGINT, TEXT, TEXT, NUMERIC, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_pending_telegram_tx(BIGINT, TEXT, TEXT, NUMERIC, TEXT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_pending_telegram_tx(BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_pending_telegram_tx(BIGINT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.cleanup_expired_pending_transactions() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_pending_transactions() TO service_role;