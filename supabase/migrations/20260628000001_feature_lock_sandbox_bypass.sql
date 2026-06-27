-- Migration: Feature Lock Sandbox Bypass
-- Date: 2026-06-28
-- Description:
--   Menambahkan kolom `bypass_in_sandbox` pada tabel maintenance_feature_locks
--   agar admin dapat menandai fitur tertentu agar tidak dikunci di lingkungan
--   dev/sandbox (import.meta.env.DEV), meski is_locked=true secara global.
--
--   Ini memungkinkan tim dev menguji alur normal tanpa harus mematikan
--   maintenance global, sambil tetap bisa menguji tampilan gembok untuk
--   fitur lain yang memang ingin dikunci di dev.
--
--   Selain itu, admin/owner SELALU bypass — dihandle di sisi frontend
--   (MaintenanceContext), sehingga admin panel tetap bisa diakses meski
--   maintenance aktif, tanpa perlu perubahan DB tambahan untuk itu.

-- ─────────────────────────────────────────────────────────────
-- 1. Tambah kolom bypass_in_sandbox dengan default TRUE
--    (default TRUE = fitur yang dikunci tidak memblokir dev environment
--    secara tidak sengaja sampai admin secara eksplisit mengubahnya)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.maintenance_feature_locks
  ADD COLUMN IF NOT EXISTS bypass_in_sandbox BOOLEAN NOT NULL DEFAULT TRUE;

-- Untuk fitur yang sudah ada, set bypass_in_sandbox = TRUE agar aman
-- (tidak langsung memblokir dev env setelah migration ini dijalankan).
UPDATE public.maintenance_feature_locks
  SET bypass_in_sandbox = TRUE
  WHERE bypass_in_sandbox IS DISTINCT FROM TRUE;

-- ─────────────────────────────────────────────────────────────
-- 2. Update RPC get_maintenance_status agar menyertakan bypass_in_sandbox
--    dalam respons JSON locked_features, sehingga frontend bisa membacanya.
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
           'feature_key',       feature_key,
           'is_locked',         is_locked,
           'bypass_in_sandbox', bypass_in_sandbox
         )), '[]'::json)
  INTO v_locks
  FROM public.maintenance_feature_locks;

  RETURN json_build_object(
    'is_active',       COALESCE(v_settings.is_active, FALSE),
    'message_id',      v_settings.message_id,
    'message_en',      v_settings.message_en,
    'updated_at',      v_settings.updated_at,
    'locked_features', v_locks
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_maintenance_status() TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- 3. RPC admin baru: ubah bypass_in_sandbox per fitur
--    Dipisah dari admin_set_feature_lock agar kedua kontrol (lock & bypass)
--    dapat diubah secara independen tanpa risiko menimpa satu sama lain.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_set_feature_sandbox_bypass(
  p_feature_key       TEXT,
  p_bypass_in_sandbox BOOLEAN
)
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_caller_role TEXT;
  v_old_bypass  BOOLEAN;
BEGIN
  SELECT role INTO v_caller_role FROM public.users WHERE id = auth.uid();
  IF v_caller_role NOT IN ('admin', 'owner') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Hanya admin atau owner yang dapat mengubah sandbox bypass.';
  END IF;

  SELECT bypass_in_sandbox INTO v_old_bypass
  FROM public.maintenance_feature_locks
  WHERE feature_key = p_feature_key;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVALID_FEATURE: Fitur "%" tidak dikenali.', p_feature_key;
  END IF;

  UPDATE public.maintenance_feature_locks
  SET bypass_in_sandbox = p_bypass_in_sandbox,
      updated_by        = auth.uid(),
      updated_at        = NOW()
  WHERE feature_key = p_feature_key;

  -- Audit log mengikuti pola yang sudah ada
  INSERT INTO public.admin_audit_logs (admin_id, target_user_id, action, old_value, new_value)
  VALUES (
    auth.uid(),
    NULL,
    'set_feature_sandbox_bypass:' || p_feature_key,
    v_old_bypass::TEXT,
    p_bypass_in_sandbox::TEXT
  );

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_feature_sandbox_bypass(TEXT, BOOLEAN) TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- 4. Pastikan kolom baru termasuk dalam seed untuk fitur-fitur yang ada
-- ─────────────────────────────────────────────────────────────
-- Tidak ada INSERT baru karena seed sudah ada di migration sebelumnya.
-- UPDATE di atas (step 1) sudah menangani baris yang sudah ada.
