-- Add description and priority columns to categories table
ALTER TABLE categories 
ADD COLUMN IF NOT EXISTS description_id TEXT,
ADD COLUMN IF NOT EXISTS description_en TEXT,
ADD COLUMN IF NOT EXISTS priority INTEGER NOT NULL DEFAULT 100;

-- Update existing categories with some sensible defaults for descriptions
UPDATE categories SET 
  description_id = 'Makanan, minuman, jajanan, kopi, dan layanan pesan antar makanan.',
  description_en = 'Food, drinks, snacks, coffee, and food delivery services.'
WHERE key = 'food_drink';

UPDATE categories SET 
  description_id = 'Bensin, transportasi umum, ojek online, parkir, dan tol.',
  description_en = 'Fuel, public transport, ride-hailing, parking, and tolls.'
WHERE key = 'transport';

UPDATE categories SET 
  description_id = 'Tagihan listrik, air, internet, dan pulsa hp.',
  description_en = 'Electricity, water, internet bills, and mobile credit.'
WHERE key = 'bills';

UPDATE categories SET 
  description_id = 'Kebutuhan kesehatan, obat-obatan, dan layanan medis.',
  description_en = 'Healthcare needs, medicines, and medical services.'
WHERE key = 'health';

UPDATE categories SET 
  description_id = 'Gaji bulanan, upah, atau pendapatan tetap.',
  description_en = 'Monthly salary, wages, or fixed income.'
WHERE key = 'salary';

-- Update RPCs to handle new fields
-- First drop old overloads to avoid confusion
DROP FUNCTION IF EXISTS public.admin_update_category(TEXT, TEXT, TEXT, TEXT, BOOLEAN);
DROP FUNCTION IF EXISTS public.admin_add_category(TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION admin_update_category(
  p_key TEXT,
  p_label_id TEXT,
  p_label_en TEXT,
  p_type TEXT,
  p_is_active BOOLEAN,
  p_description_id TEXT DEFAULT NULL,
  p_description_en TEXT DEFAULT NULL,
  p_priority INTEGER DEFAULT 100
) RETURNS VOID AS $$
DECLARE
  v_role TEXT;
BEGIN
  SELECT role INTO v_role FROM public.users WHERE id = auth.uid();
  IF v_role NOT IN ('admin', 'owner') THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  UPDATE public.categories
  SET 
    label_id = p_label_id,
    label_en = p_label_en,
    type = p_type,
    is_active = p_is_active,
    description_id = p_description_id,
    description_en = p_description_en,
    priority = p_priority
  WHERE key = p_key;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION admin_add_category(
  p_key TEXT,
  p_label_id TEXT,
  p_label_en TEXT,
  p_type TEXT,
  p_description_id TEXT DEFAULT NULL,
  p_description_en TEXT DEFAULT NULL,
  p_priority INTEGER DEFAULT 100
) RETURNS VOID AS $$
DECLARE
  v_role TEXT;
BEGIN
  SELECT role INTO v_role FROM public.users WHERE id = auth.uid();
  IF v_role NOT IN ('admin', 'owner') THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  INSERT INTO public.categories (key, label_id, label_en, type, description_id, description_en, priority, is_active)
  VALUES (p_key, p_label_id, p_label_en, p_type, p_description_id, p_description_en, p_priority, true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

