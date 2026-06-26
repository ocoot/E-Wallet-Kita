-- Migration: Pengingat Tagihan (Bill Reminders)
-- Date: 2026-07-08
-- Root cause / why:
--   User butuh fitur untuk mencatat tagihan berulang (listrik, air, langganan,
--   cicilan, dll) beserta tanggal jatuh tempo, agar bisa mendapat peringatan
--   di dashboard sebelum tagihan jatuh tempo. Sebelumnya tidak ada mekanisme
--   reminder tagihan di schema; user hanya bisa mencatat transaksi yang sudah
--   terjadi, bukan yang akan datang.
--
-- Desain:
--   - Satu baris per tagihan per user, dengan recurrence_type untuk pola berulang.
--   - due_day: hari dalam bulan (1-31) untuk tagihan bulanan.
--   - due_date: tanggal pasti (untuk tagihan non-berulang / one-time).
--   - is_paid: flag lunas/belum untuk bulan berjalan (reset manual atau otomatis).
--   - amount: nominal estimasi (boleh NULL jika tidak diketahui, misal tagihan listrik).
--   - RLS mengikuti pola identik tabel transactions & budgets (auth.uid() = user_id).
--   - Fitur didaftarkan ke maintenance_feature_locks supaya bisa dikunci admin.

CREATE TABLE IF NOT EXISTS public.bill_reminders (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    name             TEXT NOT NULL,
    category_key     TEXT NOT NULL DEFAULT 'other_expense',
    amount           NUMERIC CHECK (amount IS NULL OR amount > 0),
    recurrence_type  TEXT NOT NULL DEFAULT 'monthly'
                       CHECK (recurrence_type IN ('monthly', 'yearly', 'one_time')),
    -- due_day: dipakai jika recurrence_type = 'monthly' (1-31)
    due_day          INTEGER CHECK (due_day IS NULL OR (due_day BETWEEN 1 AND 31)),
    -- due_date: dipakai untuk recurrence_type = 'yearly' atau 'one_time' (YYYY-MM-DD)
    due_date         DATE,
    notes            TEXT,
    is_paid          BOOLEAN NOT NULL DEFAULT FALSE,
    paid_at          TIMESTAMPTZ,
    created_at       TIMESTAMPTZ DEFAULT NOW(),
    updated_at       TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT bill_reminders_due_check CHECK (
        (recurrence_type = 'monthly' AND due_day IS NOT NULL) OR
        (recurrence_type IN ('yearly', 'one_time') AND due_date IS NOT NULL)
    )
);

ALTER TABLE public.bill_reminders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can select their own bill reminders" ON public.bill_reminders;
CREATE POLICY "Users can select their own bill reminders"
    ON public.bill_reminders FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own bill reminders" ON public.bill_reminders;
CREATE POLICY "Users can insert their own bill reminders"
    ON public.bill_reminders FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own bill reminders" ON public.bill_reminders;
CREATE POLICY "Users can update their own bill reminders"
    ON public.bill_reminders FOR UPDATE
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own bill reminders" ON public.bill_reminders;
CREATE POLICY "Users can delete their own bill reminders"
    ON public.bill_reminders FOR DELETE
    USING (auth.uid() = user_id);

-- Daftarkan fitur "bill_reminders" ke sistem maintenance/feature-lock,
-- supaya admin bisa mengunci halaman ini lewat Admin Panel tanpa kode baru.
INSERT INTO public.maintenance_feature_locks (feature_key, is_locked) VALUES
    ('bill_reminders', FALSE)
ON CONFLICT (feature_key) DO NOTHING;
