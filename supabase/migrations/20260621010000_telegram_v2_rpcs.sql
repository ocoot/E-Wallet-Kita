-- Migration: Add extra telegram RPC functions support
-- Date: 2026-06-21
-- Description: Define helper and bulk RPC functions for advanced interactive bot features

-- 1. Set Telegram user language preference
CREATE OR REPLACE FUNCTION public.set_telegram_language(
    p_chat_id BIGINT,
    p_lang TEXT
)
RETURNS VOID
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE public.users
    SET preferred_language = p_lang
    WHERE telegram_chat_id = p_chat_id;
END;
$$;

-- 2. Atomic confirm and insert template transaction
CREATE OR REPLACE FUNCTION public.confirm_and_insert_telegram_tx(
    p_chat_id BIGINT,
    p_date DATE
)
RETURNS TABLE (
    status TEXT,
    type TEXT,
    category_key TEXT,
    amount NUMERIC,
    original_text TEXT
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    v_user_id UUID;
    v_pending RECORD;
BEGIN
    -- Find user_id
    SELECT u.id INTO v_user_id FROM public.users u WHERE u.telegram_chat_id = p_chat_id LIMIT 1;
    IF v_user_id IS NULL THEN
        RETURN QUERY SELECT 'not_found'::TEXT, NULL::TEXT, NULL::TEXT, NULL::NUMERIC, NULL::TEXT;
        RETURN;
    END IF;

    -- Atomically claim (delete) the pending transaction
    DELETE FROM public.telegram_pending_transactions 
    WHERE chat_id = p_chat_id
    RETURNING chat_id, type, category_key, amount, original_text 
    INTO v_pending;
    
    IF v_pending IS NULL THEN
        -- If no row was deleted, it means another request already claimed / deleted it (or it expired)
        RETURN QUERY SELECT 'expired'::TEXT, NULL::TEXT, NULL::TEXT, NULL::NUMERIC, NULL::TEXT;
        RETURN;
    END IF;

    -- Insert active transaction
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
        COALESCE(p_date, CURRENT_DATE)
    );

    RETURN QUERY SELECT 
        'saved'::TEXT, 
        v_pending.type::TEXT, 
        v_pending.category_key::TEXT, 
        v_pending.amount::NUMERIC, 
        v_pending.original_text::TEXT;
END;
$$;

-- 3. Retrieve bilingual details monthly financial summary for Telegram including previous month comparison
CREATE OR REPLACE FUNCTION public.get_telegram_user_summary_v2(
    p_chat_id BIGINT
)
RETURNS TABLE (
    total_income NUMERIC,
    total_expense NUMERIC,
    net_balance NUMERIC,
    display_name TEXT,
    prev_total_income NUMERIC,
    prev_total_expense NUMERIC
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    v_user_id UUID;
    v_display_name TEXT;
    v_inc NUMERIC := 0;
    v_exp NUMERIC := 0;
    v_prev_inc NUMERIC := 0;
    v_prev_exp NUMERIC := 0;
    v_start_date DATE := date_trunc('month', CURRENT_DATE)::DATE;
    v_end_date DATE := (date_trunc('month', CURRENT_DATE) + interval '1 month' - interval '1 day')::DATE;
    v_prev_start_date DATE := (date_trunc('month', CURRENT_DATE) - interval '1 month')::DATE;
    v_prev_end_date DATE := (date_trunc('month', CURRENT_DATE) - interval '1 day')::DATE;
BEGIN
    -- Query user profile
    SELECT u.id, u.display_name INTO v_user_id, v_display_name
    FROM public.users u
    WHERE u.telegram_chat_id = p_chat_id
    LIMIT 1;

    IF v_user_id IS NULL THEN
        RETURN;
    END IF;

    -- Calculate current month income
    SELECT COALESCE(SUM(amount), 0) INTO v_inc
    FROM public.transactions
    WHERE user_id = v_user_id 
      AND type = 'income' 
      AND transaction_date >= v_start_date 
      AND transaction_date <= v_end_date;

    -- Calculate current month expense
    SELECT COALESCE(SUM(amount), 0) INTO v_exp
    FROM public.transactions
    WHERE user_id = v_user_id 
      AND type = 'expense' 
      AND transaction_date >= v_start_date 
      AND transaction_date <= v_end_date;

    -- Calculate prev month income
    SELECT COALESCE(SUM(amount), 0) INTO v_prev_inc
    FROM public.transactions
    WHERE user_id = v_user_id 
      AND type = 'income' 
      AND transaction_date >= v_prev_start_date 
      AND transaction_date <= v_prev_end_date;

    -- Calculate prev month expense
    SELECT COALESCE(SUM(amount), 0) INTO v_prev_exp
    FROM public.transactions
    WHERE user_id = v_user_id 
      AND type = 'expense' 
      AND transaction_date >= v_prev_start_date 
      AND transaction_date <= v_prev_end_date;

    RETURN QUERY SELECT v_inc, v_exp, (v_inc - v_exp), v_display_name, v_prev_inc, v_prev_exp;
END;
$$;

-- 4. Retrieve recent Transactions list for Bot Command
CREATE OR REPLACE FUNCTION public.get_telegram_recent_transactions(
    p_chat_id BIGINT,
    p_limit INT
)
RETURNS TABLE (
    id UUID,
    type TEXT,
    category TEXT,
    amount NUMERIC,
    note TEXT,
    transaction_date DATE
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    v_user_id UUID;
BEGIN
    SELECT u.id INTO v_user_id FROM public.users u WHERE u.telegram_chat_id = p_chat_id LIMIT 1;
    IF v_user_id IS NULL THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT t.id, t.type::TEXT, t.category::TEXT, t.amount::NUMERIC, t.note::TEXT, t.transaction_date
    FROM public.transactions t
    WHERE t.user_id = v_user_id
    ORDER BY t.transaction_date DESC, t.created_at DESC
    LIMIT p_limit;
END;
$$;

-- 5. Delete last transaction entered by Telegram User with full info returned
CREATE OR REPLACE FUNCTION public.delete_last_telegram_transaction(
    p_chat_id BIGINT
)
RETURNS TABLE (
    deleted BOOLEAN,
    type TEXT,
    category TEXT,
    amount NUMERIC,
    note TEXT
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    v_user_id UUID;
    v_tx_id UUID;
    v_type TEXT;
    v_category TEXT;
    v_amount NUMERIC;
    v_note TEXT;
BEGIN
    SELECT u.id INTO v_user_id FROM public.users u WHERE u.telegram_chat_id = p_chat_id LIMIT 1;
    IF v_user_id IS NULL THEN
        RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::TEXT, NULL::NUMERIC, NULL::TEXT;
        RETURN;
    END IF;

    -- Find last entered transaction
    SELECT t.id, t.type, t.category, t.amount, t.note
    INTO v_tx_id, v_type, v_category, v_amount, v_note
    FROM public.transactions t
    WHERE t.user_id = v_user_id
    ORDER BY t.transaction_date DESC, t.created_at DESC
    LIMIT 1;

    IF v_tx_id IS NULL THEN
        RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::TEXT, NULL::NUMERIC, NULL::TEXT;
        RETURN;
    END IF;

    -- Delete it
    DELETE FROM public.transactions WHERE id = v_tx_id;

    RETURN QUERY SELECT TRUE, v_type::TEXT, v_category::TEXT, v_amount::NUMERIC, v_note::TEXT;
END;
$$;
