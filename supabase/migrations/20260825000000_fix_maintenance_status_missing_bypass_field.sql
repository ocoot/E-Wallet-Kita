-- Migration: Fix get_maintenance_status() missing bypass_in_sandbox field
-- Date: 2026-08-25
-- Description:
--   Bug: RPC get_maintenance_status() didefinisikan ulang (CREATE OR REPLACE)
--   di DUA migration:
--     1. 20260628000001_feature_lock_sandbox_bypass.sql
--        -> versi BENAR, menyertakan `bypass_in_sandbox` di JSON locked_features.
--     2. 20260630000000_maintenance_mode.sql
--        -> versi LAMA (tanpa `bypass_in_sandbox`), tapi timestamp filenya
--           LEBIH BARU (30 Juni > 28 Juni), sehingga migration ini berjalan
--           SETELAH migration #1 dan menimpa kembali fungsi ke versi yang
--           tidak menyertakan bypass_in_sandbox.
--
--   Dampak: RPC admin_set_feature_sandbox_bypass tetap berhasil menyimpan
--   nilai bypass_in_sandbox ke kolom di tabel maintenance_feature_locks,
--   tapi get_maintenance_status() (dipanggil ulang setiap refresh halaman /
--   oleh MaintenanceContext) tidak pernah mengembalikan field tsb ke
--   frontend. Akibatnya toggle "Bypass di dev/sandbox" di Admin > Maintenance
--   tampak "reset ke off" setiap kali halaman di-refresh, padahal nilainya
--   sebenarnya tersimpan dengan benar di database.
--
--   Fix: definisikan ulang get_maintenance_status() (final, definitif) agar
--   kembali menyertakan bypass_in_sandbox. Migration lama TIDAK diubah
--   (menjaga riwayat migration tetap apa adanya); perbaikan dilakukan lewat
--   migration baru ini yang berjalan paling akhir.

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
