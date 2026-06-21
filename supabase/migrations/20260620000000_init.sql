-- Migration: Initialize schema for E-Wallet Kita
-- Date: 2026-06-20
-- Description: Define users, categories, transactions, telegram_link_codes and set up Row Level Security (RLS)

-- 1. Create tables
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY, -- Matches auth.users structure
    display_name TEXT NOT NULL,
    email TEXT,
    is_guest BOOLEAN DEFAULT FALSE,
    telegram_chat_id BIGINT UNIQUE,
    preferred_language TEXT DEFAULT 'id' CHECK (preferred_language IN ('id', 'en')),
    preferred_theme TEXT DEFAULT 'dark_obsidian' CHECK (preferred_theme IN ('dark_obsidian', 'light_sakura')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key TEXT UNIQUE NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('income', 'expense', 'both'))
);

CREATE TABLE IF NOT EXISTS public.transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
    category TEXT NOT NULL,
    amount NUMERIC NOT NULL CHECK (amount >= 0),
    note TEXT,
    source TEXT NOT NULL CHECK (source IN ('manual', 'ai_web', 'telegram')),
    transaction_date DATE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.telegram_link_codes (
    code VARCHAR(5) PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    used BOOLEAN DEFAULT FALSE
);

-- 2. Insert master categories
INSERT INTO public.categories (key, type) VALUES
    ('salary', 'income'),
    ('bonus', 'income'),
    ('food_drink', 'expense'),
    ('monthly_groceries', 'expense'),
    ('vegetables', 'expense'),
    ('bills', 'expense'),
    ('other', 'expense')
ON CONFLICT (key) DO NOTHING;

-- 3. Enable Row Level Security (RLS) on all user-facing tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_link_codes ENABLE ROW LEVEL SECURITY;

-- Note: categories is a public master table, RLS allows readable access to all users
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

-- 4. Create RLS policies

-- Users Table Policies
CREATE POLICY "Users can select their own profile"
    ON public.users FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
    ON public.users FOR UPDATE
    USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile"
    ON public.users FOR INSERT
    WITH CHECK (auth.uid() = id);

-- Transactions Table Policies
CREATE POLICY "Users can select their own transactions"
    ON public.transactions FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own transactions"
    ON public.transactions FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own transactions"
    ON public.transactions FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own transactions"
    ON public.transactions FOR DELETE
    USING (auth.uid() = user_id);

-- Telegram Link Codes Table Policies (user_id specific)
CREATE POLICY "Users can select their own active link codes"
    ON public.telegram_link_codes FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own link codes"
    ON public.telegram_link_codes FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own link codes"
    ON public.telegram_link_codes FOR UPDATE
    USING (auth.uid() = user_id);

-- Categories Table Policies (readable to everyone authenticated or anonymous)
CREATE POLICY "Allow read access to all catalog categories"
    ON public.categories FOR SELECT
    TO authenticated, anon
    USING (true);

-- 5. RPC Security Definer Functions for Telegram Webhook Integration (Bypasses RLS Safely via Security Definer)

-- A. Link Telegram user using single-use 5-digit code
CREATE OR REPLACE FUNCTION public.link_telegram_user(
    p_code TEXT,
    p_chat_id BIGINT
)
RETURNS TABLE (
    success BOOLEAN,
    message TEXT,
    user_id UUID,
    display_name TEXT
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    v_user_id UUID;
    v_display_name TEXT;
    v_exists BOOLEAN := FALSE;
BEGIN
    -- Check if code exists, is not used, and is not expired
    SELECT t.user_id, u.display_name, TRUE
    INTO v_user_id, v_display_name, v_exists
    FROM public.telegram_link_codes t
    JOIN public.users u ON t.user_id = u.id
    WHERE t.code = p_code AND t.used = FALSE AND t.expires_at > NOW()
    LIMIT 1;

    IF v_exists IS NOT TRUE THEN
        RETURN QUERY SELECT FALSE, 'Kode tidak valid atau sudah kedaluwarsa.'::TEXT, NULL::UUID, NULL::TEXT;
        RETURN;
    END IF;

    -- Update telegram_chat_id in users table
    UPDATE public.users
    SET telegram_chat_id = p_chat_id
    WHERE id = v_user_id;

    -- Mark code as used
    UPDATE public.telegram_link_codes
    SET used = TRUE
    WHERE code = p_code;

    RETURN QUERY SELECT TRUE, 'Akun Telegram berhasil ditautkan!'::TEXT, v_user_id, v_display_name;
END;
$$;

-- B. Unlink Telegram user
CREATE OR REPLACE FUNCTION public.unlink_telegram_user(
    p_chat_id BIGINT
)
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE public.users
    SET telegram_chat_id = NULL
    WHERE telegram_chat_id = p_chat_id;
    
    RETURN FOUND;
END;
$$;

-- C. Find user profile by Telegram chat ID
CREATE OR REPLACE FUNCTION public.get_user_by_telegram_chat_id(
    p_chat_id BIGINT
)
RETURNS TABLE (
    id UUID,
    display_name TEXT,
    preferred_language TEXT
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT u.id, u.display_name, u.preferred_language
    FROM public.users u
    WHERE u.telegram_chat_id = p_chat_id
    LIMIT 1;
END;
$$;

-- D. Insert a transaction from Telegram
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
BEGIN
    -- Log user_id lookup
    SELECT u.id INTO v_user_id FROM public.users u WHERE u.telegram_chat_id = p_chat_id LIMIT 1;
    
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'User not found for telegram_chat_id %', p_chat_id;
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
        COALESCE(p_date, CURRENT_DATE)
    )
    RETURNING *;
END;
$$;

-- E. Retrieve monthly financial summary for Telegram
CREATE OR REPLACE FUNCTION public.get_telegram_user_summary(
    p_chat_id BIGINT
)
RETURNS TABLE (
    total_income NUMERIC,
    total_expense NUMERIC,
    net_balance NUMERIC,
    display_name TEXT
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
    v_start_date DATE := date_trunc('month', CURRENT_DATE)::DATE;
    v_end_date DATE := (date_trunc('month', CURRENT_DATE) + interval '1 month' - interval '1 day')::DATE;
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

    RETURN QUERY SELECT v_inc, v_exp, (v_inc - v_exp), v_display_name;
END;
$$;
