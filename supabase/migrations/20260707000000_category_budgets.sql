-- Migration: Budget per kategori (Anggaran Bulanan)
-- Date: 2026-07-07
-- Root cause / why:
--   User butuh cara menetapkan batas pengeluaran bulanan per kategori dan
--   mendapat peringatan (di halaman Budget & toast saat transaksi baru)
--   ketika pengeluaran kategori tersebut mendekati/melewati batas.
--   Sebelumnya tidak ada mekanisme budget sama sekali di schema.
--
-- Desain:
--   - Satu baris budget per (user_id, category_key) yang berlaku berulang
--     setiap bulan (bukan per bulan spesifik), karena pola transactions.category
--     juga TEXT tanpa FK ke tabel categories (ikut pola yang sama, lihat
--     20260620000000_init.sql) — perhitungan "bulan ini" dilakukan di
--     aplikasi/Supabase query terhadap transactions.transaction_date.
--   - alert_threshold_percent: persentase dari monthly_limit yang memicu
--     status "warning" sebelum benar-benar over-budget (status "danger").
--   - RLS mengikuti pola identik tabel transactions (auth.uid() = user_id).

CREATE TABLE IF NOT EXISTS public.budgets (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                  UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    category_key             TEXT NOT NULL,
    monthly_limit            NUMERIC NOT NULL CHECK (monthly_limit > 0),
    alert_threshold_percent  INTEGER NOT NULL DEFAULT 80 CHECK (alert_threshold_percent BETWEEN 1 AND 100),
    created_at               TIMESTAMPTZ DEFAULT NOW(),
    updated_at               TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT budgets_user_category_unique UNIQUE (user_id, category_key)
);

ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can select their own budgets" ON public.budgets;
CREATE POLICY "Users can select their own budgets"
    ON public.budgets FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own budgets" ON public.budgets;
CREATE POLICY "Users can insert their own budgets"
    ON public.budgets FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own budgets" ON public.budgets;
CREATE POLICY "Users can update their own budgets"
    ON public.budgets FOR UPDATE
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own budgets" ON public.budgets;
CREATE POLICY "Users can delete their own budgets"
    ON public.budgets FOR DELETE
    USING (auth.uid() = user_id);

-- Daftarkan fitur "budget" ke sistem maintenance/feature-lock yang sudah ada
-- (tabel ini sudah ada sejak 20260630000000_maintenance_mode.sql), supaya
-- admin bisa mengunci halaman Budget seperti fitur lain tanpa kode baru.
INSERT INTO public.maintenance_feature_locks (feature_key, is_locked) VALUES
    ('budget', FALSE)
ON CONFLICT (feature_key) DO NOTHING;
