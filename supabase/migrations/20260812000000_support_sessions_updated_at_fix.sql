-- Migration: Fix missing updated_at column on support_sessions
-- Date: 2026-08-12
-- Description:
--   Migration awal (20260706000000_support_chat.sql) sudah mendefinisikan
--   kolom `updated_at` di public.support_sessions, tapi ternyata tidak ada
--   di database live (schema drift) -- menyebabkan
--   `admin_list_support_sessions()` dan `admin_reply_support_session()`
--   gagal dengan error "column s.updated_at does not exist".
--
--   ADD COLUMN IF NOT EXISTS supaya aman dijalankan berapa kali pun,
--   apapun state kolom ini sekarang.

ALTER TABLE public.support_sessions
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now());

-- Backfill baris lama yang mungkin belum punya nilai (seharusnya tidak
-- ada karena NOT NULL + DEFAULT di atas, tapi dijaga untuk kasus kolom
-- sempat dibuat manual sebagai nullable sebelumnya).
UPDATE public.support_sessions
SET updated_at = created_at
WHERE updated_at IS NULL;
