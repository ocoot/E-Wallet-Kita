-- Migration: Seed 5 kategori yang hilang dari init migration
-- Tanggal: 2026-07-03
--
-- Latar belakang:
-- Init migration (20260620000000_init.sql) hanya menyeed 7 kategori.
-- Lima kategori di bawah tidak di-INSERT saat init, hanya di-UPDATE label-nya
-- di migration 20260625000004, sehingga pada fresh install ke-5 kategori ini
-- tidak pernah terbuat di DB.
--
-- Fix: INSERT dengan ON CONFLICT DO NOTHING sehingga aman dijalankan
-- berulang kali maupun pada DB yang sudah ada datanya.

INSERT INTO public.categories (key, type, label_id, label_en, is_active)
VALUES
  ('transport',     'expense', 'Transportasi',  'Transportation', true),
  ('health',        'expense', 'Kesehatan',      'Health',         true),
  ('shopping',      'expense', 'Belanja Online', 'Online Shopping',true),
  ('entertainment', 'expense', 'Hiburan',        'Entertainment',  true),
  ('education',     'expense', 'Pendidikan',     'Education',      true)
ON CONFLICT (key) DO NOTHING;
