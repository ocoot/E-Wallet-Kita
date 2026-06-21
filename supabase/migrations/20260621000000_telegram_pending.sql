-- Migration: Add telegram pending transactions support
-- Date: 2026-06-21
-- Description: Define table and RPC functions for handling pending telegram transactions in stateless environments

-- 1. Create table for pending telegram transactions
CREATE TABLE IF NOT EXISTS public.telegram_pending_transactions (
    chat_id BIGINT PRIMARY KEY,
    type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
    category_key TEXT NOT NULL,
    amount NUMERIC NOT NULL CHECK (amount >= 0),
    original_text TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS (Service role and backend RPCs have access, disable direct user client modifications)
ALTER TABLE public.telegram_pending_transactions ENABLE ROW LEVEL SECURITY;

-- 2. Create Security Definer RPC Functions for handling pending transactions safely from webhook

-- A. Upsert pending Telegram transaction
CREATE OR REPLACE FUNCTION public.upsert_pending_telegram_tx(
    p_chat_id BIGINT,
    p_type TEXT,
    p_category_key TEXT,
    p_amount NUMERIC,
    p_original_text TEXT
)
RETURNS VOID
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO public.telegram_pending_transactions (
        chat_id,
        type,
        category_key,
        amount,
        original_text,
        created_at
    ) VALUES (
        p_chat_id,
        p_type,
        p_category_key,
        p_amount,
        p_original_text,
        NOW()
    )
    ON CONFLICT (chat_id) DO UPDATE SET
        type = EXCLUDED.type,
        category_key = EXCLUDED.category_key,
        amount = EXCLUDED.amount,
        original_text = EXCLUDED.original_text,
        created_at = NOW();
END;
$$;

-- B. Retrieve pending Telegram transaction
CREATE OR REPLACE FUNCTION public.get_pending_telegram_tx(
    p_chat_id BIGINT
)
RETURNS TABLE (
    chat_id BIGINT,
    type TEXT,
    category_key TEXT,
    amount NUMERIC,
    original_text TEXT,
    created_at TIMESTAMPTZ
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT t.chat_id, t.type, t.category_key, t.amount, t.original_text, t.created_at
    FROM public.telegram_pending_transactions t
    WHERE t.chat_id = p_chat_id;
END;
$$;

-- C. Delete pending Telegram transaction
CREATE OR REPLACE FUNCTION public.delete_pending_telegram_tx(
    p_chat_id BIGINT
)
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
    DELETE FROM public.telegram_pending_transactions
    WHERE chat_id = p_chat_id;
    RETURN FOUND;
END;
$$;
