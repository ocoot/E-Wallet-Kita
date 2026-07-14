-- Migration: Backup Restore & Delete/Bulk Delete
-- Date: 2026-08-17
-- Description:
--   Melengkapi fitur backup (20260816000000_backup_logs.sql) dengan:
--
--   1. Soft-delete di `backup_logs` (deleted_at/deleted_by) supaya admin bisa
--      hapus file backup lama dari Google Drive (hemat storage) tanpa
--      kehilangan jejak riwayat -- baris log TETAP ada, cuma ditandai
--      terhapus setelah file fisik di Google Drive sukses dihapus oleh
--      workflow `.github/workflows/db-backup-delete.yml`.
--
--   2. Tabel `backup_restorable_tables`: daftar tabel yang BOLEH di-restore
--      secara terpisah (table-scope restore), didorong oleh data -- bukan
--      hardcode di kode -- mengikuti pola `maintenance_feature_locks`.
--      Ini jawaban atas "restore tanpa menzerokan data SEMUA pengguna":
--      dengan pg_dump format custom (-Fc, lihat perubahan di db-backup.yml),
--      admin bisa restore HANYA tabel yang korup, bukan seluruh database.
--      Tabel sensitif (users, admin_audit_logs, backup_logs, dst) SENGAJA
--      tidak dimasukkan ke allow-list ini.
--
--   3. Tabel `backup_restore_logs`: riwayat percobaan restore (mirror pola
--      `backup_logs`, diisi oleh workflow `db-restore.yml` lewat service
--      role -- REVOKE total dari anon/authenticated, sama seperti
--      backup_logs).
--
--   4. RPC `admin_log_backup_action`: satu RPC generik untuk mencatat
--      permintaan restore/delete ke `admin_audit_logs` yang sudah ada,
--      supaya tidak perlu bikin tabel audit baru lagi.
--
--   Catatan: `get_backup_status()` di-CREATE OR REPLACE (bukan DROP dulu)
--   karena return type-nya tetap JSON, cuma isi payload-nya ditambah
--   (deleted_at/deleted_by pada backup, plus restore_history). Tidak ada
--   perubahan signature/return type sehingga DROP FUNCTION tidak diperlukan.

-- ─────────────────────────────────────────────────────────────
-- 1. Soft-delete kolom di backup_logs
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.backup_logs
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES public.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_backup_logs_deleted_at ON public.backup_logs(deleted_at);

-- ─────────────────────────────────────────────────────────────
-- 2. Allow-list tabel yang boleh di-restore terpisah (table-scope restore)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.backup_restorable_tables (
  table_name    TEXT        PRIMARY KEY,
  label_id      TEXT        NOT NULL,
  label_en      TEXT        NOT NULL,
  is_enabled    BOOLEAN     NOT NULL DEFAULT TRUE,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed tabel data transaksional/fitur yang aman untuk restore per-tabel.
-- SENGAJA tidak memasukkan: users, admin_audit_logs, backup_logs,
-- backup_restore_logs, error_logs, maintenance_settings,
-- maintenance_feature_locks, premium_vouchers, backup_restorable_tables
-- itu sendiri -- tabel-tabel ini terlalu sensitif/struktural untuk
-- di-restore parsial lewat tombol Admin Panel.
INSERT INTO public.backup_restorable_tables (table_name, label_id, label_en) VALUES
  ('transactions',      'Transaksi',              'Transactions'),
  ('wallets',           'Dompet',                 'Wallets'),
  ('savings_pockets',        'Kantong Tabungan',        'Savings Pockets'),
  ('savings_pocket_entries', 'Riwayat Kantong Tabungan', 'Savings Pocket Entries'),
  ('gold_pockets',       'Kantong Emas',           'Gold Pockets'),
  ('gold_pocket_entries','Riwayat Transaksi Emas',  'Gold Pocket Entries'),
  ('gold_prices',        'Harga Emas',              'Gold Prices'),
  ('installments',      'Cicilan',                 'Installments'),
  ('budgets',           'Anggaran',                'Budgets'),
  ('bill_reminders',    'Pengingat Tagihan',       'Bill Reminders'),
  ('categories',        'Kategori',                'Categories')
ON CONFLICT (table_name) DO NOTHING;

ALTER TABLE public.backup_restorable_tables ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read restorable tables" ON public.backup_restorable_tables;
CREATE POLICY "Admins can read restorable tables"
  ON public.backup_restorable_tables FOR SELECT
  USING (public.is_admin_or_owner());

REVOKE INSERT, UPDATE, DELETE ON public.backup_restorable_tables FROM anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- 3. Riwayat percobaan restore (ditulis oleh workflow via service role,
--    sama persis pola backup_logs)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.backup_restore_logs (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  source_backup_log_id  UUID        REFERENCES public.backup_logs(id) ON DELETE SET NULL,
  status                TEXT        NOT NULL DEFAULT 'running',
  -- status: 'running' | 'success' | 'failed'
  scope                 TEXT        NOT NULL,
  -- scope: 'full' (seluruh database) | 'table' (tabel terpilih saja)
  table_names           TEXT[],
  -- diisi hanya jika scope = 'table'
  triggered_by_admin    UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  error_message         TEXT,
  started_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at           TIMESTAMPTZ,
  duration_ms           INTEGER,
  CONSTRAINT backup_restore_logs_status_check
    CHECK (status IN ('running', 'success', 'failed')),
  CONSTRAINT backup_restore_logs_scope_check
    CHECK (scope IN ('full', 'table'))
);

CREATE INDEX IF NOT EXISTS idx_backup_restore_logs_started_at ON public.backup_restore_logs(started_at DESC);

ALTER TABLE public.backup_restore_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read restore logs" ON public.backup_restore_logs;
CREATE POLICY "Admins can read restore logs"
  ON public.backup_restore_logs FOR SELECT
  USING (public.is_admin_or_owner());

-- Sama seperti backup_logs: hanya service role (GitHub Actions) yang menulis.
REVOKE INSERT, UPDATE, DELETE ON public.backup_restore_logs FROM anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- 4. RPC generik untuk audit trail permintaan restore/delete
--    (dipanggil oleh api/admin/backup.ts SEBELUM memicu GitHub Actions,
--    supaya permintaannya tercatat walau workflow belum tentu selesai)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_log_backup_action(
  p_action TEXT,
  p_detail TEXT
)
RETURNS VOID
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT public.is_admin_or_owner() THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Hanya admin atau owner yang dapat melakukan aksi ini.';
  END IF;

  IF p_action NOT IN ('request_backup_restore', 'request_backup_delete') THEN
    RAISE EXCEPTION 'INVALID_ACTION: % tidak dikenali', p_action;
  END IF;

  INSERT INTO public.admin_audit_logs (admin_id, target_user_id, action, old_value, new_value)
  VALUES (auth.uid(), NULL, p_action, NULL, p_detail);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_log_backup_action(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_log_backup_action(TEXT, TEXT) TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- 5. get_backup_status(): tambah deleted_at/deleted_by pada payload
--    backup, plus riwayat restore terakhir, dalam SATU RPC yang sama
--    (menghindari round-trip tambahan dari client). Return type tetap
--    JSON -> tidak perlu DROP FUNCTION.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_backup_status()
RETURNS JSON
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_result JSON;
BEGIN
  IF NOT public.is_admin_or_owner() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT json_build_object(
    'latest', (
      SELECT row_to_json(l) FROM (
        SELECT id, status, triggered_by, file_name, file_size_bytes,
               storage_provider, error_message, started_at, finished_at,
               duration_ms, deleted_at, deleted_by
        FROM public.backup_logs
        ORDER BY started_at DESC
        LIMIT 1
      ) l
    ),
    'history', (
      SELECT COALESCE(json_agg(h), '[]'::json) FROM (
        SELECT id, status, triggered_by, file_name, file_size_bytes,
               storage_provider, error_message, started_at, finished_at,
               duration_ms, deleted_at, deleted_by
        FROM public.backup_logs
        ORDER BY started_at DESC
        LIMIT 30
      ) h
    ),
    'restore_history', (
      SELECT COALESCE(json_agg(r), '[]'::json) FROM (
        SELECT id, source_backup_log_id, status, scope, table_names,
               triggered_by_admin, error_message, started_at, finished_at,
               duration_ms
        FROM public.backup_restore_logs
        ORDER BY started_at DESC
        LIMIT 10
      ) r
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_backup_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_backup_status() TO authenticated;
