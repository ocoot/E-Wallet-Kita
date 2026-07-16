-- Migration: Ganti "Arsipkan" pos dompet jadi hapus permanen
-- Date: 2026-08-22
-- Deskripsi:
--   Sebelumnya tombol di kartu pos dompet (E-Wallet/Rekening/Cash) hanya
--   meng-arsipkan (is_archived = TRUE), pos & seluruh transaksinya tetap
--   ada di database, cuma disembunyikan dari daftar aktif. Sekarang diganti
--   jadi HAPUS PERMANEN: pos dompet dan SELURUH riwayat transaksi yang
--   terhubung ke pos tersebut ikut terhapus (bukan sekadar wallet_id di-null
--   -kan seperti default ON DELETE SET NULL pada FK transactions.wallet_id).
--   Konfirmasi + peringatan dilakukan di sisi client (lihat Wallets.tsx).
--
--   Pos "Saldo Total" (type = 'general') tetap tidak boleh dihapus -- itu
--   pos default sistem, sama seperti aturan lama utk archive.

CREATE OR REPLACE FUNCTION public.delete_wallet(
    p_user_id UUID,
    p_wallet_id UUID
)
RETURNS VOID
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    v_owner UUID;
    v_type TEXT;
BEGIN
    SELECT user_id, type INTO v_owner, v_type FROM public.wallets WHERE id = p_wallet_id;

    IF v_owner IS NULL OR v_owner <> p_user_id THEN
        RAISE EXCEPTION 'Wallet tidak ditemukan atau bukan milik user ini';
    END IF;

    IF v_type = 'general' THEN
        RAISE EXCEPTION 'Pos Saldo Total tidak bisa dihapus';
    END IF;

    -- Hapus permanen seluruh riwayat transaksi yang terhubung ke pos ini
    -- (bukan cuma di-lepas wallet_id-nya) -- sesuai peringatan yang
    -- ditampilkan ke user sebelum konfirmasi hapus.
    DELETE FROM public.transactions
    WHERE wallet_id = p_wallet_id AND user_id = p_user_id;

    -- Referensi non-transaksi (bill reminder/cicilan/pos tabungan & emas
    -- yang default wallet-nya pos ini) sengaja TIDAK ikut dihapus -- FK
    -- wallet_id di tabel-tabel itu sudah ON DELETE SET NULL, jadi otomatis
    -- balik ke "belum ada pos default" tanpa kehilangan datanya sendiri.
    DELETE FROM public.wallets
    WHERE id = p_wallet_id AND user_id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_wallet(UUID, UUID) TO authenticated, service_role;
