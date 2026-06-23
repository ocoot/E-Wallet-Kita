-- Migration: Add category to receipt_drafts table
-- Date: 2026-06-27

ALTER TABLE public.receipt_drafts 
ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'other';
