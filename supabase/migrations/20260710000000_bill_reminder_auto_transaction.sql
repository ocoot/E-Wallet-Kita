-- Migration: Auto-insert transaksi saat tandai lunas bill reminder
-- Date: 2026-07-10
-- Root cause / why:
--   Sebelumnya tombol "Tandai Lunas" (web & bot) hanya mengubah flag
--   is_paid di tabel bill_reminders, tidak pernah menyentuh tabel
--   transactions. Akibatnya saldo dashboard & riwayat transaksi tidak
--   berubah meski user sudah membayar tagihan -- membingungkan user yang
--   mengharapkan pengeluaran otomatis tercatat. Disepakati (lihat diskusi
--   fitur bill reminder auto-transaction): pendekatan hybrid -- kalau
--   bill punya amount, auto-insert transaksi expense; kalau amount NULL
--   (tagihan tanpa nominal pasti, mis. listrik), tetap hanya menandai
--   lunas dan user diarahkan ke form transaksi manual untuk diisi sendiri.
--
-- Desain:
--   - linked_transaction_id: melacak transaksi yang dibuat otomatis dari
--     reminder ini, supaya bisa dihapus lagi kalau user toggle balik ke
--     belum-lunas (mencegah transaksi "hantu" yang tidak konsisten
--     dengan status bill).
--   - source 'bill_reminder' ditambahkan ke CHECK constraint transactions
--     supaya transaksi hasil auto-insert ini bisa dibedakan dari manual/
--     ai_web/telegram di riwayat & laporan, tanpa mengubah arti nilai lama.
--   - Dua RPC baru untuk dipanggil dari client web (authenticated, RLS
--     tetap berlaku karena SECURITY INVOKER): mark_bill_paid_for_user dan
--     unmark_bill_paid_for_user. Insert/delete transaksi + update bill
--     dilakukan dalam satu RPC supaya atomic (tidak ada state setengah
--     jadi kalau salah satu langkah gagal).
--   - mark_bill_paid_via_bot (RPC lama untuk Telegram, SECURITY DEFINER,
--     service_role only) diupdate dengan logic hybrid yang sama, supaya
--     web & bot konsisten.

-- ─────────────────────────────────────────────────────────────
-- 1. Kolom baru: link ke transaksi yang dibuat otomatis
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.bill_reminders
    ADD COLUMN IF NOT EXISTS linked_transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL;

-- ─────────────────────────────────────────────────────────────
-- 2. CHECK constraint transactions.source: tambah 'bill_reminder'
-- ─────────────────────────────────────────────────────────────
-- Catatan: constraint di bawah sengaja langsung mengizinkan 'installment'
-- juga (bukan cuma 'bill_reminder'), walau secara kronologis 'installment'
-- baru resmi diperkenalkan di migration 20260731000000. Ini karena branch
-- preview Supabase kadang sudah berisi data transaksi 'installment' yang
-- SAH (bukan sampah) saat migration ini dijalankan ulang -- kalau
-- constraint di sini dibuat lebih ketat dari itu, ADD CONSTRAINT akan
-- gagal (23514) menabrak data valid milik user, bukan karena datanya
-- rusak. Menyamakan daftar dengan constraint final di 20260731 membuat
-- migration ini aman dijalankan di urutan/state apa pun.
ALTER TABLE public.transactions
    DROP CONSTRAINT IF EXISTS transactions_source_check;

ALTER TABLE public.transactions
    ADD CONSTRAINT transactions_source_check
    CHECK (source IN ('manual', 'ai_web', 'telegram', 'bill_reminder', 'installment'));

-- ─────────────────────────────────────────────────────────────
-- 3. mark_bill_paid_for_user(p_bill_id)
--    Dipanggil dari web client (authenticated). SECURITY INVOKER --
--    RLS auth.uid() = user_id di bill_reminders & transactions tetap
--    berlaku sebagai garis pertahanan, jadi tidak perlu role-check manual.
--    Return needs_manual_amount = true kalau amount NULL (frontend lalu
--    arahkan user ke form transaksi manual, bukan auto-insert).
-- ─────────────────────────────────────────────────────────────
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
BEGIN
    SELECT b.* INTO v_bill
    FROM public.bill_reminders b
    WHERE b.id = p_bill_id AND b.user_id = auth.uid() AND b.is_paid = FALSE
    FOR UPDATE;

    IF v_bill IS NULL THEN
        RETURN; -- tidak ditemukan / bukan milik user / sudah lunas duluan
    END IF;

    IF v_bill.amount IS NOT NULL THEN
        INSERT INTO public.transactions (user_id, type, category, amount, note, source, transaction_date)
        VALUES (v_bill.user_id, 'expense', v_bill.category_key, v_bill.amount, v_bill.name, 'bill_reminder', CURRENT_DATE)
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

-- ─────────────────────────────────────────────────────────────
-- 4. unmark_bill_paid_for_user(p_bill_id)
--    Toggle balik ke belum-lunas: hapus transaksi yang ter-link (kalau
--    ada) supaya saldo & riwayat konsisten lagi dengan status bill.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.unmark_bill_paid_for_user(p_bill_id UUID)
RETURNS TABLE (
    id UUID,
    is_paid BOOLEAN,
    deleted_transaction_id UUID
)
SECURITY INVOKER
LANGUAGE plpgsql
AS $$
DECLARE
    v_bill RECORD;
    v_deleted_tx_id UUID;
BEGIN
    SELECT b.* INTO v_bill
    FROM public.bill_reminders b
    WHERE b.id = p_bill_id AND b.user_id = auth.uid() AND b.is_paid = TRUE
    FOR UPDATE;

    IF v_bill IS NULL THEN
        RETURN;
    END IF;

    v_deleted_tx_id := v_bill.linked_transaction_id;

    UPDATE public.bill_reminders b
    SET is_paid = FALSE, paid_at = NULL, updated_at = NOW(), linked_transaction_id = NULL
    WHERE b.id = p_bill_id;

    IF v_deleted_tx_id IS NOT NULL THEN
        DELETE FROM public.transactions t
        WHERE t.id = v_deleted_tx_id AND t.user_id = v_bill.user_id;
    END IF;

    RETURN QUERY SELECT v_bill.id, FALSE, v_deleted_tx_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.unmark_bill_paid_for_user(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unmark_bill_paid_for_user(UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- 5. mark_bill_paid_via_bot: update dengan logic hybrid yang sama
--    (replace fungsi lama dari 20260709000000_bill_reminder_notifications.sql)
-- ─────────────────────────────────────────────────────────────
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
        RETURN; -- sudah lunas duluan / tidak ditemukan
    END IF;

    IF v_bill.amount IS NOT NULL THEN
        INSERT INTO public.transactions (user_id, type, category, amount, note, source, transaction_date)
        VALUES (v_bill.user_id, 'expense', v_bill.category_key, v_bill.amount, v_bill.name, 'bill_reminder', CURRENT_DATE)
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
