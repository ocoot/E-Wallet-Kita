-- Migration: Wallet linking (Anggaran/Tagihan/Cicilan/Tabungan/Emas) + detail fields
-- Date: 2026-08-03 (lanjutan wallets_pos_system)
-- Deskripsi:
--   1. Tambah phone_number & account_number ke wallets (data kontak dompet,
--      cth. nomor Gopay atau nomor rekening BCA), untuk ditampilkan dengan
--      toggle show/hide di UI.
--   2. Tambah wallet_id (nullable) ke bill_reminders & installments -- pos
--      mana yang dipakai bayar. Saat "Tandai Lunas"/"Tandai Bulan Ini Lunas"
--      auto-insert transaksi, transaksi itu sekarang ikut wallet_id ini
--      (fallback ke pos "Saldo Total" kalau tidak diisi).
--   3. Tambah wallet_id (nullable) ke savings_pockets & gold_pockets -- pos
--      mana yang "menyimpan" tabungan/emas ini. Uang tetap tercatat sebagai
--      earmarked di level pocket (tidak mengubah starting_balance wallet),
--      tapi sekarang bisa ditelusuri pos wallet mana yang dipakai, dan
--      get_wallets_with_balance() mengembalikan earmarked_amount +
--      available_balance per-wallet (paralel dengan kartu "Saldo Tersedia"
--      lama di Dashboard, tapi sekarang per pos, bukan cuma agregat).
--   4. Anggaran (budgets) sengaja TIDAK diberi wallet_id -- budget dihitung
--      dari kategori pengeluaran lintas semua pos (mis. budget "Makanan"
--      harus menjumlah pengeluaran makanan dari Gopay + Cash + dst), jadi
--      linknya otomatis lewat category, bukan lewat wallet.

-- 1. Detail dompet ------------------------------------------------------------
ALTER TABLE public.wallets
    ADD COLUMN IF NOT EXISTS phone_number TEXT,
    ADD COLUMN IF NOT EXISTS account_number TEXT;

-- 2. Bill reminders & installments: pos dompet default utk auto-transaksi ----
ALTER TABLE public.bill_reminders
    ADD COLUMN IF NOT EXISTS wallet_id UUID REFERENCES public.wallets(id) ON DELETE SET NULL;

ALTER TABLE public.installments
    ADD COLUMN IF NOT EXISTS wallet_id UUID REFERENCES public.wallets(id) ON DELETE SET NULL;

-- 3. Savings pockets & gold pockets: pos dompet yang "menyimpan" dana --------
ALTER TABLE public.savings_pockets
    ADD COLUMN IF NOT EXISTS wallet_id UUID REFERENCES public.wallets(id) ON DELETE SET NULL;

ALTER TABLE public.gold_pockets
    ADD COLUMN IF NOT EXISTS wallet_id UUID REFERENCES public.wallets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS bill_reminders_wallet_id_idx ON public.bill_reminders (wallet_id);
CREATE INDEX IF NOT EXISTS installments_wallet_id_idx ON public.installments (wallet_id);
CREATE INDEX IF NOT EXISTS savings_pockets_wallet_id_idx ON public.savings_pockets (wallet_id);
CREATE INDEX IF NOT EXISTS gold_pockets_wallet_id_idx ON public.gold_pockets (wallet_id);

-- 4. get_wallets_with_balance: sekarang ikut phone/account (masked di client,
--    bukan di DB -- kolomnya tetap plain text di server), earmarked_amount
--    (jumlah savings_pockets.current_amount + gold_pockets.cash_locked_amount
--    yang wallet_id-nya = pos ini), dan available_balance = balance - earmarked.
DROP FUNCTION IF EXISTS public.get_wallets_with_balance(UUID);

CREATE OR REPLACE FUNCTION public.get_wallets_with_balance(p_user_id UUID)
RETURNS TABLE (
    id UUID,
    name TEXT,
    type TEXT,
    provider TEXT,
    phone_number TEXT,
    account_number TEXT,
    starting_balance NUMERIC,
    balance NUMERIC,
    earmarked_amount NUMERIC,
    available_balance NUMERIC,
    is_archived BOOLEAN,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
    PERFORM public.ensure_general_wallet(p_user_id);

    RETURN QUERY
    SELECT
        w.id,
        w.name,
        w.type,
        w.provider,
        w.phone_number,
        w.account_number,
        w.starting_balance,
        w.starting_balance + COALESCE(tx.tx_sum, 0) AS balance,
        COALESCE(sp.saved_sum, 0) + COALESCE(gp.gold_locked_sum, 0) AS earmarked_amount,
        (w.starting_balance + COALESCE(tx.tx_sum, 0)) - (COALESCE(sp.saved_sum, 0) + COALESCE(gp.gold_locked_sum, 0)) AS available_balance,
        w.is_archived,
        w.created_at,
        w.updated_at
    FROM public.wallets w
    LEFT JOIN (
        SELECT t.wallet_id, SUM(CASE WHEN t.type = 'income' THEN t.amount WHEN t.type = 'expense' THEN -t.amount ELSE 0 END) AS tx_sum
        FROM public.transactions t
        WHERE t.user_id = p_user_id
        GROUP BY t.wallet_id
    ) tx ON tx.wallet_id = w.id
    LEFT JOIN (
        SELECT s.wallet_id, SUM(s.current_amount) AS saved_sum
        FROM public.savings_pockets s
        WHERE s.user_id = p_user_id AND s.is_archived = FALSE
        GROUP BY s.wallet_id
    ) sp ON sp.wallet_id = w.id
    LEFT JOIN (
        SELECT g.wallet_id, SUM(g.cash_locked_amount) AS gold_locked_sum
        FROM public.gold_pockets g
        WHERE g.user_id = p_user_id AND g.is_archived = FALSE
        GROUP BY g.wallet_id
    ) gp ON gp.wallet_id = w.id
    WHERE w.user_id = p_user_id
    ORDER BY (w.type = 'general') DESC, w.type, w.created_at;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_wallets_with_balance(UUID) TO authenticated, service_role;

-- 5. mark_bill_paid_for_user: propagasi wallet_id ke transaksi otomatis -----
CREATE OR REPLACE FUNCTION public.mark_bill_paid_for_user(p_bill_id UUID)
RETURNS TABLE (
    id UUID,
    is_paid BOOLEAN,
    paid_at TIMESTAMPTZ,
    linked_transaction_id UUID,
    needs_manual_amount BOOLEAN
)
SECURITY INVOKER
LANGUAGE plpgsql
AS $$
DECLARE
    v_bill RECORD;
    v_tx_id UUID;
    v_wallet_id UUID;
BEGIN
    SELECT b.* INTO v_bill
    FROM public.bill_reminders b
    WHERE b.id = p_bill_id AND b.user_id = auth.uid() AND b.is_paid = FALSE
    FOR UPDATE;

    IF v_bill IS NULL THEN
        RETURN;
    END IF;

    v_wallet_id := COALESCE(v_bill.wallet_id, public.ensure_general_wallet(v_bill.user_id));

    IF v_bill.amount IS NOT NULL THEN
        INSERT INTO public.transactions (user_id, type, category, amount, note, source, transaction_date, wallet_id)
        VALUES (v_bill.user_id, 'expense', v_bill.category_key, v_bill.amount, v_bill.name, 'bill_reminder', CURRENT_DATE, v_wallet_id)
        RETURNING transactions.id INTO v_tx_id;

        UPDATE public.bill_reminders b
        SET is_paid = TRUE, paid_at = NOW(), updated_at = NOW(), linked_transaction_id = v_tx_id
        WHERE b.id = p_bill_id;

        RETURN QUERY SELECT v_bill.id, TRUE, NOW(), v_tx_id, FALSE;
    ELSE
        UPDATE public.bill_reminders b
        SET is_paid = TRUE, paid_at = NOW(), updated_at = NOW()
        WHERE b.id = p_bill_id;

        RETURN QUERY SELECT v_bill.id, TRUE, NOW(), NULL::UUID, TRUE;
    END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_bill_paid_for_user(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_bill_paid_for_user(UUID) TO authenticated;

-- 6. mark_bill_paid_via_bot: sama, dipakai oleh Telegram bot -----------------
DROP FUNCTION IF EXISTS public.mark_bill_paid_via_bot(BIGINT, UUID);

CREATE OR REPLACE FUNCTION public.mark_bill_paid_via_bot(
    p_chat_id BIGINT,
    p_bill_id UUID
)
RETURNS TABLE (
    id UUID,
    name TEXT,
    is_paid BOOLEAN,
    paid_at TIMESTAMPTZ,
    linked_transaction_id UUID,
    needs_manual_amount BOOLEAN
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    v_user_id UUID;
    v_bill RECORD;
    v_tx_id UUID;
    v_wallet_id UUID;
BEGIN
    SELECT u.id INTO v_user_id FROM public.users u WHERE u.telegram_chat_id = p_chat_id LIMIT 1;

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'User not found for telegram_chat_id %', p_chat_id;
    END IF;

    SELECT b.* INTO v_bill
    FROM public.bill_reminders b
    WHERE b.id = p_bill_id AND b.user_id = v_user_id AND b.is_paid = FALSE
    FOR UPDATE;

    IF v_bill IS NULL THEN
        RETURN;
    END IF;

    v_wallet_id := COALESCE(v_bill.wallet_id, public.ensure_general_wallet(v_bill.user_id));

    IF v_bill.amount IS NOT NULL THEN
        INSERT INTO public.transactions (user_id, type, category, amount, note, source, transaction_date, wallet_id)
        VALUES (v_bill.user_id, 'expense', v_bill.category_key, v_bill.amount, v_bill.name, 'bill_reminder', CURRENT_DATE, v_wallet_id)
        RETURNING transactions.id INTO v_tx_id;

        UPDATE public.bill_reminders b
        SET is_paid = TRUE, paid_at = NOW(), updated_at = NOW(), linked_transaction_id = v_tx_id
        WHERE b.id = p_bill_id;

        RETURN QUERY SELECT v_bill.id, v_bill.name, TRUE, NOW(), v_tx_id, FALSE;
    ELSE
        UPDATE public.bill_reminders b
        SET is_paid = TRUE, paid_at = NOW(), updated_at = NOW()
        WHERE b.id = p_bill_id;

        RETURN QUERY SELECT v_bill.id, v_bill.name, TRUE, NOW(), NULL::UUID, TRUE;
    END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_bill_paid_via_bot(BIGINT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_bill_paid_via_bot(BIGINT, UUID) TO service_role;

-- 7. mark_installment_month_paid_for_user: propagasi wallet_id --------------
CREATE OR REPLACE FUNCTION public.mark_installment_month_paid_for_user(p_installment_id UUID)
RETURNS TABLE (
    id UUID,
    months_paid INTEGER,
    total_months INTEGER,
    is_completed BOOLEAN,
    linked_transaction_id UUID,
    needs_manual_amount BOOLEAN
)
SECURITY INVOKER
LANGUAGE plpgsql
AS $$
DECLARE
    v_inst RECORD;
    v_tx_id UUID;
    v_new_months_paid INTEGER;
    v_new_is_completed BOOLEAN;
    v_wallet_id UUID;
BEGIN
    SELECT i.* INTO v_inst
    FROM public.installments i
    WHERE i.id = p_installment_id AND i.user_id = auth.uid() AND i.is_completed = FALSE
    FOR UPDATE;

    IF v_inst IS NULL THEN
        RETURN;
    END IF;

    v_wallet_id := COALESCE(v_inst.wallet_id, public.ensure_general_wallet(v_inst.user_id));
    v_new_months_paid := v_inst.months_paid + 1;
    v_new_is_completed := v_new_months_paid >= v_inst.total_months;

    IF v_inst.monthly_amount IS NOT NULL THEN
        INSERT INTO public.transactions (user_id, type, category, amount, note, source, transaction_date, wallet_id)
        VALUES (
            v_inst.user_id, 'expense', v_inst.category_key, v_inst.monthly_amount,
            v_inst.name || ' (' || v_new_months_paid || '/' || v_inst.total_months || ')',
            'installment', CURRENT_DATE, v_wallet_id
        )
        RETURNING transactions.id INTO v_tx_id;

        UPDATE public.installments i
        SET months_paid = v_new_months_paid, is_completed = v_new_is_completed,
            last_transaction_id = v_tx_id, updated_at = NOW()
        WHERE i.id = p_installment_id;

        RETURN QUERY SELECT v_inst.id, v_new_months_paid, v_inst.total_months, v_new_is_completed, v_tx_id, FALSE;
    ELSE
        UPDATE public.installments i
        SET months_paid = v_new_months_paid, is_completed = v_new_is_completed,
            last_transaction_id = NULL, updated_at = NOW()
        WHERE i.id = p_installment_id;

        RETURN QUERY SELECT v_inst.id, v_new_months_paid, v_inst.total_months, v_new_is_completed, NULL::UUID, TRUE;
    END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_installment_month_paid_for_user(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_installment_month_paid_for_user(UUID) TO authenticated;

-- 8. create_wallet & update_wallet: sekarang menerima phone_number/account_number
--    (data kontak dompet -- nomor HP e-wallet atau nomor rekening bank).
--    Di-mask di client (fitur mata kecil show/hide), disimpan plain di server.
--    DROP dulu overload lama (5 param) supaya tidak ada 2 versi fungsi
--    nyangkut sekaligus (CREATE OR REPLACE tidak mengganti kalau signature beda).
DROP FUNCTION IF EXISTS public.create_wallet(UUID, TEXT, TEXT, TEXT, NUMERIC);
DROP FUNCTION IF EXISTS public.update_wallet(UUID, UUID, TEXT, TEXT, BOOLEAN);

CREATE OR REPLACE FUNCTION public.create_wallet(
    p_user_id UUID,
    p_name TEXT,
    p_type TEXT,
    p_provider TEXT DEFAULT NULL,
    p_starting_balance NUMERIC DEFAULT 0,
    p_phone_number TEXT DEFAULT NULL,
    p_account_number TEXT DEFAULT NULL
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

    INSERT INTO public.wallets (user_id, name, type, provider, starting_balance, phone_number, account_number)
    VALUES (
        p_user_id, TRIM(p_name), p_type, NULLIF(TRIM(COALESCE(p_provider, '')), ''), COALESCE(p_starting_balance, 0),
        NULLIF(TRIM(COALESCE(p_phone_number, '')), ''), NULLIF(TRIM(COALESCE(p_account_number, '')), '')
    )
    RETURNING id INTO v_wallet_id;

    RETURN v_wallet_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_wallet(UUID, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.update_wallet(
    p_user_id UUID,
    p_wallet_id UUID,
    p_name TEXT DEFAULT NULL,
    p_provider TEXT DEFAULT NULL,
    p_is_archived BOOLEAN DEFAULT NULL,
    p_phone_number TEXT DEFAULT NULL,
    p_account_number TEXT DEFAULT NULL,
    p_clear_phone_number BOOLEAN DEFAULT FALSE,
    p_clear_account_number BOOLEAN DEFAULT FALSE
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
        phone_number = CASE
            WHEN p_clear_phone_number THEN NULL
            WHEN p_phone_number IS NOT NULL THEN NULLIF(TRIM(p_phone_number), '')
            ELSE phone_number
        END,
        account_number = CASE
            WHEN p_clear_account_number THEN NULL
            WHEN p_account_number IS NOT NULL THEN NULLIF(TRIM(p_account_number), '')
            ELSE account_number
        END,
        updated_at = NOW()
    WHERE id = p_wallet_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_wallet(UUID, UUID, TEXT, TEXT, BOOLEAN, TEXT, TEXT, BOOLEAN, BOOLEAN) TO authenticated, service_role;

