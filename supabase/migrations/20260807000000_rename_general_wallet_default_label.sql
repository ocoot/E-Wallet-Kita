-- Migration: Perbaiki nama default wallet 'general' ("Saldo Total" -> "Saldo Umum")
-- Date: 2026-08-07
-- Description:
--   Audit UX menemukan bahwa nama "Saldo Total" untuk wallet bertipe 'general'
--   (pos default/fallback saat user tidak memilih pos tertentu) menyesatkan:
--   kata "Total" membuat pengguna baru mengira kartu ini adalah PENJUMLAHAN
--   dari kartu Pos Dompet lain di Dashboard (Bank Mandiri, Gopay, dst),
--   padahal itu cuma satu wallet independen seperti wallet lainnya.
--
--   Nama "Total Seluruh Pos" (key: wallet.total_balance) sudah ada terpisah
--   untuk merepresentasikan angka gabungan yang sesungguhnya di halaman
--   Wallets -- jadi tidak perlu dua istilah "Total" untuk dua hal berbeda.
--
--   Perubahan:
--     1. Fungsi ensure_general_wallet() sekarang membuat wallet baru dengan
--        nama "Saldo Umum" (bukan lagi "Saldo Total").
--     2. Data existing: wallet 'general' milik user yang MASIH memakai nama
--        default lama ("Saldo Total") di-rename otomatis ke "Saldo Umum".
--        Wallet yang sudah di-rename manual oleh user (nama lain) TIDAK
--        disentuh, supaya tidak menimpa personalisasi milik user.

-- 1. Perbarui default nama untuk wallet umum baru ------------------------------
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
        VALUES (p_user_id, 'Saldo Umum', 'general', 0)
        RETURNING id INTO v_wallet_id;
    END IF;

    RETURN v_wallet_id;
END;
$$;

-- 2. Rename wallet existing yang masih pakai nama default lama ----------------
UPDATE public.wallets
SET name = 'Saldo Umum',
    updated_at = NOW()
WHERE type = 'general'
  AND name = 'Saldo Total';
