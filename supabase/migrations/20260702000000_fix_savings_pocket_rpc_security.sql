-- ─────────────────────────────────────────────────────────────
-- Fix: deposit_to_pocket_for_user & withdraw_from_pocket_for_user
--
-- Bug: kedua RPC ini dideklarasikan SECURITY INVOKER, sementara
-- INSERT ke public.savings_pocket_entries sudah di-REVOKE dari role
-- 'authenticated' (lihat migration 20260801000000_savings_pockets.sql).
--
-- Postgres mengecek GRANT privilege SEBELUM RLS policy dievaluasi.
-- Karena INSERT sudah dicabut dari 'authenticated', dan function
-- berjalan sebagai pemanggil (SECURITY INVOKER), insert di dalam RPC
-- pun gagal dengan:
--   42501 permission denied for table savings_pocket_entries
-- RLS policy "Only RPC can insert savings entries" tidak pernah
-- sempat dicek karena sudah diblokir duluan di level grant.
--
-- Fix: ubah ke SECURITY DEFINER (dengan search_path dikunci untuk
-- mencegah search_path hijacking) supaya insert berjalan dengan hak
-- akses pemilik function, sementara client tetap tidak bisa insert
-- langsung ke tabel karena grant sudah dicabut. Validasi kepemilikan
-- pocket (WHERE user_id = auth.uid()) tetap dijalankan manual di body
-- function, jadi tidak ada celah user lain bisa deposit/withdraw ke
-- pocket orang lain.
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.deposit_to_pocket_for_user(
    p_pocket_id UUID,
    p_amount NUMERIC,
    p_note TEXT DEFAULT NULL,
    p_entry_date DATE DEFAULT CURRENT_DATE
)
RETURNS public.savings_pockets
SECURITY DEFINER
SET search_path = public, pg_temp
LANGUAGE plpgsql
AS $$
DECLARE
    v_pocket public.savings_pockets;
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

CREATE OR REPLACE FUNCTION public.withdraw_from_pocket_for_user(
    p_pocket_id UUID,
    p_amount NUMERIC,
    p_note TEXT DEFAULT NULL,
    p_entry_date DATE DEFAULT CURRENT_DATE
)
RETURNS public.savings_pockets
SECURITY DEFINER
SET search_path = public, pg_temp
LANGUAGE plpgsql
AS $$
DECLARE
    v_pocket public.savings_pockets;
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

    IF p_amount > v_pocket.current_amount THEN
        RAISE EXCEPTION 'INSUFFICIENT_POCKET_BALANCE';
    END IF;

    INSERT INTO public.savings_pocket_entries (pocket_id, user_id, direction, amount, note, entry_date)
    VALUES (p_pocket_id, auth.uid(), 'withdrawal', p_amount, p_note, p_entry_date);

    UPDATE public.savings_pockets
    SET current_amount = current_amount - p_amount,
        updated_at = NOW()
    WHERE id = p_pocket_id
    RETURNING * INTO v_pocket;

    RETURN v_pocket;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.withdraw_from_pocket_for_user(UUID, NUMERIC, TEXT, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.withdraw_from_pocket_for_user(UUID, NUMERIC, TEXT, DATE) TO authenticated;
