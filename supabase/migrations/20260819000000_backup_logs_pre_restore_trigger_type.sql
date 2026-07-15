-- Migration: Izinkan triggered_by = 'pre_restore' di backup_logs
-- Date: 2026-08-19
--
-- Root cause / why:
--   Insiden 15/7/2026 (kehilangan data total saat restore gagal) menunjukkan
--   restore butuh jaring pengaman: SEBELUM DELETE apa pun dijalankan,
--   sistem harus otomatis ambil backup segar dulu, supaya kalau restore-nya
--   sendiri ternyata bermasalah, admin masih punya titik pemulihan yang
--   tervalidasi (bukan cuma mengandalkan file backup lama yang dipakai
--   sebagai sumber restore).
--
--   db-restore.yml sekarang menjalankan pg_dump otomatis sebagai step
--   pertama (lihat step "Auto-backup pengaman sebelum restore") dan
--   mencatatnya ke backup_logs seperti backup biasa, tapi dengan
--   triggered_by = 'pre_restore' supaya bisa dibedakan dari backup manual/
--   terjadwal biasa di riwayat Admin Panel. Constraint lama cuma
--   mengizinkan 'cron'/'manual', jadi perlu diperluas.

ALTER TABLE public.backup_logs DROP CONSTRAINT IF EXISTS backup_logs_triggered_by_check;
ALTER TABLE public.backup_logs ADD CONSTRAINT backup_logs_triggered_by_check
  CHECK (triggered_by IN ('cron', 'manual', 'pre_restore'));
