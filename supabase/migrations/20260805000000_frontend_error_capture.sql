-- Migration: Frontend Error Capture (tanpa Sentry, tanpa endpoint Vercel baru)
-- Date: 2026-08-05
--
-- Kenapa: error_logs sebelumnya cuma bisa ditulis oleh service_role (backend).
-- Supaya React app juga bisa lapor error (render crash, unhandled promise
-- rejection, runtime error di browser) LANGSUNG dari client pakai
-- `supabase` (anon/authenticated) yang sudah ada di frontend -- tanpa
-- nambah endpoint Vercel -- kita buka satu RLS INSERT policy yang SANGAT
-- dibatasi:
--   1. user_id WAJIB auth.uid() milik sendiri (tidak bisa spoof user lain)
--   2. source WAJIB diawali "frontend:" (tidak bisa nyamar jadi source
--      backend seperti "premium/payment:webhook", biar tidak bikin bingung
--      saat triase)
--   3. dibatasi laju (rate limit) 30 insert/user/jam lewat trigger, supaya
--      satu user dengan bug infinite-loop di browser tidak bisa membanjiri
--      tabel / bikin noise di dashboard admin.

-- ─── Batasi panjang message di level tabel (defense-in-depth, karena
-- frontend insert langsung tidak lewat helper Node yang sudah slice(2000)) ──
ALTER TABLE public.error_logs
  ADD CONSTRAINT chk_error_logs_message_length CHECK (length(message) <= 2000);

-- ─── RLS: authenticated user boleh insert, TAPI cuma untuk baris miliknya
-- sendiri dan source diawali "frontend:" ────────────────────────────────
CREATE POLICY "authenticated_users_can_log_own_frontend_errors"
ON public.error_logs
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND source LIKE 'frontend:%'
);

-- ─── Rate limit: maksimal 30 log/user/jam, khusus untuk source "frontend:*"
-- (insert dari backend via service_role tetap bebas, tidak kena cek ini) ──
CREATE OR REPLACE FUNCTION public.enforce_frontend_error_log_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_recent_count INT;
BEGIN
  IF NEW.source LIKE 'frontend:%' THEN
    SELECT COUNT(*) INTO v_recent_count
    FROM public.error_logs
    WHERE user_id = NEW.user_id
      AND created_at > now() - INTERVAL '1 hour';

    IF v_recent_count >= 30 THEN
      RAISE EXCEPTION 'RATE_LIMIT: Terlalu banyak error log dari user ini dalam 1 jam terakhir.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_frontend_error_log_rate_limit ON public.error_logs;
CREATE TRIGGER trg_enforce_frontend_error_log_rate_limit
  BEFORE INSERT ON public.error_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_frontend_error_log_rate_limit();
