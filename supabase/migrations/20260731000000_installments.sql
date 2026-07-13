-- Migration: Cicilan / Utang Jangka Panjang (Installments)
-- Date: 2026-07-31
-- Root cause / why:
--   Bill reminders (lihat 20260708000000) cocok untuk tagihan berulang yang
--   TIDAK punya titik akhir (listrik, langganan, dst). Tapi cicilan motor,
--   KPR, atau utang punya tenor pasti (mis. 24 bulan) dan user ingin melihat
--   progres pelunasannya ("12 dari 24 bulan selesai"), bukan cuma status
--   lunas/belum-lunas bulan berjalan. Tanpa ini, user harus menghitung
--   manual progres cicilannya sendiri di luar aplikasi.
--
-- Desain:
--   - Satu baris per cicilan/utang per user. total_months = tenor penuh,
--     months_paid = progres saat ini (0..total_months).
--   - is_completed di-derive dari months_paid >= total_months, disimpan
--     sebagai kolom biasa (bukan GENERATED) supaya RPC bisa meng-update-nya
--     eksplisit bersamaan dengan months_paid dalam satu statement.
--   - Pola hybrid yang sama dengan bill_reminders: "Tandai bulan ini lunas"
--     akan auto-insert transaksi expense sebesar monthly_amount (kalau
--     terisi), dilacak lewat last_transaction_id supaya bisa di-undo.
--   - RLS mengikuti pola identik tabel bill_reminders (auth.uid() = user_id).

CREATE TABLE IF NOT EXISTS public.installments (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    name             TEXT NOT NULL,
    category_key     TEXT NOT NULL DEFAULT 'other',
    principal_amount NUMERIC CHECK (principal_amount IS NULL OR principal_amount > 0), -- total pokok pinjaman (opsional, informatif)
    monthly_amount   NUMERIC CHECK (monthly_amount IS NULL OR monthly_amount > 0),     -- cicilan per bulan (NULL = nominal bervariasi)
    total_months     INTEGER NOT NULL CHECK (total_months > 0),                        -- tenor penuh, mis. 24
    months_paid      INTEGER NOT NULL DEFAULT 0 CHECK (months_paid >= 0),
    start_date       DATE NOT NULL DEFAULT CURRENT_DATE,                               -- tanggal mulai cicilan bulan ke-1
    is_completed     BOOLEAN NOT NULL DEFAULT FALSE,
    notes            TEXT,
    last_transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
    created_at       TIMESTAMPTZ DEFAULT NOW(),
    updated_at       TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT installments_months_paid_within_tenor CHECK (months_paid <= total_months)
);

ALTER TABLE public.installments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can select their own installments" ON public.installments;
CREATE POLICY "Users can select their own installments"
    ON public.installments FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own installments" ON public.installments;
CREATE POLICY "Users can insert their own installments"
    ON public.installments FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own installments" ON public.installments;
CREATE POLICY "Users can update their own installments"
    ON public.installments FOR UPDATE
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own installments" ON public.installments;
CREATE POLICY "Users can delete their own installments"
    ON public.installments FOR DELETE
    USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_installments_user_id ON public.installments(user_id);

-- Daftarkan fitur "installments" ke sistem maintenance/feature-lock, seperti
-- bill_reminders, supaya admin bisa mengunci halaman ini lewat Admin Panel.
INSERT INTO public.maintenance_feature_locks (feature_key, is_locked) VALUES
    ('installments', FALSE)
ON CONFLICT (feature_key) DO NOTHING;

-- Tambahkan 'installment' ke source transaksi yang valid, sama seperti
-- 'bill_reminder' ditambahkan sebelumnya di 20260710000000.
-- Jaring pengaman yang sama: normalisasi dulu baris lama yang source-nya
-- di luar daftar valid, supaya ADD CONSTRAINT tidak gagal dengan 23514.
UPDATE public.transactions
SET source = 'manual'
WHERE source IS NOT NULL
  AND source NOT IN ('manual', 'ai_web', 'telegram', 'bill_reminder', 'installment');

ALTER TABLE public.transactions
    DROP CONSTRAINT IF EXISTS transactions_source_check;

ALTER TABLE public.transactions
    ADD CONSTRAINT transactions_source_check
    CHECK (source IN ('manual', 'ai_web', 'telegram', 'bill_reminder', 'installment'));

-- ─────────────────────────────────────────────────────────────
-- mark_installment_month_paid_for_user(p_installment_id)
-- Tandai 1 bulan cicilan sebagai lunas: increment months_paid, auto-insert
-- transaksi expense (kalau monthly_amount terisi), set is_completed kalau
-- sudah mencapai total_months. SECURITY INVOKER -- RLS tetap berlaku.
-- ─────────────────────────────────────────────────────────────
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
BEGIN
    SELECT i.* INTO v_inst
    FROM public.installments i
    WHERE i.id = p_installment_id AND i.user_id = auth.uid() AND i.is_completed = FALSE
    FOR UPDATE;

    IF v_inst IS NULL THEN
        RETURN; -- tidak ditemukan / bukan milik user / sudah lunas semua
    END IF;

    IF v_inst.monthly_amount IS NOT NULL THEN
        INSERT INTO public.transactions (user_id, type, category, amount, note, source, transaction_date)
        VALUES (
            v_inst.user_id, 'expense', v_inst.category_key, v_inst.monthly_amount,
            v_inst.name || ' (' || (v_inst.months_paid + 1) || '/' || v_inst.total_months || ')',
            'installment', CURRENT_DATE
        )
        RETURNING transactions.id INTO v_tx_id;
    END IF;

    UPDATE public.installments i
    SET months_paid = v_inst.months_paid + 1,
        is_completed = (v_inst.months_paid + 1) >= v_inst.total_months,
        last_transaction_id = v_tx_id,
        updated_at = NOW()
    WHERE i.id = p_installment_id;

    RETURN QUERY SELECT
        v_inst.id,
        v_inst.months_paid + 1,
        v_inst.total_months,
        (v_inst.months_paid + 1) >= v_inst.total_months,
        v_tx_id,
        v_inst.monthly_amount IS NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_installment_month_paid_for_user(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_installment_month_paid_for_user(UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- unmark_installment_last_payment_for_user(p_installment_id)
-- Undo pembayaran bulan terakhir: decrement months_paid, hapus transaksi
-- terkait (kalau ada), buka lagi is_completed kalau sebelumnya true.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.unmark_installment_last_payment_for_user(p_installment_id UUID)
RETURNS TABLE (
    id UUID,
    months_paid INTEGER,
    is_completed BOOLEAN,
    deleted_transaction_id UUID
)
SECURITY INVOKER
LANGUAGE plpgsql
AS $$
DECLARE
    v_inst RECORD;
    v_deleted_tx_id UUID;
BEGIN
    SELECT i.* INTO v_inst
    FROM public.installments i
    WHERE i.id = p_installment_id AND i.user_id = auth.uid() AND i.months_paid > 0
    FOR UPDATE;

    IF v_inst IS NULL THEN
        RETURN;
    END IF;

    v_deleted_tx_id := v_inst.last_transaction_id;

    UPDATE public.installments i
    SET months_paid = v_inst.months_paid - 1,
        is_completed = FALSE,
        last_transaction_id = NULL,
        updated_at = NOW()
    WHERE i.id = p_installment_id;

    IF v_deleted_tx_id IS NOT NULL THEN
        DELETE FROM public.transactions t
        WHERE t.id = v_deleted_tx_id AND t.user_id = v_inst.user_id;
    END IF;

    RETURN QUERY SELECT v_inst.id, v_inst.months_paid - 1, FALSE, v_deleted_tx_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.unmark_installment_last_payment_for_user(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unmark_installment_last_payment_for_user(UUID) TO authenticated;
