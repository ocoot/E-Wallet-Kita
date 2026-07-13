/**
 * Tipe data & util untuk changelog dialog "Pembaruan Tersedia"
 * (`UpdatePrompt.tsx`).
 *
 * PENTING -- data sesungguhnya ADA DI tabel Supabase `changelog_entries`
 * (lihat migration `20260815000000_changelog_entries.sql`), BUKAN di
 * `src/data/` atau file statis di `public/`.
 *
 * Riwayat: sebelumnya data ini disimpan di `public/changelog.json` dan
 * di-fetch lewat network (bukan di-import statis) supaya isinya selalu
 * "segar" mengikuti versi yang benar-benar live di server, independen dari
 * bundle JS lama yang mungkin masih berjalan di browser user saat dialog
 * update tampil. File itu dipindah ke Supabase pada 2026-08-15 karena
 * setiap kali source di-sync dari Google AI Studio ke GitHub, file yang
 * di-commit otomatis oleh bot CI (`scripts/generate-changelog.mjs`) itu
 * selalu tertimpa balik ke versi lama oleh AI Studio's sync (AI Studio
 * tidak mengenali file yang lahir dari commit pihak lain, dan tidak ada
 * mekanisme ignore resmi untuk sync tersebut).
 *
 * Sifat "selalu segar, independen dari bundle JS lama" itu TETAP terjaga
 * dengan Supabase: `UpdatePrompt.tsx` melakukan query langsung ke Supabase
 * (`supabase.from('changelog_entries')...`) saat dialog akan ditampilkan,
 * bukan membaca dari data yang di-bundle ke kode JS.
 *
 * Data ditulis secara PROGRAMATIK oleh script CI
 * (`scripts/generate-changelog.mjs`, dijalankan via
 * `.github/workflows/generate-changelog.yml`) memakai service_role
 * (bypass RLS -- lihat migration untuk detail policy).
 *
 * CARA PAKAI MANUAL (kalau tidak lewat CI):
 * INSERT satu baris baru ke tabel `changelog_entries` lewat Supabase
 * Dashboard SQL editor. Isi `changes` dengan bahasa yang mudah dipahami
 * PENGGUNA AWAM -- bukan bahasa teknis/istilah kode.
 *
 *   BENAR:  "Notifikasi tagihan sekarang bisa diatur per-kategori"
 *   SALAH:  "Refactor BillReminderContext untuk mendukung filter kategori"
 */

export interface ChangelogEntry {
  /** Versi bebas (mis. "1.4.0") -- hanya penanda internal/dokumentasi */
  version: string;
  /** Tanggal rilis, format bebas untuk dibaca manusia, mis. "12 Jul 2026" */
  date: string;
  /** Poin-poin perubahan, dalam bahasa Indonesia dan Inggris. Maksimal 4-5 poin. */
  changes: {
    id: string;
    en: string;
  }[];
}

/** Nama tabel Supabase tempat entri changelog disimpan. */
export const CHANGELOG_TABLE = "changelog_entries";
