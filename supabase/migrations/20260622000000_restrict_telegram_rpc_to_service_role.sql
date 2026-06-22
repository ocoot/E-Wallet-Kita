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

-- Also including the deprecated ones just in case:
REVOKE EXECUTE ON FUNCTION public.get_telegram_user_summary(BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_telegram_user_summary(BIGINT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_telegram_user_by_chat_id(BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_telegram_user_by_chat_id(BIGINT) TO service_role;

-- Note: Other functions might exist, ensure all are covered.
