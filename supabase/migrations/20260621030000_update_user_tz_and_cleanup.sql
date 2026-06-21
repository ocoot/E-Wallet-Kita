-- Migration: Add timezone support and pending transaction cleanup
-- Date: 2026-06-21
-- Description: Add timezone column to users and auto-cleanup function for pending telegram transactions

-- 1. Add timezone column to users table
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS timezone TEXT;

-- 2. Create function to cleanup expired pending telegram transactions
CREATE OR REPLACE FUNCTION public.cleanup_expired_pending_transactions()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    DELETE FROM public.telegram_pending_transactions
    WHERE created_at < NOW() - INTERVAL '24 hours';
END;
$$;

-- 3. Update public.insert_telegram_transaction to adjust for timezone if possible
-- (Requires updating the existing function or replacing it)
CREATE OR REPLACE FUNCTION public.insert_telegram_transaction(
    p_chat_id BIGINT,
    p_type TEXT,
    p_category TEXT,
    p_amount NUMERIC,
    p_note TEXT,
    p_date DATE
)
RETURNS TABLE (
    id UUID,
    user_id UUID,
    type TEXT,
    category TEXT,
    amount NUMERIC,
    note TEXT,
    source TEXT,
    transaction_date DATE,
    created_at TIMESTAMPTZ
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    v_user_id UUID;
    v_timezone TEXT;
    v_local_date DATE;
BEGIN
    -- Log user_id and timezone lookup
    SELECT u.id, u.timezone INTO v_user_id, v_timezone FROM public.users u WHERE u.telegram_chat_id = p_chat_id LIMIT 1;
    
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'User not found for telegram_chat_id %', p_chat_id;
    END IF;

    -- Calculate local date if user has timezone
    IF v_timezone IS NOT NULL THEN
        v_local_date := (NOW() AT TIME ZONE v_timezone)::DATE;
    ELSE
        v_local_date := COALESCE(p_date, CURRENT_DATE);
    END IF;

    RETURN QUERY
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
        p_type,
        p_category,
        p_amount,
        p_note,
        'telegram',
        v_local_date
    )
    RETURNING *;
END;
$$;
