-- Migration: Remove daily_budget from users table
-- Date: 2026-06-30
-- Root cause: User requested removal of the daily spending goal feature.

ALTER TABLE public.users DROP COLUMN IF EXISTS daily_budget;
