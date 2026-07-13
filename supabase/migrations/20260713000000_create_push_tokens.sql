-- ─────────────────────────────────────────────────────────────
-- Create user_push_tokens table for FCM device tokens
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_push_tokens (
  id          UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fcm_token   TEXT    NOT NULL,
  device_info TEXT,                      -- optional: "iOS", "Android", "Chrome/128"
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- One token per user (upsert on conflict)
CREATE UNIQUE INDEX IF NOT EXISTS idx_push_tokens_user_id
  ON public.user_push_tokens(user_id);

-- Speed up queries that look up a user's token for sending
CREATE INDEX IF NOT EXISTS idx_push_tokens_token
  ON public.user_push_tokens(fcm_token);

-- ─────────────────────────────────────────────────────────────
-- Row Level Security
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.user_push_tokens ENABLE ROW LEVEL SECURITY;

-- Users can only see their own push tokens
DROP POLICY IF EXISTS "Users can manage their own push tokens" ON public.user_push_tokens;
CREATE POLICY "Users can manage their own push tokens"
  ON public.user_push_tokens
  FOR ALL
  USING (user_id = auth.uid());
