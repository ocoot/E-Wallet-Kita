-- Migration: Sync confirm_and_insert_telegram_tx with production
-- Date: 2026-06-26
-- Description:
--   File migration sebelumnya (20260621010000_telegram_v2_rpcs.sql) sempat di-edit
--   untuk membuat klaim atomic (DELETE ... RETURNING ... INTO) sebagai perbaikan
--   race condition double-tap pada tombol konfirmasi transaksi Telegram.
--
--   Namun versi yang benar-benar dijalankan di production mengembalikan status
--   'already_confirmed' untuk kasus double-tap, BUKAN 'expired' seperti yang
--   tertulis di file migration repo. File ini menulis ulang definisi function
--   agar repo dan production konsisten, sehingga migration history tidak
--   menyimpang dari schema yang sesungguhnya berjalan di production.
--
--   Tidak ada perubahan perilaku terhadap production — function ini murni
--   menyamakan apa yang sudah live.

CREATE OR REPLACE FUNCTION public.confirm_and_insert_telegram_tx(
    p_chat_id BIGINT,
    p_date DATE
)
RETURNS TABLE (
    status TEXT,
    type TEXT,
    category_key TEXT,
    amount NUMERIC,
    original_text TEXT
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    v_user_id UUID;
    v_pending RECORD;
BEGIN
    -- Cari user
    SELECT u.id INTO v_user_id FROM public.users u WHERE u.telegram_chat_id = p_chat_id LIMIT 1;
    IF v_user_id IS NULL THEN
        RETURN QUERY SELECT 'not_found'::TEXT, NULL::TEXT, NULL::TEXT, NULL::NUMERIC, NULL::TEXT;
        RETURN;
    END IF;

    -- KLAIM atomik: DELETE + RETURNING dalam satu statement.
    -- Kalau ada 2 request bersamaan (mis. double-tap tombol konfirmasi,
    -- atau retry webhook dari Telegram), hanya SATU yang akan berhasil
    -- mendapatkan baris ini (row-level lock otomatis oleh Postgres).
    -- Request kedua akan mendapati 0 baris -> 'already_confirmed'.
    DELETE FROM public.telegram_pending_transactions
    WHERE chat_id = p_chat_id
    RETURNING chat_id, type, category_key, amount, original_text
    INTO v_pending;

    IF v_pending IS NULL THEN
        -- Tidak ada pending: sudah dikonfirmasi sebelumnya (klaim diambil
        -- request lain), atau memang sudah expired/dibersihkan.
        RETURN QUERY SELECT 'already_confirmed'::TEXT, NULL::TEXT, NULL::TEXT, NULL::NUMERIC, NULL::TEXT;
        RETURN;
    END IF;

    -- Insert transaksi aktif (baris pending sudah "diklaim" duluan di atas,
    -- sehingga tidak mungkin lagi terjadi duplicate insert).
    INSERT INTO public.transactions (
        user_id,
        type,
        category,
        amount,
        note,
        source,
        transaction_date
    ) VALUES (
        v_user_id,
        v_pending.type,
        v_pending.category_key,
        v_pending.amount,
        v_pending.original_text,
        'telegram',
        COALESCE(p_date, CURRENT_DATE)
    );

    RETURN QUERY SELECT
        'saved'::TEXT,
        v_pending.type::TEXT,
        v_pending.category_key::TEXT,
        v_pending.amount::NUMERIC,
        v_pending.original_text::TEXT;
END;
$$;
