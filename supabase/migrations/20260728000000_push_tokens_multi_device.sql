-- ─────────────────────────────────────────────────────────────
-- Migration: Izinkan multi-device pada user_push_tokens
-- Date: 2026-07-28
--
-- Masalah sebelumnya: unique index hanya di kolom user_id, jadi
-- saat device kedua melakukan upsert (onConflict: "user_id"),
-- baris device pertama ikut tertimpa. Akibatnya cuma 1 device
-- per user yang bisa menerima push notification.
--
-- Perbaikan: ganti unique index menjadi kombinasi (user_id, fcm_token)
-- supaya setiap device punya barisnya sendiri, tapi token yang sama
-- tidak akan terduplikasi (re-registrasi dari device yang sama tetap
-- aman, hanya akan update baris yang sudah ada).
-- ─────────────────────────────────────────────────────────────

-- 1) Hapus unique index lama yang membatasi 1 token per user
DROP INDEX IF EXISTS public.idx_push_tokens_user_id;

-- 2) Buat index non-unique biasa di user_id (untuk query "ambil semua
--    token milik user X" tetap cepat, tanpa membatasi jumlah baris)
CREATE INDEX IF NOT EXISTS idx_push_tokens_user_id_lookup
  ON public.user_push_tokens(user_id);

-- 3) Unique constraint baru: kombinasi user_id + fcm_token.
--    Ini yang dipakai sebagai target onConflict di kode upsert.
CREATE UNIQUE INDEX IF NOT EXISTS idx_push_tokens_user_token
  ON public.user_push_tokens(user_id, fcm_token);
