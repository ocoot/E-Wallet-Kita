import changelogData from "./changelog.json";

/**
 * Registry perubahan/rilis (changelog) untuk dialog "Pembaruan Tersedia"
 * (`UpdatePrompt.tsx`).
 *
 * Data sesungguhnya ada di `changelog.json` (bukan di file ini), supaya
 * bisa ditulis/di-update secara PROGRAMATIK oleh script CI
 * (`scripts/generate-changelog.mjs`, dijalankan via
 * `.github/workflows/generate-changelog.yml`) tanpa perlu parsing kode
 * TypeScript -- cukup baca/tulis JSON biasa.
 *
 * CARA PAKAI MANUAL (kalau tidak lewat CI):
 * Tambahkan SATU entri baru di URUTAN PALING ATAS array di `changelog.json`
 * (paling baru = index 0). Isi `changes` dengan bahasa yang mudah dipahami
 * PENGGUNA AWAM -- bukan bahasa teknis/istilah kode.
 *
 *   BENAR:  "Notifikasi tagihan sekarang bisa diatur per-kategori"
 *   SALAH:  "Refactor BillReminderContext untuk mendukung filter kategori"
 *
 * `UpdatePrompt.tsx` otomatis mengambil entri PALING ATAS (CHANGELOG[0])
 * dan menampilkannya sebagai daftar poin di dialog update, sesuai bahasa
 * aktif user (id/en). Kalau array kosong, dialog tetap tampil normal
 * dengan teks generik (tanpa daftar poin).
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

export const CHANGELOG: ChangelogEntry[] = changelogData as ChangelogEntry[];
