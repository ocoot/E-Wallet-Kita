-- Migration: Wallets / Pos Dompet system
-- Date: 2026-07-08
-- Description:
--   Menambahkan konsep "Pos Dompet" (Dompet E-Wallet, Dompet Rekening, Cash/Tunai,
--   dan Saldo Total sebagai pos umum/default) yang terpisah dari sistem transaksi
--   yang sudah ada. Setiap transaksi (income/expense) sekarang bisa dikaitkan ke
--   satu wallet. Saldo wallet = starting_balance (bisa diedit manual oleh user)
--   + akumulasi seluruh transaksi yang terhubung ke wallet tersebut. Pendekatan
--   ini menghindari drift antara "saldo manual" dan "saldo hasil transaksi" --
--   edit manual cukup menggeser starting_balance, bukan menimpa histori.

-- 1. Tabel wallets ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.wallets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('ewallet', 'bank', 'cash', 'general')),
    provider TEXT, -- contoh: "Gopay", "Bank Mandiri" -- opsional, bebas diisi user
    starting_balance NUMERIC NOT NULL DEFAULT 0,
    is_archived BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Hanya boleh ada 1 wallet bertipe 'general' ("Saldo Total") per user
CREATE UNIQUE INDEX IF NOT EXISTS wallets_one_general_per_user
    ON public.wallets (user_id)
    WHERE type = 'general';

CREATE INDEX IF NOT EXISTS wallets_user_id_idx ON public.wallets (user_id);

ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can select their own wallets" ON public.wallets;
CREATE POLICY "Users can select their own wallets"
    ON public.wallets FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own wallets" ON public.wallets;
CREATE POLICY "Users can insert their own wallets"
    ON public.wallets FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own wallets" ON public.wallets;
CREATE POLICY "Users can update their own wallets"
    ON public.wallets FOR UPDATE
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own wallets" ON public.wallets;
CREATE POLICY "Users can delete their own wallets"
    ON public.wallets FOR DELETE
    USING (auth.uid() = user_id);

-- 2. Kaitkan transactions ke wallet -------------------------------------------
ALTER TABLE public.transactions
    ADD COLUMN IF NOT EXISTS wallet_id UUID REFERENCES public.wallets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS transactions_wallet_id_idx ON public.transactions (wallet_id);

-- 3. Fungsi: pastikan wallet umum ("Saldo Total") ada untuk seorang user -------
CREATE OR REPLACE FUNCTION public.ensure_general_wallet(p_user_id UUID)
RETURNS UUID
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    v_wallet_id UUID;
BEGIN
    SELECT id INTO v_wallet_id FROM public.wallets
    WHERE user_id = p_user_id AND type = 'general'
    LIMIT 1;

    IF v_wallet_id IS NULL THEN
        INSERT INTO public.wallets (user_id, name, type, starting_balance)
        VALUES (p_user_id, 'Saldo Total', 'general', 0)
        RETURNING id INTO v_wallet_id;
    END IF;

    RETURN v_wallet_id;
END;
$$;

-- 4. Fungsi: ambil semua wallet milik user beserta saldo terhitung ------------
DROP FUNCTION IF EXISTS public.get_wallets_with_balance(UUID);

CREATE OR REPLACE FUNCTION public.get_wallets_with_balance(p_user_id UUID)
RETURNS TABLE (
    id UUID,
    name TEXT,
    type TEXT,
    provider TEXT,
    starting_balance NUMERIC,
    balance NUMERIC,
    is_archived BOOLEAN,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
    -- Self-healing: pastikan wallet umum selalu ada sebelum daftar diambil.
    PERFORM public.ensure_general_wallet(p_user_id);

    RETURN QUERY
    SELECT
        w.id,
        w.name,
        w.type,
        w.provider,
        w.starting_balance,
        w.starting_balance + COALESCE(SUM(
            CASE
                WHEN t.type = 'income' THEN t.amount
                WHEN t.type = 'expense' THEN -t.amount
                ELSE 0
            END
        ), 0) AS balance,
        w.is_archived,
        w.created_at,
        w.updated_at
    FROM public.wallets w
    LEFT JOIN public.transactions t ON t.wallet_id = w.id AND t.user_id = p_user_id
    WHERE w.user_id = p_user_id
    GROUP BY w.id
    ORDER BY (w.type = 'general') DESC, w.type, w.created_at;
END;
$$;

-- 5. Fungsi: buat wallet baru ---------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_wallet(
    p_user_id UUID,
    p_name TEXT,
    p_type TEXT,
    p_provider TEXT DEFAULT NULL,
    p_starting_balance NUMERIC DEFAULT 0
)
RETURNS UUID
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    v_wallet_id UUID;
BEGIN
    IF p_type = 'general' THEN
        RAISE EXCEPTION 'Tidak bisa membuat pos Saldo Total lagi -- sudah otomatis dibuat per user';
    END IF;

    IF p_type NOT IN ('ewallet', 'bank', 'cash') THEN
        RAISE EXCEPTION 'Tipe wallet tidak valid: %', p_type;
    END IF;

    INSERT INTO public.wallets (user_id, name, type, provider, starting_balance)
    VALUES (p_user_id, TRIM(p_name), p_type, NULLIF(TRIM(COALESCE(p_provider, '')), ''), COALESCE(p_starting_balance, 0))
    RETURNING id INTO v_wallet_id;

    RETURN v_wallet_id;
END;
$$;

-- 6. Fungsi: set/override saldo wallet secara manual ---------------------------
--    User memasukkan angka saldo yang "sebenarnya" (misal hasil cek app Gopay),
--    lalu starting_balance digeser supaya starting_balance + total transaksi
--    yang sudah tercatat = angka tersebut.
CREATE OR REPLACE FUNCTION public.set_wallet_balance(
    p_user_id UUID,
    p_wallet_id UUID,
    p_new_balance NUMERIC
)
RETURNS NUMERIC
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    v_tx_sum NUMERIC;
    v_owner UUID;
BEGIN
    SELECT user_id INTO v_owner FROM public.wallets WHERE id = p_wallet_id;
    IF v_owner IS NULL OR v_owner <> p_user_id THEN
        RAISE EXCEPTION 'Wallet tidak ditemukan atau bukan milik user ini';
    END IF;

    SELECT COALESCE(SUM(
        CASE WHEN t.type = 'income' THEN t.amount WHEN t.type = 'expense' THEN -t.amount ELSE 0 END
    ), 0) INTO v_tx_sum
    FROM public.transactions t
    WHERE t.wallet_id = p_wallet_id AND t.user_id = p_user_id;

    UPDATE public.wallets
    SET starting_balance = p_new_balance - v_tx_sum,
        updated_at = NOW()
    WHERE id = p_wallet_id;

    RETURN p_new_balance;
END;
$$;

-- 7. Fungsi: rename / arsipkan wallet -------------------------------------------
CREATE OR REPLACE FUNCTION public.update_wallet(
    p_user_id UUID,
    p_wallet_id UUID,
    p_name TEXT DEFAULT NULL,
    p_provider TEXT DEFAULT NULL,
    p_is_archived BOOLEAN DEFAULT NULL
)
RETURNS VOID
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    v_owner UUID;
BEGIN
    SELECT user_id INTO v_owner FROM public.wallets WHERE id = p_wallet_id;
    IF v_owner IS NULL OR v_owner <> p_user_id THEN
        RAISE EXCEPTION 'Wallet tidak ditemukan atau bukan milik user ini';
    END IF;

    UPDATE public.wallets SET
        name = COALESCE(NULLIF(TRIM(p_name), ''), name),
        provider = CASE WHEN p_provider IS NOT NULL THEN NULLIF(TRIM(p_provider), '') ELSE provider END,
        is_archived = COALESCE(p_is_archived, is_archived),
        updated_at = NOW()
    WHERE id = p_wallet_id;
END;
$$;

-- 8. Backfill: buat wallet umum untuk semua user yang sudah punya transaksi,
--    lalu arahkan semua transaksi lama (wallet_id masih NULL) ke wallet itu.
DO $$
DECLARE
    u RECORD;
    v_wallet_id UUID;
BEGIN
    FOR u IN SELECT DISTINCT user_id FROM public.transactions WHERE wallet_id IS NULL LOOP
        v_wallet_id := public.ensure_general_wallet(u.user_id);
        UPDATE public.transactions
        SET wallet_id = v_wallet_id
        WHERE user_id = u.user_id AND wallet_id IS NULL;
    END LOOP;
END;
$$;

-- 9. Izinkan role yang dipakai klien (authenticated) memanggil RPC di atas.
GRANT EXECUTE ON FUNCTION public.ensure_general_wallet(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_wallets_with_balance(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_wallet(UUID, TEXT, TEXT, TEXT, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_wallet_balance(UUID, UUID, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_wallet(UUID, UUID, TEXT, TEXT, BOOLEAN) TO authenticated;

-- Backend Telegram (service role) juga perlu ini -- service role sudah bypass RLS
-- dan tidak butuh GRANT eksplisit, tapi kita tetap izinkan untuk konsistensi.
GRANT EXECUTE ON FUNCTION public.ensure_general_wallet(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_wallets_with_balance(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_wallet(UUID, TEXT, TEXT, TEXT, NUMERIC) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_wallet_balance(UUID, UUID, NUMERIC) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_wallet(UUID, UUID, TEXT, TEXT, BOOLEAN) TO service_role;
