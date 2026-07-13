-- Migration: Telegram Forum Topics for Support Chat
-- Date: 2026-08-11
-- Description:
--   Sekarang supergroup Telegram admin sudah diaktifkan "Topics"-nya, jadi
--   tiap support_session bisa dipetakan ke satu Forum Topic (thread)
--   tersendiri di Telegram. Ini menggantikan mekanisme lama yang
--   mengandalkan admin me-reply pesan tertentu + regex kode sesi (rawan
--   salah sasaran kalau ada beberapa sesi aktif bersamaan).
--
--   Kolom ini diisi oleh Edge Function `support-bridge` (bukan dari sini)
--   karena butuh panggil Telegram Bot API `createForumTopic`, yang tidak
--   bisa dilakukan dari Postgres tanpa extension jaringan tambahan.

ALTER TABLE public.support_sessions
  ADD COLUMN IF NOT EXISTS telegram_thread_id BIGINT;

-- Lookup admin ke sesi via thread_id (dipakai tiap ada pesan masuk dari
-- webhook Telegram) -- perlu cepat karena dipanggil di jalur realtime.
CREATE INDEX IF NOT EXISTS idx_support_sessions_thread_id
  ON public.support_sessions (telegram_thread_id)
  WHERE telegram_thread_id IS NOT NULL;
