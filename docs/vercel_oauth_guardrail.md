# Guardrail: Vercel Serverless API & Google OAuth Troubleshooting

> Dokumen ini berisi daftar penyebab umum + checklist debugging untuk masalah
> yang **sudah pernah terjadi** di project ini. Cek dokumen ini DULU sebelum
> menebak-nebak ulang dari nol.

---

## 1. Project ini punya 2 mode server — JANGAN tertukar

- **Lokal (`npm run dev` / `npm start`)** → pakai `server.ts` (Express, long-running).
- **Production di Vercel** → `server.ts` **TIDAK DIPAKAI SAMA SEKALI**.
  Vercel hanya menjalankan file di folder `/api/*.ts` sebagai Serverless
  Function terpisah (satu file = satu function, stateless, cold start).

Kalau nambah/ubah endpoint backend:
- Tambahkan juga (atau HANYA) di `/api/`, jangan cuma edit `server.ts` dan
  berasumsi itu otomatis berlaku di production.

---

## 2. Wajib cek SETIAP kali menambah file baru di `/api/`

### a. Module resolution (ESM) — penyebab #1 crash `FUNCTION_INVOCATION_FAILED`

`package.json` project ini punya `"type": "module"`. Konsekuensinya:

- **Semua relative import HARUS pakai ekstensi `.js`** di akhir, walaupun
  file sumbernya `.ts`. Contoh BENAR:
  ```ts
  import { parseAmountFromString } from '../../src/lib/parserUtils.js';
  ```
  Contoh SALAH (akan lolos saat development tapi **crash di runtime Vercel**
  dengan error `ERR_MODULE_NOT_FOUND`):
  ```ts
  import { parseAmountFromString } from '../../src/lib/parserUtils';
  ```
- Error spesifik yang akan muncul di Vercel Function Logs kalau ini salah:
  ```
  Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/var/task/src/lib/xxx'
  ```
  → **Begitu lihat error ini, langsung cek ekstensi `.js` di import, jangan
  cek hal lain dulu.**

### b. Depth path relatif harus dihitung manual per folder

- File di `api/foo.ts` → akses `src/` lewat `../src/...`
- File di `api/foo/bar.ts` → akses `src/` lewat `../../src/...`
- Selalu hitung ulang `../` sesuai kedalaman folder file itu sendiri, BUKAN
  copy-paste dari file lain di level berbeda.

### c. Environment variables

- `.env` lokal **tidak otomatis terbaca di Vercel**. Semua secret
  (`GEMINI_API_KEY`, dll) harus didaftarkan manual di:
  **Vercel Dashboard → Project → Settings → Environment Variables**
  (pastikan target environment-nya "Production", bukan cuma "Preview").

---

## 3. Routing SPA vs API — `vercel.json`

- Project pakai React Router (client-side routing), jadi route seperti
  `/auth/callback`, `/dashboard`, dll **tidak punya file fisik**.
- Tanpa rewrite rule, akses langsung (bukan klik dari dalam app, misal lewat
  redirect OAuth) ke route itu akan **404 NOT_FOUND**.
- Rule wajib di `vercel.json`:
  ```json
  {
    "rewrites": [
      { "source": "/((?!api/).*)", "destination": "/index.html" }
    ]
  }
  ```
- Pattern `(?!api/)` PENTING — supaya route `/api/*` tidak ikut di-rewrite
  ke `index.html` (kalau ikut, semua API call akan return HTML, bukan JSON,
  dan terlihat seperti "API tidak respon" padahal sebenarnya kena rewrite).

**Quick check kalau API tiba-tiba return HTML bukan JSON:**
→ Cek `vercel.json`, pastikan negative lookahead `api/` masih ada.

---

## 4. Cara baca error, urutan prioritas

Saat ada masalah baru yang "mirip" (500/404 di endpoint):

1. **Jangan tebak dari deskripsi gejala di frontend** ("bounce balik",
   "404", dll). Itu cuma simptom.
2. **Selalu minta/lihat log mentah dulu:**
   - Untuk API: Vercel Dashboard → Deployments → Functions → Logs
     (atau tab Logs realtime).
3. Cocokkan error message dengan checklist di atas SEBELUM membuat
   hipotesis baru.
4. Kalau error message-nya tidak ada di daftar ini, baru analisis dari nol
   — dan tambahkan temuannya ke dokumen ini.

---

## 5. WAJIB: Multi-bahasa (i18n) — tidak boleh ada teks hardcoded

Project ini support multi-bahasa (saat ini **Indonesia (`id`)** dan
**English (`en`)**, default `id`). **Setiap fitur baru maupun perubahan ke
fitur lama wajib mengikuti aturan ini — tanpa kecuali.**

### a. Sistem i18n yang dipakai — JANGAN tertukar

Project ini sebenarnya punya **DUA sistem i18n berbeda** yang pernah dipasang.
**JANGAN bingung di antara keduanya:**

| Sistem | File | Status | Pemakaian |
|---|---|---|---|
| **Custom `LanguageContext`** | `src/contexts/LanguageContext.tsx` + `src/locales/id.json` + `src/locales/en.json` | ✅ **CANONICAL / WAJIB DIPAKAI** | Dipakai di 7+ file (`Sidebar`, `Dashboard`, `Login`, `NewTransaction`, `Settings`, `History`, dll) |
| `react-i18next` | `src/i18n.ts` (resource inline, sangat minim) | ⚠️ Legacy/sisa, JANGAN dipakai lagi | Cuma 1 file: `ResetPasswordModal.tsx` (tertinggal, belum dimigrasi) |

**Aturan:** untuk SEMUA fitur baru, selalu pakai hook `useLanguage()` dari
`LanguageContext`, bukan `useTranslation()` dari `react-i18next`. Kalau
ketemu file lama yang masih pakai `useTranslation()`/`i18n.ts`, itu adalah
technical debt — migrasikan ke `useLanguage()` + tambahkan key yang
diperlukan ke `src/locales/id.json` & `en.json`, jangan tambah resource baru
ke `i18n.ts`.

### b. Larangan keras: hardcoded teks

- **TIDAK BOLEH** ada string teks yang terlihat oleh user (label, button,
  placeholder, pesan error/sukses, judul halaman, alt text, tooltip, dll)
  ditulis langsung di JSX/TSX. Contoh SALAH:
  ```tsx
  <button>Simpan Transaksi</button>
  <p>Transaksi berhasil ditambahkan</p>
  ```
- **WAJIB** lewat fungsi `t()` dari `useLanguage()`, dengan key terdaftar di
  KEDUA file locale (`id.json` DAN `en.json`, isinya harus benar-benar
  diterjemahkan, bukan cuma di-copy sama):
  ```tsx
  const { t } = useLanguage();
  // ...
  <button>{t('transaction.save')}</button>
  <p>{t('transaction.save_success')}</p>
  ```
- Untuk teks dengan variabel (jumlah, nama, dll), pakai parameter
  `replacements` yang sudah didukung `t()`:
  ```tsx
  t('transaction.added_amount', { amount: formattedAmount })
  // di locale: "added_amount": "Berhasil menambahkan {amount}"
  ```
- Termasuk teks dari: validasi form, pesan toast/notifikasi, label kategori
  transaksi baru, nama halaman/route title, isi email/notifikasi (kalau ada),
  dan teks di response AI/Gemini yang ditampilkan ke user (sediakan
  template per-bahasa, jangan biarkan model langsung generate kalimat UI
  dalam satu bahasa saja).

### c. Checklist sebelum menganggap fitur baru "selesai"

1. Tidak ada string UI yang hardcoded — grep manual sebelum commit:
   ```bash
   grep -rn ">[A-Za-z ]\{4,\}<" src/views src/components
   ```
   (cek manual hasilnya, bukan semua match itu pasti hardcode, tapi ini
   titik awal pencarian cepat)
2. Setiap key baru di `id.json` ada pasangannya di `en.json`, dan sebaliknya
   — jumlah key di kedua file harus selalu sinkron. Cek dengan:
   ```bash
   diff <(jq -r 'paths(scalars) as $p | $p | join(".")' src/locales/id.json | sort) \
        <(jq -r 'paths(scalars) as $p | $p | join(".")' src/locales/en.json | sort)
   ```
   Output kosong = aman. Ada output = ada key yang tidak sinkron.
3. Coba toggle bahasa di Settings (`id` ⇄ `en`) lalu cek ulang fitur baru
   itu secara visual — pastikan tidak ada teks yang "nyangkut" dalam satu
   bahasa saja saat bahasa lain dipilih.
4. Kalau fitur melibatkan data dari API/AI (misal hasil parsing Gemini di
   `/api/parse-transaction`), pastikan label/kategori yang ditampilkan ke
   user tetap lewat `t()` di sisi frontend — backend cukup balikin
   `category_key` (string identifier), JANGAN balikin teks final yang
   sudah dalam satu bahasa tertentu dari server.

---

## 8. Riwayat masalah yang sudah pernah terjadi (jangan diulang)

| Tanggal/Versi | Masalah | Root cause | Fix |
|---|---|---|---|
| Migrasi API ke `/api` | 500 `FUNCTION_INVOCATION_FAILED` di `/api/parser/test` | Salah hitung `../` depth | Perbaiki relative path |
| Migrasi API ke `/api` | `ERR_MODULE_NOT_FOUND` walau path sudah benar | Import tanpa ekstensi `.js` di project ESM | Tambah `.js` di semua relative import |
| Audit i18n | Ada teks yang tidak ikut berubah saat ganti bahasa | Project punya 2 sistem i18n paralel (`react-i18next` vs custom `LanguageContext`), 1 file (`ResetPasswordModal.tsx`) masih pakai sistem lama | Standarkan ke `useLanguage()` + `src/locales/*.json`, migrasikan file yang masih pakai `useTranslation()` |
| 21 Jun 2026 / Bot Webhook v2 | Error database "RPC function does not exist" pada advanced bot features | Kode webhook yang diperbaharui bergantung pada RPC fungsi baru (`confirm_and_insert_telegram_tx`, `get_telegram_user_summary_v2`, dll) yang belum ada di database | Membuat database migration baru `/supabase/migrations/20260621010000_telegram_v2_rpcs.sql` berisi seluruh skema SQL RPC function pendukung untuk bot v2 |
| 21 Jun 2026 / Instant Copy & Blue Badge | Telegram status tidak update real-time dan command /link manual diketik | Status hanya direfresh saat reload; link manual membuat user kerepotan | Menambahkan visual copy-to-clipboard button (`btn_copy_link`) untuk perintah `/link {code}` dan interval 3 detik polling database di menu Settings untuk sinkronisasi instan |
| 22 Jun 2026 / Layout & Full-Stack Compile | UI disjointed (header berada diluar card) pada Catat Mandiri, Riwayat, dan Pengaturan; grid Pengaturan rusak karena tag `div` grid ditutup kepagian | File Settings.tsx bermasalah secara visual dan tag HTML tidak seimbang. Serta backend (`api/parse-transaction.ts` & `api/telegram-webhook.ts`) error karena import utility salah, conflict deklarasi type Lang, dan key translation `linkLockedOut` tidak terdefinisi di `botText` | 1. Merefaktor Catat Mandiri, Riwayat, dan Pengaturan ke dalam sistem satu Single Massive Cohesive Card dengan visual divider.\n2. Memperbaiki tag div grid di Settings.tsx.\n3. Mengimpor `parseAmountFromString` di `api/parse-transaction.ts` dari `../src/lib/parserUtils`.\n4. Menghapus importredundant `type Lang` di telegram webhook.\n5. Menambahkan terjemahan `linkLockedOut` pada `botText`. |
| 22 Jun 2026 / Interactive Financial Recharts | Grafik lama berupa progress bar horizontal kategori terlalu sederhana untuk Fintech modern | Pengguna butuh pembacaan tren beruntun harian (Kumulatif vs Harian) dengan visual terkemuka seperti Area/Line charts | 1. Menginstal paket `recharts` ke dependencies.\n2. Merefaktor `Dashboard.tsx` dengan menghapus visual horizontal progress bars.\n3. Mengimplementasikan agregasi data transaksi real-time per tanggal di bulan aktif.\n4. Membangun opsi interaktif: Bagan Area (AreaChart) vs Bagan Garis (LineChart), serta Kumulatif vs Harian.\n5. Menambahkan custom tooltip responsif dengan lokalisasi bilingual otomatis serta gradien warna fintech modern. |
| 22 Jun 2026 / i18n Hardcoded Charts Audit | Adanya teks hardcoded pada visual baru Recharts yang melanggar standar i18n dwibahasa (ID & EN) | Teks opsi chart dan instruksi tooltip ditulis langsung sebagai string literal di Dashboard.tsx | 1. Mengekstrak seluruh label ("Kumulatif", "Harian", "Bagan Area", "Bagan Garis", deskripsi detail, serta instruksi kursor) ke dalam `id.json` dan `en.json` di bawah sub-node `dashboard`.\n2. Menggantikan seluruh referensi teks di `Dashboard.tsx` menggunakan fungsi translasi dinamis `t()` bawaan i18n. |
| 22 Jun 2026 / God Components Refactor | File Dashboard.tsx dan History.tsx terlalu besar (>15 ribu s.d 32 ribu karakter) membuat pemeliharaan rumit | Logika file terkonsolidasi menjadi satu (God Component) yang menyulitkan pembacaan dan pemeliharaan jangka panjang | 1. Memecah `Dashboard.tsx` menjadi 4 sub-komponen modular terpisah: `DashboardHeader.tsx`, `DashboardStats.tsx`, `DashboardChart.tsx`, dan `DashboardRecentTransactions.tsx`.\n2. Memecah `History.tsx` menjadi 5 sub-komponen modular terpisah: `HistoryFilter.tsx`, `HistoryTable.tsx`, `HistoryPagination.tsx`, `HistoryExport.tsx`, dan `HistoryDeleteModal.tsx`.\n3. Mengintegrasikan tombol aksi melayang modern (Floating Action Button) '+ Tambah Transaksi' pada Dasbor untuk penyempurnaan interatvitas.\n4. Mengimplementasikan data terakru nyata rincian 5 transaksi terakhir untuk penyempurnaan kegunaan (Fintech UX). |
| 22 Jun 2026 / FAB i18n Localization | Tombol melayang "+ Tambah Transaksi" masih menggunakan hardcoded teks bahasa Indonesia | Teks label pada Floating Action Button di `Dashboard.tsx` ditulis langsung sebagai string literal | 1. Mengekstrak string "Tambah Transaksi" ("Add Transaction") ke dalam `id.json` dan `en.json` menggunakan kunci `dashboard.quick_add_fab`.\n2. Mengganti string statis pada JSX tombol melayang di `Dashboard.tsx` dengan fungsi translasi dinamis `{t("dashboard.quick_add_fab")}`. |

