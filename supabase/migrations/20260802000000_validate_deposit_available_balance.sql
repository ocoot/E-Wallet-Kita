-- Migration: Validasi Saldo Tersedia saat Setor ke Tabungan
-- Date: 2026-08-02
-- Root cause / why:
--   deposit_to_pocket_for_user() sebelumnya (20260801000000_savings_pockets.sql)
--   hanya memvalidasi p_amount > 0, TIDAK memvalidasi apakah user benar-benar
--   punya "Saldo Tersedia" (accumulated balance dikurangi total yang sudah
--   ada di semua pocket aktif) sebesar itu. Akibatnya user bisa menyetor
--   lebih besar dari yang sebenarnya dia punya, membuat Saldo Tersedia jadi
--   negatif tanpa peringatan apa pun -- masalah integritas data yang sama
--   persis yang ingin dihindari dengan TIDAK mencatat tabungan sebagai
--   expense di transactions (lihat rationale di migration sebelumnya).
--
-- Perbaikan:
--   Hitung v_available = accumulated balance (SUM income - SUM expense dari
--   transactions milik user, sampai HARI INI/CURRENT_DATE) dikurangi total
--   current_amount semua pocket AKTIF (termasuk pocket tujuan deposit ini,
--   karena current_amount-nya belum berubah saat pengecekan ini berjalan).
--   Kalau p_amount > v_available, RAISE EXCEPTION 'INSUFFICIENT_AVAILABLE_BALANCE'.
--   Pocket yang di-archive TIDAK dihitung sebagai "terkunci" dari saldo
--   tersedia (konsisten dengan get_savings_summary yang juga hanya
--   menjumlahkan pocket non-archived), supaya archive tidak dipakai sebagai
--   celah untuk membebaskan saldo secara tidak sengaja tanpa benar-benar
--   menarik dananya -- tapi ini berarti pocket yang di-archive DIANGGAP
--   "sudah dibebaskan" ke saldo tersedia. Ini konsisten & disengaja: kalau
--   pocket sudah tidak aktif, dananya seharusnya sudah ditarik dulu (UI
--   Savings.tsx tidak mengizinkan withdraw dari pocket archived, tapi user
--   tetap bisa archive pocket yang masih ada isinya -- kasus ini didokumentasikan
--   sebagai known limitation, bukan bug, karena current_amount pocket yang
--   di-archive tetap termasuk dalam get_savings_summary.total_saved, HANYA
--   tidak dianggap "terkunci" untuk tujuan validasi deposit baru).
--
-- Amount withdraw TIDAK perlu validasi tambahan -- sudah ada sejak awal
-- (p_amount > v_pocket.current_amount -> INSUFFICIENT_POCKET_BALANCE).

CREATE OR REPLACE FUNCTION public.deposit_to_pocket_for_user(
    p_pocket_id UUID,
    p_amount NUMERIC,
    p_note TEXT DEFAULT NULL,
    p_entry_date DATE DEFAULT CURRENT_DATE
)
RETURNS public.savings_pockets
SECURITY INVOKER
LANGUAGE plpgsql
AS $$
DECLARE
    v_pocket public.savings_pockets;
    v_accumulated_balance NUMERIC;
    v_total_saved NUMERIC;
    v_available NUMERIC;
BEGIN
    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'INVALID_AMOUNT';
    END IF;

    SELECT * INTO v_pocket
    FROM public.savings_pockets
    WHERE id = p_pocket_id AND user_id = auth.uid()
    FOR UPDATE;

    IF v_pocket IS NULL THEN
        RAISE EXCEPTION 'POCKET_NOT_FOUND';
    END IF;

    -- Saldo Tersedia = accumulated balance - total sudah tersimpan di semua
    -- pocket aktif (termasuk pocket ini sendiri, current_amount-nya belum
    -- berubah di titik ini).
    SELECT
        COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'income'), 0)
            - COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'expense'), 0)
    INTO v_accumulated_balance
    FROM public.transactions t
    WHERE t.user_id = auth.uid();

    SELECT COALESCE(SUM(p.current_amount), 0)
    INTO v_total_saved
    FROM public.savings_pockets p
    WHERE p.user_id = auth.uid() AND p.is_archived = FALSE;

    v_available := v_accumulated_balance - v_total_saved;

    IF p_amount > v_available THEN
        RAISE EXCEPTION 'INSUFFICIENT_AVAILABLE_BALANCE';
    END IF;

    INSERT INTO public.savings_pocket_entries (pocket_id, user_id, direction, amount, note, entry_date)
    VALUES (p_pocket_id, auth.uid(), 'deposit', p_amount, p_note, p_entry_date);

    UPDATE public.savings_pockets
    SET current_amount = current_amount + p_amount,
        updated_at = NOW()
    WHERE id = p_pocket_id
    RETURNING * INTO v_pocket;

    RETURN v_pocket;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.deposit_to_pocket_for_user(UUID, NUMERIC, TEXT, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.deposit_to_pocket_for_user(UUID, NUMERIC, TEXT, DATE) TO authenticated;
