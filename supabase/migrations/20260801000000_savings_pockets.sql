-- Migration: Tabungan / Pos Tabungan (Savings Pockets)
-- Date: 2026-08-01
-- Root cause / why:
--   User ingin memisahkan uang ke pos-pos bertujuan (Dana Darurat, Tabungan
--   Tujuan/Goals, Pendidikan, Dana Pensiun, Investasi) TANPA kehilangan
--   uang itu dari total kekayaannya, dan TANPA menganggapnya sebagai
--   "pengeluaran" konsumtif (yang akan merusak laporan expense/budget dan
--   tidak bisa "ditarik balik" secara wajar).
--
-- Kenapa TIDAK menulis ke tabel public.transactions:
--   transactions.type di-CHECK ke ('income','expense') dan dipakai di 53+
--   tempat di kode (Dashboard, History, Budget, PDF export, parser AI/
--   Telegram, dsb) dengan asumsi income = uang masuk sungguhan & expense =
--   uang keluar sungguhan (konsumsi). Memindahkan uang ke tabungan bukan
--   keduanya -- itu transfer internal. Menambah type baru ('transfer_in'/
--   'transfer_out') akan memaksa audit ulang semua 53+ tempat itu supaya
--   tidak ikut menjumlahkannya sebagai income/expense/budget. Jauh lebih
--   aman & additive: buat ledger terpisah yang sama sekali tidak bersentuhan
--   dengan transactions, meniru pola "fitur berdiri sendiri" yang sudah ada
--   di bill_reminders & installments, tapi TANPA auto-insert ke transactions
--   (installments/bill_reminders sengaja insert ke transactions karena itu
--   memang expense sungguhan; tabungan sengaja TIDAK).
--
-- Implikasi ke perhitungan saldo (lihat get_accumulated_balance):
--   - "Saldo Tersedia" (spendable) = accumulated_balance.balance
--     - SUM(savings_pockets.current_amount WHERE NOT is_archived)
--   - "Total Tabungan"            = SUM(savings_pockets.current_amount)
--   - "Total Kekayaan" (net worth) = accumulated_balance.balance (TIDAK
--     berubah saat dana dipindah ke/dari pocket -- murni reklasifikasi,
--     bukan penambahan/pengurangan kekayaan).
--   Kalkulasi "Saldo Tersedia" & "Total Tabungan" dilakukan di client
--   (lib/db.ts) dengan menggabungkan get_accumulated_balance() +
--   get_savings_summary(), tidak perlu RPC gabungan baru.
--
-- Desain:
--   - savings_pockets: satu baris per pos tabungan per user. current_amount
--     adalah kolom biasa (bukan derived/view) yang di-maintain SECARA ATOMIK
--     oleh RPC deposit/withdraw bersamaan dengan insert baris ke
--     savings_pocket_entries, supaya saldo pocket & riwayatnya tidak pernah
--     tidak-sinkron.
--   - savings_pocket_entries: ledger riwayat setor/tarik per pocket (murni
--     historis/audit trail, bukan sumber kebenaran saldo -- current_amount
--     di savings_pockets yang menjadi sumber kebenaran, di-update di RPC
--     yang sama dalam satu transaksi).
--   - CRUD dasar pocket (create/rename/archive) memakai pola sama seperti
--     bill_reminders: langsung lewat client (supabase.from(...).insert/
--     update), diamankan oleh RLS auth.uid() = user_id, TIDAK butuh RPC.
--   - Deposit & withdraw WAJIB lewat RPC (SECURITY INVOKER, meniru pola
--     mark_installment_month_paid_for_user) karena harus atomik: update
--     current_amount + insert entry harus berhasil/gagal bersamaan, dan
--     withdraw harus divalidasi tidak boleh melebihi current_amount.

-- ─────────────────────────────────────────────────────────────
-- 1. Tabel savings_pockets
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.savings_pockets (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    pocket_type     TEXT NOT NULL CHECK (pocket_type IN (
                        'emergency_fund',  -- Dana Darurat
                        'goal',            -- Tabungan Tujuan (liburan, gawai, nikah, dst)
                        'education',       -- Tabungan Pendidikan
                        'retirement',      -- Dana Pensiun
                        'investment'       -- Investasi (reksa dana, saham, obligasi)
                     )),
    target_amount   NUMERIC CHECK (target_amount IS NULL OR target_amount > 0), -- opsional, informatif
    target_date     DATE,                                                       -- opsional, mis. tanggal nikah
    current_amount  NUMERIC NOT NULL DEFAULT 0 CHECK (current_amount >= 0),
    notes           TEXT,
    is_archived     BOOLEAN NOT NULL DEFAULT FALSE, -- "selesai/ditutup" tanpa menghapus riwayat
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.savings_pockets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can select their own savings pockets" ON public.savings_pockets;
CREATE POLICY "Users can select their own savings pockets"
    ON public.savings_pockets FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own savings pockets" ON public.savings_pockets;
CREATE POLICY "Users can insert their own savings pockets"
    ON public.savings_pockets FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own savings pockets" ON public.savings_pockets;
CREATE POLICY "Users can update their own savings pockets"
    ON public.savings_pockets FOR UPDATE
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own savings pockets" ON public.savings_pockets;
CREATE POLICY "Users can delete their own savings pockets"
    ON public.savings_pockets FOR DELETE
    USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_savings_pockets_user_id ON public.savings_pockets(user_id);

-- ─────────────────────────────────────────────────────────────
-- 2. Tabel savings_pocket_entries (riwayat setor/tarik, audit trail)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.savings_pocket_entries (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pocket_id    UUID NOT NULL REFERENCES public.savings_pockets(id) ON DELETE CASCADE,
    user_id      UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE, -- denormalized, untuk RLS langsung tanpa join
    direction    TEXT NOT NULL CHECK (direction IN ('deposit', 'withdrawal')),
    amount       NUMERIC NOT NULL CHECK (amount > 0),
    note         TEXT,
    entry_date   DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.savings_pocket_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can select their own savings entries" ON public.savings_pocket_entries;
CREATE POLICY "Users can select their own savings entries"
    ON public.savings_pocket_entries FOR SELECT
    USING (auth.uid() = user_id);

-- Sengaja TIDAK ada policy INSERT/UPDATE/DELETE langsung untuk role
-- 'authenticated' di sini. Semua mutasi entries WAJIB lewat RPC
-- deposit_to_pocket_for_user / withdraw_from_pocket_for_user di bawah,
-- supaya current_amount di savings_pockets tidak pernah tidak-sinkron
-- dengan riwayat entries-nya. RPC berjalan SECURITY INVOKER sehingga tetap
-- tunduk ke RLS, jadi butuh policy INSERT khusus yang hanya bisa dipenuhi
-- lewat body function (WITH CHECK identik, tapi tanpa GRANT langsung ke
-- tabel, client tidak bisa insert manual selain lewat RPC).
DROP POLICY IF EXISTS "Only RPC can insert savings entries" ON public.savings_pocket_entries;
CREATE POLICY "Only RPC can insert savings entries"
    ON public.savings_pocket_entries FOR INSERT
    WITH CHECK (auth.uid() = user_id);

REVOKE INSERT, UPDATE, DELETE ON public.savings_pocket_entries FROM authenticated;

CREATE INDEX IF NOT EXISTS idx_savings_pocket_entries_pocket_id ON public.savings_pocket_entries(pocket_id);
CREATE INDEX IF NOT EXISTS idx_savings_pocket_entries_user_id ON public.savings_pocket_entries(user_id);

-- Daftarkan fitur ke sistem maintenance/feature-lock, sama seperti fitur lain.
INSERT INTO public.maintenance_feature_locks (feature_key, is_locked) VALUES
    ('savings', FALSE)
ON CONFLICT (feature_key) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- 3. RPC: deposit_to_pocket_for_user
--    Setor dana dari "saldo tersedia" ke sebuah pocket. Tidak menyentuh
--    transactions sama sekali -- accumulated balance TIDAK berkurang,
--    hanya current_amount pocket yang bertambah (uang berpindah klasifikasi,
--    bukan hilang).
-- ─────────────────────────────────────────────────────────────
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

-- ─────────────────────────────────────────────────────────────
-- 4. RPC: withdraw_from_pocket_for_user
--    Tarik dana dari pocket kembali ke "saldo tersedia". Divalidasi tidak
--    boleh melebihi current_amount (tidak boleh minus).
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.withdraw_from_pocket_for_user(
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

-- ─────────────────────────────────────────────────────────────
-- 5. RPC: get_savings_summary
--    Agregat ringan (SUM di server) untuk kartu "Total Tabungan" di
--    Dashboard, meniru pola get_accumulated_balance.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_savings_summary()
RETURNS TABLE (
    total_saved NUMERIC,
    pocket_count INTEGER
)
SECURITY INVOKER
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        COALESCE(SUM(p.current_amount), 0) AS total_saved,
        COUNT(*)::INTEGER AS pocket_count
    FROM public.savings_pockets p
    WHERE p.user_id = auth.uid() AND p.is_archived = FALSE;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_savings_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_savings_summary() TO authenticated;
