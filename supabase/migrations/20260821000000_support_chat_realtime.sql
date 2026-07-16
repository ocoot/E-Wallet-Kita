-- Migration: Daftarkan support_messages & support_sessions ke publication Realtime
-- Date: 2026-08-21
-- Description:
--   Widget chat admin (SupportChatWidget.tsx) subscribe ke perubahan tabel ini
--   lewat supabase.channel(...).on("postgres_changes", ...) untuk memunculkan
--   balasan admin secara live. Ternyata dari awal dibuat (20260706000000_support_chat.sql)
--   kedua tabel ini TIDAK PERNAH didaftarkan ke publication `supabase_realtime`,
--   jadi WAL event INSERT/UPDATE-nya tidak pernah dipancarkan ke client --
--   balasan admin dari Telegram tersimpan sukses di DB (makanya tidak ada
--   error di log manapun), tapi tidak pernah sampai ke widget selama sesi
--   chat masih terbuka (baru muncul kalau widget di-reopen, karena
--   loadMessages() melakukan select biasa, bukan realtime).
--
--   Pola ini mengikuti cara yang sudah dipakai untuk fitur lain, lihat
--   20260630000000_maintenance_mode.sql.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'support_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.support_messages;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'support_sessions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.support_sessions;
  END IF;
END $$;
