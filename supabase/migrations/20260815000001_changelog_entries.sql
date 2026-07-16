-- Migration: Pindahkan sumber data changelog dari public/changelog.json (file
-- statis yang di-commit git oleh bot) ke tabel Supabase.
-- Date: 2026-08-15
--
-- Kenapa: public/changelog.json ditulis & di-commit otomatis oleh
-- `generate-changelog.yml` (git-actions bot) di setiap push ke main. Karena
-- file ini lahir di GitHub (bukan di workspace lokal Google AI Studio), tiap
-- kali source di-sync dari AI Studio ke GitHub, AI Studio melihat file ini
-- sebagai "diff" yang tidak ia kenali dan ikut menimpanya balik ke versi
-- lama/kosong -- menghapus hasil kerja bot. AI Studio's GitHub sync tidak
-- git-aware terhadap file yang lahir dari commit pihak lain, dan tidak
-- ditemukan mekanisme ignore-file resmi untuk sync tersebut.
--
-- Fix: keluarkan file ini sepenuhnya dari git. Bot CI menulis entri baru
-- langsung ke tabel ini (service_role, bypass RLS), dan frontend membaca
-- lewat client anon/authenticated biasa -- tidak ada lagi artefak file yang
-- bisa "direbut kembali" oleh sync AI Studio.

CREATE TABLE IF NOT EXISTS public.changelog_entries (
  id BIGSERIAL PRIMARY KEY,
  version TEXT NOT NULL,
  release_date TEXT NOT NULL,   -- format bebas dibaca manusia, mis. "12 Jul 2026" (dipertahankan sama seperti field `date` lama supaya UpdatePrompt tidak perlu format ulang)
  changes JSONB NOT NULL,       -- [{ "id": "...", "en": "..." }, ...] -- struktur sama persis dengan public/changelog.json lama
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_changelog_entries_created_at
  ON public.changelog_entries (created_at DESC);

-- RLS: baca boleh untuk siapapun yang sudah login (sama seperti pola
-- app_settings_select di 20260701000100_app_settings_rls.sql) -- data
-- changelog bukan data sensitif, cukup dibatasi dari akses anon murni yang
-- belum autentikasi. TIDAK ada policy insert/update/delete untuk
-- anon/authenticated -- satu-satunya jalur tulis adalah service_role
-- (dipakai oleh scripts/generate-changelog.mjs di CI), sama seperti pola
-- error_logs di 20260804000000_error_logs_monitoring.sql.
ALTER TABLE public.changelog_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "changelog_entries_select" ON public.changelog_entries;
CREATE POLICY "changelog_entries_select"
ON public.changelog_entries
FOR SELECT
TO authenticated
USING (true);
