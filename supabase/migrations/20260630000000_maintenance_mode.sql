-- Migration: Maintenance Mode & Feature Locking
-- Date: 2026-06-30
-- Description:
--   1. Tabel singleton `maintenance_settings` untuk status global maintenance
--      (aktif/nonaktif) beserta pesan running text (ID & EN), tanpa hardcode
--      teks di kode aplikasi — semua teks disimpan & dikelola dari sini.
--   2. Tabel `maintenance_feature_locks` untuk mengunci fitur tertentu
--      (per feature_key) agar tidak dapat diakses user, baik di web app
--      maupun di bot Telegram.
--   3. RPC publik `get_maintenance_status` agar bisa dibaca oleh user biasa
--      (untuk running text & gembok fitur) dan oleh bot Telegram (lewat
--      service role) tanpa perlu endpoint API baru.
--   4. RPC admin `admin_set_maintenance_mode` & `admin_set_feature_lock`
--      yang hanya bisa dipanggil oleh role 'admin' atau 'owner', dengan
--      audit log mengikuti pola admin_audit_logs yang sudah ada.

-- ─────────────────────────────────────────────────────────────
-- 1. Tabel singleton: status maintenance global + pesan running text
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.maintenance_settings (
  id              SMALLINT     PRIMARY KEY DEFAULT 1,
  is_active       BOOLEAN      NOT NULL DEFAULT FALSE,
  message_id      TEXT         NOT NULL DEFAULT 'Sedang ada maintenance, beberapa fitur mungkin akan terkendala.',
  message_en      TEXT         NOT NULL DEFAULT 'Maintenance is in progress, some features may be temporarily affected.',
  updated_by      UUID         REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT maintenance_settings_singleton CHECK (id = 1)
);

-- Pastikan baris singleton selalu ada
INSERT INTO public.maintenance_settings (id) VALUES (1)
  ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.maintenance_settings ENABLE ROW LEVEL SECURITY;

-- Semua user (termasuk anon, untuk halaman login) boleh membaca status maintenance
DROP POLICY IF EXISTS "Anyone can read maintenance settings" ON public.maintenance_settings;
CREATE POLICY "Anyone can read maintenance settings"
  ON public.maintenance_settings FOR SELECT
  USING (TRUE);

-- Tidak ada INSERT/UPDATE/DELETE langsung dari client; semua lewat RPC SECURITY DEFINER
REVOKE INSERT, UPDATE, DELETE ON public.maintenance_settings FROM anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- 2. Tabel: daftar fitur yang dikunci
--    feature_key adalah identitas fitur yang bersifat data, BUKAN string
--    yang di-hardcode di kode—frontend & bot membaca daftar ini secara
--    dinamis untuk menentukan fitur mana yang sedang terkunci.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.maintenance_feature_locks (
  feature_key   TEXT         PRIMARY KEY,
  is_locked     BOOLEAN      NOT NULL DEFAULT FALSE,
  updated_by    UUID         REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Seed daftar fitur yang dapat dikunci. Menambah fitur baru di masa depan
-- cukup dengan menambah baris baru di sini, tanpa perlu mengubah kode.
INSERT INTO public.maintenance_feature_locks (feature_key, is_locked) VALUES
  ('new_transaction', FALSE),
  ('history',         FALSE),
  ('settings',         FALSE),
  ('receipt_scan',     FALSE),
  ('telegram_bot',     FALSE)
ON CONFLICT (feature_key) DO NOTHING;

ALTER TABLE public.maintenance_feature_locks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read feature locks" ON public.maintenance_feature_locks;
CREATE POLICY "Anyone can read feature locks"
  ON public.maintenance_feature_locks FOR SELECT
  USING (TRUE);

REVOKE INSERT, UPDATE, DELETE ON public.maintenance_feature_locks FROM anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- 3. RPC publik: baca status maintenance + daftar fitur terkunci sekaligus
--    Dipanggil oleh frontend (anon/authenticated) maupun bot Telegram
--    (service role), jadi satu sumber kebenaran untuk kedua sisi.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_maintenance_status()
RETURNS JSON
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_settings RECORD;
  v_locks JSON;
BEGIN
  SELECT is_active, message_id, message_en, updated_at
  INTO v_settings
  FROM public.maintenance_settings
  WHERE id = 1;

  SELECT COALESCE(json_agg(json_build_object(
           'feature_key', feature_key,
           'is_locked', is_locked
         )), '[]'::json)
  INTO v_locks
  FROM public.maintenance_feature_locks;

  RETURN json_build_object(
    'is_active', COALESCE(v_settings.is_active, FALSE),
    'message_id', v_settings.message_id,
    'message_en', v_settings.message_en,
    'updated_at', v_settings.updated_at,
    'locked_features', v_locks
  );
END;
$$;

-- Izinkan siapa saja (termasuk anon & bot lewat service role) memanggil RPC ini
GRANT EXECUTE ON FUNCTION public.get_maintenance_status() TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- 4. RPC admin: ubah status maintenance global (on/off + pesan)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_set_maintenance_mode(
  p_is_active   BOOLEAN,
  p_message_id  TEXT DEFAULT NULL,
  p_message_en  TEXT DEFAULT NULL
)
RETURNS JSON
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_caller_role TEXT;
  v_old_active  BOOLEAN;
  v_result      RECORD;
BEGIN
  SELECT role INTO v_caller_role FROM public.users WHERE id = auth.uid();
  IF v_caller_role NOT IN ('admin', 'owner') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Hanya admin atau owner yang dapat mengubah mode maintenance.';
  END IF;

  SELECT is_active INTO v_old_active FROM public.maintenance_settings WHERE id = 1;

  UPDATE public.maintenance_settings
  SET is_active  = p_is_active,
      message_id = COALESCE(p_message_id, message_id),
      message_en = COALESCE(p_message_en, message_en),
      updated_by = auth.uid(),
      updated_at = NOW()
  WHERE id = 1
  RETURNING is_active, message_id, message_en, updated_at INTO v_result;

  INSERT INTO public.admin_audit_logs (admin_id, target_user_id, action, old_value, new_value)
  VALUES (auth.uid(), NULL, 'set_maintenance_mode', v_old_active::TEXT, p_is_active::TEXT);

  RETURN json_build_object(
    'is_active', v_result.is_active,
    'message_id', v_result.message_id,
    'message_en', v_result.message_en,
    'updated_at', v_result.updated_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_maintenance_mode(BOOLEAN, TEXT, TEXT) TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- 5. RPC admin: kunci/buka kunci fitur tertentu
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_set_feature_lock(
  p_feature_key TEXT,
  p_is_locked   BOOLEAN
)
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_caller_role TEXT;
  v_old_locked  BOOLEAN;
BEGIN
  SELECT role INTO v_caller_role FROM public.users WHERE id = auth.uid();
  IF v_caller_role NOT IN ('admin', 'owner') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Hanya admin atau owner yang dapat mengunci fitur.';
  END IF;

  SELECT is_locked INTO v_old_locked
  FROM public.maintenance_feature_locks
  WHERE feature_key = p_feature_key;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVALID_FEATURE: Fitur "%" tidak dikenali.', p_feature_key;
  END IF;

  UPDATE public.maintenance_feature_locks
  SET is_locked  = p_is_locked,
      updated_by = auth.uid(),
      updated_at = NOW()
  WHERE feature_key = p_feature_key;

  INSERT INTO public.admin_audit_logs (admin_id, target_user_id, action, old_value, new_value)
  VALUES (auth.uid(), NULL, 'set_feature_lock:' || p_feature_key, v_old_locked::TEXT, p_is_locked::TEXT);

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_feature_lock(TEXT, BOOLEAN) TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- 6. Realtime: pastikan perubahan tabel ini dipancarkan ke client
--    (mengikuti pola publication default Supabase; aman dipanggil berulang)
-- ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'maintenance_settings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.maintenance_settings;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'maintenance_feature_locks'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.maintenance_feature_locks;
  END IF;
END $$;
