-- Migration: Create receipt_drafts table for Phase 1 OCR Receipt Processing
-- Date: 2026-06-27

CREATE TABLE IF NOT EXISTS public.receipt_drafts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    merchant_name TEXT,
    receipt_date TIMESTAMPTZ,
    total_amount NUMERIC CHECK (total_amount >= 0),
    total_items INTEGER,
    items JSONB,
    raw_ai_response JSONB,
    approved BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.receipt_drafts ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
DROP POLICY IF EXISTS "Users can select their own receipt drafts" ON public.receipt_drafts;
CREATE POLICY "Users can select their own receipt drafts"
    ON public.receipt_drafts FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own receipt drafts" ON public.receipt_drafts;
CREATE POLICY "Users can insert their own receipt drafts"
    ON public.receipt_drafts FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own receipt drafts" ON public.receipt_drafts;
CREATE POLICY "Users can update their own receipt drafts"
    ON public.receipt_drafts FOR UPDATE
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own receipt drafts" ON public.receipt_drafts;
CREATE POLICY "Users can delete their own receipt drafts"
    ON public.receipt_drafts FOR DELETE
    USING (auth.uid() = user_id);
