-- Migration: Fix 5 missing RPC functions that telegram-webhook.ts calls
-- Date: 2026-07-03
--
-- Root cause audit:
-- telegram-webhook.ts memanggil 5 RPC yang TIDAK ADA di database:
--
--   1. confirm_pending_telegram_tx(p_chat_id)
--      → DB punya: confirm_and_insert_telegram_tx(p_chat_id, p_date)
--        (nama berbeda, plus ada param p_date yang tidak dikirim webhook)
--
--   2. update_pending_telegram_tx_category(p_chat_id, p_category_key)
--      → Tidak ada sama sekali di DB
--
--   3. cancel_pending_telegram_tx(p_chat_id)
--      → DB punya: delete_pending_telegram_tx(p_chat_id) tapi nama berbeda
--
--   4. link_telegram_account(p_chat_id, p_link_code)
--      → DB punya: link_telegram_user(p_code, p_chat_id)
--        (nama berbeda DAN urutan/nama param berbeda)
--
--   5. get_dashboard_summary(p_user_id)
--      → DB punya: get_telegram_user_summary_v2(p_chat_id) tapi:
--        - param berbeda (p_user_id vs p_chat_id)
--        - nama kolom return berbeda:
--          DB:      total_income, total_expense, net_balance, prev_total_income, prev_total_expense
--          Webhook: income_total, expense_total, balance, prev_income_total, prev_expense_total
--
-- Solusi: Buat wrapper function baru dengan nama & signature yang dipakai
-- webhook, mendelegasikan ke implementasi yang sudah ada di DB.
-- Tidak mengubah function lama agar tidak merusak caller lain.


-- ============================================================
-- 1. confirm_pending_telegram_tx
--    Wrapper dari confirm_and_insert_telegram_tx dengan p_date = CURRENT_DATE
--    sehingga webhook cukup mengirim p_chat_id saja.
-- ============================================================
CREATE OR REPLACE FUNCTION public.confirm_pending_telegram_tx(
  p_chat_id BIGINT
)
RETURNS VOID
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_id UUID;
  v_pending RECORD;
BEGIN
  -- Cari user
  SELECT u.id INTO v_user_id
  FROM public.users u
  WHERE u.telegram_chat_id = p_chat_id
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'USER_NOT_FOUND';
  END IF;

  -- Klaim atomik: DELETE + RETURNING dalam satu statement
  -- Hanya satu request yang berhasil klaim (race-condition safe)
  DELETE FROM public.telegram_pending_transactions t
  WHERE t.chat_id = p_chat_id
  RETURNING t.chat_id, t.type, t.category_key, t.amount, t.original_text
  INTO v_pending;

  IF v_pending IS NULL THEN
    RAISE EXCEPTION 'ALREADY_CONFIRMED_OR_EXPIRED';
  END IF;

  -- Insert ke tabel transaksi aktif
  INSERT INTO public.transactions (
    user_id,
    type,
    category,
    amount,
    note,
    source,
    transaction_date
  ) VALUES (
    v_user_id,
    v_pending.type,
    v_pending.category_key,
    v_pending.amount,
    v_pending.original_text,
    'telegram',
    CURRENT_DATE
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.confirm_pending_telegram_tx(BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_pending_telegram_tx(BIGINT) TO service_role;


-- ============================================================
-- 2. update_pending_telegram_tx_category
--    UPDATE category_key pada baris pending untuk p_chat_id.
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_pending_telegram_tx_category(
  p_chat_id     BIGINT,
  p_category_key TEXT
)
RETURNS VOID
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.telegram_pending_transactions
  SET category_key = p_category_key
  WHERE chat_id = p_chat_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PENDING_NOT_FOUND';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_pending_telegram_tx_category(BIGINT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_pending_telegram_tx_category(BIGINT, TEXT) TO service_role;


-- ============================================================
-- 3. cancel_pending_telegram_tx
--    Alias dari delete_pending_telegram_tx (nama yang dipakai webhook berbeda).
-- ============================================================
CREATE OR REPLACE FUNCTION public.cancel_pending_telegram_tx(
  p_chat_id BIGINT
)
RETURNS VOID
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM public.telegram_pending_transactions
  WHERE chat_id = p_chat_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cancel_pending_telegram_tx(BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_pending_telegram_tx(BIGINT) TO service_role;


-- ============================================================
-- 4. link_telegram_account
--    Webhook memanggil: link_telegram_account(p_chat_id, p_link_code)
--    DB punya:          link_telegram_user(p_code, p_chat_id)
--    Wrapper ini menyesuaikan nama & urutan parameter.
-- ============================================================
CREATE OR REPLACE FUNCTION public.link_telegram_account(
  p_chat_id   BIGINT,
  p_link_code TEXT
)
RETURNS TABLE (
  success      BOOLEAN,
  message      TEXT,
  user_id      UUID,
  display_name TEXT
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
    SELECT lt.success, lt.message, lt.user_id, lt.display_name
    FROM public.link_telegram_user(p_link_code, p_chat_id) AS lt;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.link_telegram_account(BIGINT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.link_telegram_account(BIGINT, TEXT) TO service_role;


-- ============================================================
-- 5. get_dashboard_summary
--    Webhook memanggil: get_dashboard_summary(p_user_id UUID)
--    dan mengharapkan kolom:
--      income_total, expense_total, balance,
--      prev_income_total, prev_expense_total
--
--    DB punya: get_telegram_user_summary_v2(p_chat_id BIGINT) dengan kolom:
--      total_income, total_expense, net_balance,
--      prev_total_income, prev_total_expense
--
--    Karena webhook mengirim p_user_id (UUID), kita query transactions
--    langsung — tidak bisa forward ke get_telegram_user_summary_v2
--    yang butuh p_chat_id.
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_dashboard_summary(
  p_user_id UUID
)
RETURNS TABLE (
  income_total      NUMERIC,
  expense_total     NUMERIC,
  balance           NUMERIC,
  prev_income_total NUMERIC,
  prev_expense_total NUMERIC
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_start      DATE := date_trunc('month', CURRENT_DATE)::DATE;
  v_end        DATE := (date_trunc('month', CURRENT_DATE) + interval '1 month' - interval '1 day')::DATE;
  v_prev_start DATE := (date_trunc('month', CURRENT_DATE) - interval '1 month')::DATE;
  v_prev_end   DATE := (date_trunc('month', CURRENT_DATE) - interval '1 day')::DATE;
  v_inc        NUMERIC := 0;
  v_exp        NUMERIC := 0;
  v_prev_inc   NUMERIC := 0;
  v_prev_exp   NUMERIC := 0;
BEGIN
  -- Bulan berjalan
  SELECT COALESCE(SUM(amount), 0) INTO v_inc
  FROM public.transactions
  WHERE user_id = p_user_id AND type = 'income'
    AND transaction_date BETWEEN v_start AND v_end;

  SELECT COALESCE(SUM(amount), 0) INTO v_exp
  FROM public.transactions
  WHERE user_id = p_user_id AND type = 'expense'
    AND transaction_date BETWEEN v_start AND v_end;

  -- Bulan sebelumnya
  SELECT COALESCE(SUM(amount), 0) INTO v_prev_inc
  FROM public.transactions
  WHERE user_id = p_user_id AND type = 'income'
    AND transaction_date BETWEEN v_prev_start AND v_prev_end;

  SELECT COALESCE(SUM(amount), 0) INTO v_prev_exp
  FROM public.transactions
  WHERE user_id = p_user_id AND type = 'expense'
    AND transaction_date BETWEEN v_prev_start AND v_prev_end;

  RETURN QUERY SELECT v_inc, v_exp, (v_inc - v_exp), v_prev_inc, v_prev_exp;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_dashboard_summary(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_dashboard_summary(UUID) TO service_role;
