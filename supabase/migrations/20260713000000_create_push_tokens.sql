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

-- Speed up "get this user's push token(s)" lookups.
-- Catatan: SENGAJA non-unique, bukan unique index. Awalnya di sini dibuat
-- UNIQUE (1 token per user), tapi itu didesain ulang di migration
-- 20260728000000_push_tokens_multi_device.sql untuk mendukung banyak
-- device per user (unique constraint final ada di kombinasi
-- (user_id, fcm_token), dibuat migration tsb). Kalau index di sini tetap
-- unique-single-column, ADD/CREATE-nya akan gagal (23505) menabrak data
-- multi-device yang sah kalau branch/DB sudah punya lebih dari 1 device
-- per user saat migration ini dijalankan ulang.
CREATE INDEX IF NOT EXISTS idx_push_tokens_user_id
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
