-- Migration: Add daily_budget to users table
-- Date: 2026-07-29
-- Root cause: User wants to set a daily spending goal/budget.

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS daily_budget NUMERIC DEFAULT 0 CHECK (daily_budget >= 0);
