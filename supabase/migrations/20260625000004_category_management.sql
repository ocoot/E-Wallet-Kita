-- Migration: Category Management for Admin Panel
-- Date: 2026-06-25

-- Tambah kolom is_active agar kategori bisa dinonaktifkan tanpa dihapus
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS label_id   TEXT,
  ADD COLUMN IF NOT EXISTS label_en   TEXT,
  ADD COLUMN IF NOT EXISTS is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Sinkronkan label dari categoryDefinitions yang sudah ada
UPDATE public.categories SET label_id = 'Gaji Masuk',       label_en = 'Salary'            WHERE key = 'salary';
UPDATE public.categories SET label_id = 'Bonus & THR',      label_en = 'Bonus'             WHERE key = 'bonus';
UPDATE public.categories SET label_id = 'Makanan & Minuman',label_en = 'Food & Drink'      WHERE key = 'food_drink';
UPDATE public.categories SET label_id = 'Belanja Bulanan',  label_en = 'Monthly Groceries' WHERE key = 'monthly_groceries';
UPDATE public.categories SET label_id = 'Belanja Sayur',    label_en = 'Vegetables'        WHERE key = 'vegetables';
UPDATE public.categories SET label_id = 'Tagihan & Pulsa',  label_en = 'Bills'             WHERE key = 'bills';
UPDATE public.categories SET label_id = 'Transportasi',     label_en = 'Transportation'    WHERE key = 'transport';
UPDATE public.categories SET label_id = 'Kesehatan',        label_en = 'Health'            WHERE key = 'health';
UPDATE public.categories SET label_id = 'Belanja Online',   label_en = 'Online Shopping'   WHERE key = 'shopping';
UPDATE public.categories SET label_id = 'Hiburan',          label_en = 'Entertainment'     WHERE key = 'entertainment';
UPDATE public.categories SET label_id = 'Pendidikan',       label_en = 'Education'         WHERE key = 'education';
UPDATE public.categories SET label_id = 'Lain-lain',        label_en = 'Other'             WHERE key = 'other';

-- RPC: Tambah kategori baru (hanya admin/owner)
CREATE OR REPLACE FUNCTION public.admin_add_category(
  p_key      TEXT,
  p_label_id TEXT,
  p_label_en TEXT,
  p_type     TEXT
)
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_role TEXT;
BEGIN
  SELECT role INTO v_role FROM public.users WHERE id = auth.uid();
  IF v_role NOT IN ('admin', 'owner') THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;
  IF p_type NOT IN ('income', 'expense', 'both') THEN
    RAISE EXCEPTION 'INVALID_TYPE';
  END IF;

  INSERT INTO public.categories (key, type, label_id, label_en, is_active)
  VALUES (p_key, p_type, p_label_id, p_label_en, TRUE)
  ON CONFLICT (key) DO NOTHING;

  RETURN TRUE;
END;
$$;

-- RPC: Update label kategori (hanya admin/owner)
CREATE OR REPLACE FUNCTION public.admin_update_category(
  p_key      TEXT,
  p_label_id TEXT,
  p_label_en TEXT,
  p_type     TEXT,
  p_is_active BOOLEAN
)
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_role TEXT;
BEGIN
  SELECT role INTO v_role FROM public.users WHERE id = auth.uid();
  IF v_role NOT IN ('admin', 'owner') THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  UPDATE public.categories
  SET label_id = p_label_id,
      label_en = p_label_en,
      type     = p_type,
      is_active = p_is_active
  WHERE key = p_key;

  RETURN TRUE;
END;
$$;
