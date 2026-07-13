-- Migration: Lepaskan simulasi Beli/Jual Emas dari Saldo Tersedia
-- Date: 2026-08-14
-- Root cause / why:
--   Keputusan produk (lihat diskusi sebelumnya di
--   20260803000000_gold_savings.sql & 20260803050000_wallets_linking_and_details.sql):
--   "Beli"/"Jual" emas di app memakai HARGA ACUAN (harga sumber
--   logam-mulia-api + margin aplikasi sendiri), bukan harga transaksi
--   riil ke toko fisik/online. Selama cash_locked_amount ikut mengurangi
--   available_balance di get_wallets_with_balance(), setiap simulasi
--   Beli/Jual benar-benar memotong/menambah "Saldo Tersedia" yang
--   ditampilkan ke user -- padahal tidak ada uang riil yang berpindah.
--
--   Ini berisiko INKONSISTENSI PENJURNALAN kalau user juga mencatat
--   transaksi wallet biasa untuk pembelian emas fisik yang sesungguhnya
--   (lewat "Catat Fisik" + transaksi expense manual): Saldo Tersedia bisa
--   terpotong DUA KALI untuk satu kejadian riil yang sama -- sekali dari
--   transaksi wallet, sekali dari cash_locked_amount pos Beli/Jual.
--
--   Keputusan: pos Beli/Jual jadi SIMULASI MURNI -- grams_owned &
--   cash_locked_amount TETAP berubah (masih dipakai sebagai basis hitung
--   Untung/Rugi & Total Kekayaan di get_gold_holdings_summary(), lihat
--   migration 20260803020000_allow_null_buyback_price.sql), tapi TIDAK
--   LAGI dipotong dari available_balance per pos dompet. Uang yang benar-
--   benar keluar/masuk untuk transaksi emas riil sepenuhnya tanggung
--   jawab pencatatan transaksi wallet biasa oleh user (persis pola
--   "Catat Fisik" yang dari awal memang sudah dirancang begini).
--
--   TIDAK ADA perubahan skema (gold_pockets, gold_prices,
--   gold_pocket_entries tetap sama) dan TIDAK ADA perubahan pada
--   buy_gold_for_user / sell_gold_for_user / adjust_gold_holding_for_user
--   -- satu-satunya perubahan ada di get_wallets_with_balance(), yang
--   sekarang mengabaikan gold_pockets.cash_locked_amount sama sekali saat
--   menghitung earmarked_amount/available_balance. savings_pockets TIDAK
--   terpengaruh migration ini -- envelope budgeting Tabungan tetap seperti
--   semula (dana riil, dititipkan dari saldo dompet).

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
        -- earmarked_amount sekarang HANYA dana Tabungan riil (savings_pockets).
        -- gold_pockets.cash_locked_amount SENGAJA tidak diikutkan lagi --
        -- lihat catatan root cause di atas.
        COALESCE(sp.saved_sum, 0) AS earmarked_amount,
        (w.starting_balance + COALESCE(tx.tx_sum, 0)) - COALESCE(sp.saved_sum, 0) AS available_balance,
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
    WHERE w.user_id = p_user_id
    ORDER BY (w.type = 'general') DESC, w.type, w.created_at;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_wallets_with_balance(UUID) TO authenticated, service_role;

-- Dokumentasi ulang makna cash_locked_amount pasca migration ini -- supaya
-- pembaca migration lama (20260803000000_gold_savings.sql) tidak salah
-- kira kolom ini masih memotong Saldo Tersedia.
COMMENT ON COLUMN public.gold_pockets.cash_locked_amount IS
    'Modal simulasi (harga acuan pasar + margin app) yang dipakai sebagai basis hitung Untung/Rugi & Total Kekayaan di get_gold_holdings_summary(). Sejak migration 20260814000000, kolom ini TIDAK LAGI mengurangi available_balance/Saldo Tersedia di get_wallets_with_balance() -- Beli/Jual emas murni simulasi, tidak ada uang riil yang berpindah. Transaksi emas fisik riil dicatat lewat wallet transactions biasa + "Catat Fisik" (adjust_gold_holding_for_user), bukan lewat kolom ini.';
