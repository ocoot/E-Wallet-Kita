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
