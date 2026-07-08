-- Migration: Wallet (Pos Dompet) support for Telegram bot flows
-- Date: 2026-08-03 (lanjutan wallets_linking_and_details)
-- Deskripsi:
--   Bot Telegram punya 2 alur draft terpisah dari alur web:
--     1. telegram_pending_transactions -- draft teks & voice note (keyed by chat_id)
--     2. receipt_drafts -- draft hasil OCR struk (punya user_id langsung)
--   Keduanya sekarang dapat kolom wallet_id, dan defaultnya langsung
--   di-resolve ke pos "Saldo Total" SAAT draft dibuat (bukan nullable +
--   COALESCE belakangan) supaya kode webhook tidak perlu menangani NULL
--   di banyak tempat -- draft selalu punya pos yang konkret sejak awal,
--   user tinggal ganti kalau mau.

-- 1. Kolom wallet_id di kedua tabel draft ------------------------------------
ALTER TABLE public.telegram_pending_transactions
    ADD COLUMN IF NOT EXISTS wallet_id UUID REFERENCES public.wallets(id) ON DELETE SET NULL;

ALTER TABLE public.receipt_drafts
    ADD COLUMN IF NOT EXISTS wallet_id UUID REFERENCES public.wallets(id) ON DELETE SET NULL;

-- 2. upsert_pending_telegram_tx: sekarang terima p_wallet_id opsional.
--    Kalau tidak dikirim / NULL, resolve ke pos "Saldo Total" user itu.
--    DROP dulu overload lama (5 param) -- CREATE OR REPLACE tidak mengganti
--    fungsi kalau daftar tipe parameter berbeda, jadi tanpa DROP ini akan
--    ada 2 versi upsert_pending_telegram_tx nyangkut sekaligus.
DROP FUNCTION IF EXISTS public.upsert_pending_telegram_tx(BIGINT, TEXT, TEXT, NUMERIC, TEXT);

CREATE OR REPLACE FUNCTION public.upsert_pending_telegram_tx(
    p_chat_id BIGINT,
    p_type TEXT,
    p_category_key TEXT,
    p_amount NUMERIC,
    p_original_text TEXT,
    p_wallet_id UUID DEFAULT NULL
)
RETURNS VOID
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    v_user_id UUID;
    v_wallet_id UUID;
BEGIN
    SELECT u.id INTO v_user_id FROM public.users u WHERE u.telegram_chat_id = p_chat_id LIMIT 1;
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'USER_NOT_FOUND';
    END IF;

    v_wallet_id := COALESCE(p_wallet_id, public.ensure_general_wallet(v_user_id));

    INSERT INTO public.telegram_pending_transactions (
        chat_id, type, category_key, amount, original_text, wallet_id, created_at
    ) VALUES (
        p_chat_id, p_type, p_category_key, p_amount, p_original_text, v_wallet_id, NOW()
    )
    ON CONFLICT (chat_id) DO UPDATE SET
        type = EXCLUDED.type,
        category_key = EXCLUDED.category_key,
        amount = EXCLUDED.amount,
        original_text = EXCLUDED.original_text,
        wallet_id = EXCLUDED.wallet_id,
        created_at = NOW();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.upsert_pending_telegram_tx(BIGINT, TEXT, TEXT, NUMERIC, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_pending_telegram_tx(BIGINT, TEXT, TEXT, NUMERIC, TEXT, UUID) TO service_role;

-- 3. get_pending_telegram_tx: sekarang ikut wallet_id ------------------------
--    DROP dulu -- RETURNS TABLE-nya berubah (kolom wallet_id baru), dan
--    Postgres tidak izinkan CREATE OR REPLACE mengubah bentuk return TABLE.
DROP FUNCTION IF EXISTS public.get_pending_telegram_tx(BIGINT);

CREATE OR REPLACE FUNCTION public.get_pending_telegram_tx(
    p_chat_id BIGINT
)
RETURNS TABLE (
    chat_id BIGINT,
    type TEXT,
    category_key TEXT,
    amount NUMERIC,
    original_text TEXT,
    wallet_id UUID,
    created_at TIMESTAMPTZ
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT t.chat_id, t.type, t.category_key, t.amount, t.original_text, t.wallet_id, t.created_at
    FROM public.telegram_pending_transactions t
    WHERE t.chat_id = p_chat_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_pending_telegram_tx(BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_pending_telegram_tx(BIGINT) TO service_role;

-- 4. update_pending_telegram_tx_wallet: dipanggil saat user pilih pos lewat
--    inline keyboard (mirror dari update_pending_telegram_tx_category).
CREATE OR REPLACE FUNCTION public.update_pending_telegram_tx_wallet(
    p_chat_id BIGINT,
    p_wallet_id UUID
)
RETURNS VOID
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE public.telegram_pending_transactions
    SET wallet_id = p_wallet_id
    WHERE chat_id = p_chat_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'PENDING_NOT_FOUND';
    END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_pending_telegram_tx_wallet(BIGINT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_pending_telegram_tx_wallet(BIGINT, UUID) TO service_role;

-- 5. get_telegram_wallets: daftar pos aktif milik user yang punya chat_id ini
--    (dipakai buat render inline keyboard pemilih pos di bot).
CREATE OR REPLACE FUNCTION public.get_telegram_wallets(p_chat_id BIGINT)
RETURNS TABLE (
    id UUID,
    name TEXT,
    type TEXT,
    provider TEXT,
    balance NUMERIC,
    is_archived BOOLEAN
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    v_user_id UUID;
BEGIN
    SELECT u.id INTO v_user_id FROM public.users u WHERE u.telegram_chat_id = p_chat_id LIMIT 1;
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'USER_NOT_FOUND';
    END IF;

    RETURN QUERY
    SELECT w.id, w.name, w.type, w.provider, w.balance, w.is_archived
    FROM public.get_wallets_with_balance(v_user_id) w
    WHERE w.is_archived = FALSE
    ORDER BY (w.type = 'general') DESC, w.type, w.created_at;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_telegram_wallets(BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_telegram_wallets(BIGINT) TO service_role;

-- 6. confirm_pending_telegram_tx: transaksi final ikut wallet_id ------------
--    (COALESCE ke Saldo Total tetap dipasang sebagai jaring pengaman kalau
--    ada baris lama dari sebelum migration ini yang wallet_id-nya NULL).
CREATE OR REPLACE FUNCTION public.confirm_pending_telegram_tx(
  p_chat_id BIGINT
)
RETURNS VOID
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_id UUID;
  v_pending RECORD;
  v_wallet_id UUID;
BEGIN
  SELECT u.id INTO v_user_id
  FROM public.users u
  WHERE u.telegram_chat_id = p_chat_id
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'USER_NOT_FOUND';
  END IF;

  DELETE FROM public.telegram_pending_transactions t
  WHERE t.chat_id = p_chat_id
  RETURNING t.chat_id, t.type, t.category_key, t.amount, t.original_text, t.wallet_id
  INTO v_pending;

  IF v_pending IS NULL THEN
    RAISE EXCEPTION 'ALREADY_CONFIRMED_OR_EXPIRED';
  END IF;

  v_wallet_id := COALESCE(v_pending.wallet_id, public.ensure_general_wallet(v_user_id));

  INSERT INTO public.transactions (
    user_id, type, category, amount, note, source, transaction_date, wallet_id
  ) VALUES (
    v_user_id, v_pending.type, v_pending.category_key, v_pending.amount, v_pending.original_text,
    'telegram', CURRENT_DATE, v_wallet_id
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.confirm_pending_telegram_tx(BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_pending_telegram_tx(BIGINT) TO service_role;
