/**
 * Tipe data & util untuk changelog dialog "Pembaruan Tersedia"
 * (`UpdatePrompt.tsx`).
 *
 * PENTING -- data sesungguhnya ADA DI `public/changelog.json`, BUKAN di
 * `src/data/`. Ini sengaja: file di `src/` ikut di-bundle ke dalam kode JS
 * (di-import secara statis), sehingga isinya "beku" mengikuti versi build
 * yang sedang berjalan di browser user -- termasuk saat itu JUSTRU sedang
 * menampilkan dialog "ada versi baru", di mana browser MASIH menjalankan
 * kode versi LAMA (halaman belum reload). Akibatnya popup update akan
 * selalu menampilkan changelog versi SEBELUMNYA, bukan versi yang baru
 * saja di-deploy.
 *
 * `public/changelog.json` adalah file statis biasa yang di-fetch lewat
 * network saat dialog update akan ditampilkan (lihat `UpdatePrompt.tsx`),
 * jadi isinya selalu sesuai dengan apa yang benar-benar live di server
 * saat itu -- independen dari bundle JS mana yang sedang aktif di
 * halaman.
 *
 * Data ditulis/di-update secara PROGRAMATIK oleh script CI
 * (`scripts/generate-changelog.mjs`, dijalankan via
 * `.github/workflows/generate-changelog.yml`).
 *
 * CARA PAKAI MANUAL (kalau tidak lewat CI):
 * Tambahkan SATU entri baru di URUTAN PALING ATAS array di
 * `public/changelog.json` (paling baru = index 0). Isi `changes` dengan
 * bahasa yang mudah dipahami PENGGUNA AWAM -- bukan bahasa teknis/istilah
 * kode.
 *
 *   BENAR:  "Notifikasi tagihan sekarang bisa diatur per-kategori"
 *   SALAH:  "Refactor BillReminderContext untuk mendukung filter kategori"
 *
 * `UpdatePrompt.tsx` mem-fetch `/changelog.json` saat event
 * "pwa-update-available" terjadi, lalu mengambil entri PALING ATAS
 * (data[0]) dan menampilkannya sebagai daftar poin di dialog update,
 * sesuai bahasa aktif user (id/en). Kalau array kosong atau fetch gagal,
 * dialog tetap tampil normal dengan teks generik (tanpa daftar poin).
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

/** Path fetch runtime -- lihat penjelasan lengkap di komentar atas file ini. */
export const CHANGELOG_URL = "/changelog.json";
