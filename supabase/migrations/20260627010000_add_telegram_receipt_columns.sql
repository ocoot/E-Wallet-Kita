-- Migration: Add telegram_chat_id and source columns to receipt_drafts table
-- Date: 2026-06-27

ALTER TABLE public.receipt_drafts 
ADD COLUMN IF NOT EXISTS telegram_chat_id TEXT,
ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'web';

-- Also let's grant service role access to write receipt_drafts (bypass RLS for Telegram integration)
DROP POLICY IF EXISTS "Service role can do everything on receipt drafts" ON public.receipt_drafts;
CREATE POLICY "Service role can do everything on receipt drafts"
    ON public.receipt_drafts FOR ALL
    USING (true)
    WITH CHECK (true);
