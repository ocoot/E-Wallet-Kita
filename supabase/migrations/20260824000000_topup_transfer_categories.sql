-- Migration: Seed categories for Dashboard Top Up & Transfer Saldo
-- Date: 2026-07-18
--
-- Dashboard.tsx sekarang punya 2 aksi baru di kartu Pos Dompet (lihat
-- DashboardWalletSelectorCard.tsx + WalletTopUpModal.tsx + WalletTransferModal.tsx):
--   1. Top Up Saldo -> dicatat sbg transaksi income kategori 'topup'
--   2. Transfer Saldo antar pos -> dicatat sbg sepasang transaksi
--      expense 'transfer_out' (pos asal) + income 'transfer_in' (pos tujuan)
--
-- Kolom transactions.category TIDAK punya FK ke categories.key (lihat
-- init.sql), jadi transaksi tetap bisa disimpan tanpa baris ini. Migration
-- ini murni supaya key tsb tampil dengan label rapi (bukan raw key
-- "topup"/"transfer_out"/dst) di Riwayat Transaksi & Dashboard, konsisten
-- dengan kategori lain yang sudah ada.

INSERT INTO public.categories (key, type, label_id, label_en, description_id, description_en, priority, is_active)
VALUES
  ('topup', 'income', 'Top Up Saldo', 'Balance Top Up',
    'Penambahan saldo manual ke salah satu Pos Dompet.',
    'Manual balance addition to one of your wallets.',
    90, true),
  ('transfer_out', 'expense', 'Transfer Keluar', 'Transfer Out',
    'Saldo yang dipindahkan ke Pos Dompet lain.',
    'Balance moved out to another wallet.',
    90, true),
  ('transfer_in', 'income', 'Transfer Masuk', 'Transfer In',
    'Saldo yang diterima dari Pos Dompet lain.',
    'Balance received from another wallet.',
    90, true)
ON CONFLICT (key) DO UPDATE SET
  label_id = EXCLUDED.label_id,
  label_en = EXCLUDED.label_en,
  description_id = EXCLUDED.description_id,
  description_en = EXCLUDED.description_en;
