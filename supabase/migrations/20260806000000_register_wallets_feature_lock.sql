-- Migration: Daftarkan fitur 'wallets' ke maintenance_feature_locks
-- Date: 2026-08-06
-- Description:
--   Audit menemukan bahwa halaman Wallets (/wallets) sudah dibungkus
--   <FeatureLockGate featureKey="wallets"> di App.tsx dan sudah punya
--   indikator gembok di Sidebar.tsx (featureKey: "wallets"), tapi
--   feature_key "wallets" TIDAK PERNAH didaftarkan ke tabel
--   maintenance_feature_locks di migration manapun (termasuk saat
--   fitur wallets sendiri dibuat di 20260803040000_wallets_pos_system.sql).
--
--   Akibatnya: RPC get_maintenance_status() tidak pernah mengembalikan
--   baris untuk "wallets", sehingga:
--     1. Admin Panel > Maintenance > Kunci Fitur tidak menampilkan
--        toggle untuk mengunci Wallets sama sekali.
--     2. isFeatureLocked("wallets") di frontend selalu bernilai FALSE,
--        jadi fitur ini tidak bisa dikunci walau UI-nya sudah siap.
--
--   Migration ini menambah baris yang hilang tersebut, mengikuti pola
--   yang sama dengan migration fitur-fitur lain (budget, bill_reminders,
--   installments, savings, gold_savings).

INSERT INTO public.maintenance_feature_locks (feature_key, is_locked) VALUES
  ('wallets', FALSE)
ON CONFLICT (feature_key) DO NOTHING;
