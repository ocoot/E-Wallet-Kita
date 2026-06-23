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
| 22 Jun 2026 / Missing .js ESM Vercel Bug | Error `ERR_MODULE_NOT_FOUND` pada impor relatif `parserUtils` & `categoryDefinitions` di Vercel Runtime | Di lingkungan ESM Node.js, Vercel mengharuskan impor relatif menyertakan ekstensi `.js` secara eksplisit, yang terlewat pada modul baru/yang direfaktor | 1. Memeriksa semua impor relatif di seluruh berkas `/api/`.\n2. Menambahkan ekstensi berkas `.js` untuk impor `parserUtils` dan `categoryDefinitions` pada berkas `api/telegram-webhook.ts` and `api/parse-transaction.ts`. |
| 22 Jun 2026 / Real-time Sync Hub | Data dari Telegram bot atau perangkat eksternal tidak otomatis muncul di UI React tanpa reload manual / pindah tab | Tidak ada sinkronisasi aktif (realtime listener) antara modifikasi Row di db postgres Supabase yang dilakukan Telegram Webhook dengan Frontend cache state | 1. Menambahkan impor client `supabase` di `src/App.tsx`.\n2. Mengimplementasikan `useEffect` di root layout (`MainLayout`) untuk berlangganan channel Supabase Realtime `postgres_changes` untuk tabel `transactions` yang difilter khusus berdasarkan `user_id` aktif.\n3. Mengotomatisasi penambahan `transactionsUpdatedTrigger` setiap kali ada operasi DB (*), yang secara otomatis memicu reload data di sub-komponen `Dashboard` dan `History` secara dinamis. |
| 22 Jun 2026 / Real-time Toast & Deduplication | Ketiadaan toast notifikasi real-time, dan timbulnya double-toast saat transaksi dibuat dari form web lokal akibat loopback | Tidak ada toast pemberitahuan saat transaksi baru masuk via Telegram bot, serta duplikasi toast jika trigger realtime INSERT merespons input buatan web client sendiri | 1. Menambahkan kunci bilingual `realtime_success_telegram` dan `realtime_success_general` di berkas `id.json` dan `en.json` di bawah objek `toast`.\n2. Menggunakan React `useRef` (`lastRealtimeId`) dan parameter pencatatan ID global `(window as any).lastSavedTransactionId` pada callback `postgres_changes` di `src/App.tsx`.\n3. Memfilter pemanggilan `showToast` secara dinamis agar hanya memunculkan pemberitahuan real-time dari bot Telegram atau perangkat eksternal lainnya, sekaligus melakukan deduplikasi loopback dari form lokal. |
| 22 Jun 2026 / Premium Lifetime Features | Kebutuhan infrastruktur pendukung modul premium (pembelian lifetime, struk PDF, hook status) | Belum ada migrasi DB, logic client sandbox/real, generator struk jsPDF, dan usePremium hook untuk fitur premium | 1. Mengunggah berkas migrasi Supabase `/supabase/migrations/20260623000000_premium_feature.sql` untuk kolom `is_premium` dan tabel `premium_transactions` lengkap dengan RLS policy.\n2. Membuat logic client-side premium komprehensif di `/src/lib/premium.ts` yang mendukung mode sandbox interaktif (simulasi pelunasan instan 8 detik) dan integrasi API KlikQRIS production.\n3. Membuat utilitas pembuat PDF struk pembelian premium menggunakan `jspdf` di `/src/lib/receipt.ts`.\n4. Menyediakan hook React modular `/src/hooks/usePremium.ts` untuk melacak status premium secara reaktif. |
| 22 Jun 2026 / Premium Flow Integration | Integrasi visual opsi peningkatan premium serta proteksi (gating) di halaman Riwayat & Pengaturan | Pengguna memerlukan tombol aktivasi premium interaktif, akses menu laporan penuh hanya untuk akun premium, serta penutupan uji coba bot Telegram | 1. Menambahkan status premium (`isPremium`) dan callback visual (`onPremiumRequired`) pada komponen ekspor riwayat `/src/components/HistoryExport.tsx`.\n2. Mengintegrasikan proteksi laporan PDF ekspor bulanan penuh lintas bulan di `/src/views/History.tsx` agar memicu modal pembelian premium untuk non-premium.\n3. Membuat Kartu Status & Aktivasi Premium Lifetime dinamis dengan ikon `ShieldCheck` di bagian atas panel kiri `/src/views/Settings.tsx`.\n4. Memproteksi tombol pembuatan kode integrasi Telegram bot di `Settings.tsx` agar memberikan notifikasi uji coba terlampaui serta memicu modal premium modal jika diklik oleh akun non-premium.\n5. Memasang komponen `<PremiumModal />` reaktif penyambung gateway KlikQRIS di kedua halaman (History & Settings) untuk aksesibilitas tinggi. |
| 22 Jun 2026 / Local Status Polling 304 Caching | Berkas status polling mengembalikan respons `304 Not Modified` sehingga dialog pembayaran tidak berubah jadi sukses setelah webhook selesai diproses | HTTP caching pada Vercel edge/browser menyebabkan browser melayani data lama dari cache lokal ketimbang memanggil database realtime | 1. Mengonfigurasi header respons no-cache (`Cache-Control`, `Pragma`, dan `Surrogate-Control` untuk mem-bypass CDN) di awal file `/api/premium/status.ts`.\n2. Menambahkan perisai visual anti-cache berupa parameter acak timestamp (*_t=${Date.now()}*) pada pemanggilan fetch `/api/premium/status` di `/src/lib/premium.ts`.\n3. Menyisipkan header *Cache-Control: no-cache* secara eksplisit pada instans request fetch dari client-side. |
| 22 Jun 2026 / Sandbox Hostname Logging | Perlunya memantau akurasi deteksi sandbox di lingkungan preview AI Studio yang dinamis | Penentuan mode sandbox otomatis bergantung pada hostname browser yang bervariasi | Menambahkan instruksi logging nama host (`console.log("HOSTNAME =", host)`) di dalam helper client-side `/src/lib/premium.ts` pada fungsi `isSandboxMode()`. |
| 22 Jun 2026 / Hardcoded Sandbox Bypass | Mempermudah developer/tester melakukan pengujian sandbox pembayaran langsung secara instan tanpa terpengaruh hostname | Variansi hostname di lingkungan preview kustom atau deploy Vercel lain memicu pembatasan alur KlikQRIS real secara tidak sengaja | Mengganti isi logika fungsi `isSandboxMode()` di `/src/lib/premium.ts` agar langsung mengembalikan nilai literal `true` secara kondisional sebagai konfigurasi bypass instan. |
| 22 Jun 2026 / Premium Sandbox Insert Logging | Mempermudah penelusuran status pembuatan transaksi simulator di browser console | Sulit memverifikasi apakah transaksi pending sandbox sukses terdaftar ke dalam tabel Supabase tanpa logs lokal | Mengubah pemanggilan `supabase.from("premium_transactions").insert()` di dalam `/src/lib/premium.ts` agar menangkap output `{ data, error }` dan mencetaknya langsung menggunakan `console.log` di dalam sandbox flow. |
| 22 Jun 2026 / Admin Panel & Control | Penambahan Panel Admin untuk mengelola hak peran (role), status premium, dan pemblokiran akun pengguna (ban/unban) | Diperlukannya antarmuka administrasi terpusat yang aman, serta migrasi kolom basis data (`role`, `is_banned`) tanpa memicu recursion RLS | 1. Membuat file migrasi SQL `/supabase/migrations/20260624000000_admin_features.sql` untuk menambahkan kolom `role` dan `is_banned` secara aman dengan fungsi pembantu `SECURITY DEFINER` guna menepis tak hingga rekursi dalam RLS.\n2. Mengintegrasikan tipe data baru `UserProfile` di `/src/types.ts`.\n3. Mengembangkan hook modular `/src/hooks/useAdmin.ts` untuk memeriksa status admin/owner saat ini secara asinkron.\n4. Merancang komponen antarmuka `/src/views/AdminPanel.tsx` yang kaya fitur; komparasi, pencarian, multi-filter status, dan dialog konfirmasi aksi.\n5. Menambahkan rute dinamis dan item navigasi Sidebar aman berikon perisai (`Shield`) yang hanya memapar menu Admin Panel apabila hak akses terkonfirmasi. |
| 22 Jun 2026 / Owner & Route Security Lockouts | Mencegah admin memodifikasi pemilik utama (Owner), menyegel halaman admin dari intrusi langsung via URL, serta mendepak pengguna yang diblokir | bypass langsung URL rute admin tanpa otorisasi internal serta kemungkinan perubahan tidak sah atas akun level Owner | 1. Menyematkan pengecekan ketat `targetUser.role === 'owner'` pada fungsi backend handler premium, ban, dan role di `/src/views/AdminPanel.tsx`, di mana aksi akan ditolak seketika menggunakan Toast Alert.\n2. Melumpuhkan properti tombol interaktif (`disabled`) di UI baris pengguna jika peran baris target bernilai `"owner"`.\n3. Membungkus rute `/admin` di `/src/App.tsx` menggunakan bendera kondisional reaktif `isAdmin ? <AdminPanel /> : <Navigate to="/dashboard" replace />` untuk menyegel pemanggilan langsung via URL.\n4. Menambahkan interseptor otentikasi di `/src/contexts/AuthContext.tsx` pasca-sinkronisasi guna memutus sesi (`signOut`) jika properti data pengguna mendeteksi bendera `is_banned` bernilai true disertai modal peringatan pop-up. |
| 22 Jun 2026 / Admin Role Query Debug Logging | Kebutuhan pelacakan status otorisasi admin/owner langsung dari panel debug browser | Kadang diagnosis hak akses admin di frontend sulit diidentifikasi tanpa memindai respons tabel status | Memasang kueri aman untuk menangkap `{ data, error }` serta mencetaknya melalui `console.log` dengan prefiks `"ADMIN ROLE DATA:"` dan `"ADMIN ROLE ERROR:"` pada pemanggilan kueri tabel `users` di dalam `/src/hooks/useAdmin.ts`. |
| 22 Jun 2026 / Admin Panel Backend Metrics & Pagination | Optimasi visual ringkasan data metrik terpusat dan perbaikan keandalan penelusuran jutaan baris data pengguna | Pagination frontend tidak akurat bila dikombinasikan dengan pencarian teks, serta perlunya dashboard statistik cepat di atas tabel admin | 1. Menambahkan state reaktif `metrics` berisi ringkasan agregat pengguna (Total, premium, admin, banned) dengan polling live dari database menggunakan fungsi `loadMetrics()`.\n2. Mengintegrasikan server-side pagination dengan parameter `PAGE_SIZE = 20` menggunakan kueri `.range()` bawaan database Supabase.\n3. Mengubah total user query di `fetchUsers()` agar mengandalkan parameter pencari `.or()` dan filter server serta memperbarui `setTotalUsers(count)`.\n4. Merancang 4 kartu data metrik modern dengan batas visual berwarna tematis dan mendesain bar kontrol navigasi halaman (Halaman saat ini / estimasi total halaman) di bawah tabel baris pengguna.\n5. Menyematkan interaksi trigger audio reaktif saat navigasi pagination ditekan. |
| 22 Jun 2026 / i18n Localization Audit | Audit menyeluruh untuk menghapus string teks hardcoded pada fitur admin baru (Metrics, Pagination, Suspended state, Role labels) | Munculnya teks campuran (Inggris/Indonesia) yang tidak reaktif terhadap perubahan bahasa sistem pada Admin Panel | 1. Mengekstraksi seluruh string statis dari `/src/views/AdminPanel.tsx` dan `/src/contexts/AuthContext.tsx` ke dalam `/src/locales/id.json` dan `/src/locales/en.json` di bawah objek baru `"admin"`. \n2. Mengimplementasikan fungsi translasi dinamis `t()` untuk notifikasi Toast, judul Modal, deskripsi kartu metrik, dan tabel baris pengguna.\n3. Menambahkan logika deteksi bahasa manual dari `localStorage` pada `AuthContext` untuk menampilkan peringatan pemblokiran (ban) akun yang sesuai bahasa pengguna sebelum komponen UI utama dimuat.\n4. Memastikan placeholder pencarian dan label filter dropdown sepenuhnya multibahasa. |
| 23 Jun 2026 / Translation Key Leakage Fix | Perbaikan kebocoran kunci translasi (translation keys) dan pembersihan string fallback hardcoded di seluruh aplikasi | Munculnya teks mentah seperti "premium.title" or "User" saat kunci translasi tidak ditemukan atau data reaktif opsional bernilai null | 1. Menambahkan kunci missing (`admin.premium_active`, `admin.status_active`, `admin.premium_lite`, dll.) ke dalam file lokalisasi JSON untuk memastikan validitas query `t()`. \n2. Menghapus pola fallback hardcoded `t("key") || "String"` di `/src/views/AdminPanel.tsx` untuk mencegah kembalinya teks statis Inggris. \n3. Mengganti string statis "User" dan "Pengguna" di `Dashboard`, `History`, `Sidebar`, dan `PremiumModal` dengan kunci terlokalisasi `t("admin.guest_user")`. \n4. Melokalisasi label status tema (DARK/LIGHT), status audio (MUTED/SOUND), dan status otentikasi (GUEST/VERIFIED) pada Sidebar. |
| 23 Jun 2026 / SQL Security Definer RPC & Metrics Aggregation | Mengamankan modifikasi hak pengguna oleh admin, mempercepat kueri metrik ringkasan, dan merekam log audit aksi admin | Modifikasi status pengguna (premium, peran, ban) secara langsung dari kueri client melanggar batas keamanan pilar RLS, ditambah dengan kueri metrik lambat karena fetch seluruh baris tabel pengguna | 1. Membuat file migrasi baru untuk skema tabel log audit `admin_audit_logs` dengan proteksi RLS ketat.\n2. Mendesain tiga fungsi PostgreSQL `SECURITY DEFINER` (`admin_set_premium`, `admin_set_ban`, `admin_set_role`) yang membatasi hak istimewa, memverifikasi status pemanggil, melarang manipulasi pada owner utama, dan otomatis menulis riwayat ke tabel audit log.\n3. Mengoptimasi penghitungan jumlah metrik via fungsi RPC agregat `get_admin_metrics()` untuk menghindari overhead server.\n4. Memperbarui `AdminPanel.tsx` untuk memanggil RPC-RPC baru ini secara langsung.\n5. Memperbaiki bug placeholder konfirmasi modal pada pengaturan premium dan melenyapkan string raw `console.log` di dalam hook `useAdmin.ts`.\n6. Menambahkan proteksi tombol pengubah peran (`disabled`) di UI baris pengguna agar dinonaktifkan secara otomatis bagi akun admin non-owner (`!isOwner`). |
| 23 Jun 2026 / Admin Multi-module Expansion & Telegram Broadcast | Penambahan tab menu premium monitor, manajemen kategori, broadcast Telegram, seleksi massal (bulk), ekspor CSV, dan detail modal | Diperlukannya antarmuka administrasi lengkap, pemantauan transaksi real-time, pengisian dinamis kategori transaksi, pengiriman broadcast notifikasi, bulk update, dan ekspor CSV pengguna | 1. Membuat migration SQL tambahan untuk fungsi revenue metrics, category management, dan telegram broadcast IDs.\n2. Mendesain Vercel Serverless Function `/api/admin/broadcast-telegram.ts` yang berdiri sendiri untuk menangani pengiriman pesan Telegram massal dengan otentikasi JWT admin di production.\n3. Memetakan rute `/api/admin/broadcast-telegram` dalam Express `server.ts` untuk mendelegasikannya secara dinamis ke fungsi serverless di atas agar testing lokal port 3000 berjalan lancar tanpa duplikasi kode.\n4. Membangun 3 views modular baru (`AdminPremiumMonitor.tsx`, `AdminCategoryManager.tsx`, `AdminBroadcast.tsx`) dan 1 komponen modal (`AdminUserDetailModal.tsx`).\n5. Mengintegrasikan navigasi tab interaktif modern, seleksi baris pengguna berbasis checkbox, fungsionalitas bulk update, dan tombol download CSV di `AdminPanel.tsx`.\n6. Memperbaharui `id.json` dan `en.json` dengan penambahan daftar lengkap kunci translasi `"admin"` yang spesifik agar audit i18n anti-hardcoded string terpenuhi sempurna. |
| 23 Jun 2026 / Guest User Upsert HTTP 400 Fix | Perbaikan kegagalan PostgreSQL NOT NULL constraint violation (HTTP 400) saat mengidentifikasi sesi Guest/Tamu anonim | Kolom `display_name` didefinisikan `NOT NULL` tanpa default, namun metadata akun Guest mengirimkan string kosong/undefined, memicu error berulang di PostgREST | 1. Mengekstrak logika pencarian nama reaktif ke dalam variabel `fallbackName` di dalam `/src/contexts/AuthContext.tsx`.\n2. Menetapkan rantai logika fallback aman: `full_name` -> substring email -> 'Guest' (apabila akunnya adalah tamu anonim) -> 'User' sebagai opsi terakhir.\n3. Menjamin parameter yang dikirim ke database Supabase selalu berupa string bertipe valid dan menghindari data dibuang selama proses `JSON.stringify` di client-side. |
| 23 Jun 2026 / Admin View Query Guards Integration | Perlindungan eksekusi filter `supabase.rpc` asinkron pada komponen anak Admin Panel sebelum otorisasi pengguna selesai dimuat | Otorisasi rute mengandalkan context global yang asinkron, memicu pemanggilan query Supabase prematur sesaat sebelum verifikasi role admin terisi sempurna | 1. Mengintegrasikan hook pelacak `useAdmin()` di tingkat komponen `AdminPremiumMonitor.tsx`, `AdminCategoryManager.tsx`, dan `AdminBroadcast.tsx`.\n2. Membungkus fungsi asinkron pengambil data menggunakan blok kondisional state `if (isAdmin)` pada filter hook `useEffect`.\n3. Mencegah kebocoran data sensitif dan error izin akses Supabase di balik layar dengan menangguhkan semua kueri ke basis data pasca-mount asinkron pertama sebelum parameter keamanan diverifikasi secara sah. |
| 23 Jun 2026 / Reusable Action Loading Overlay | Peningkatan kualitas visual proses modifikasi aksi sensitif (mutasi data) Admin Panel melalui popup loading transisi tinggi | Tidak ada penanda visual global saat proses asinkron mutasi sedang berlangsung, berisiko menginduksi klik ganda (double-click/race condition) | 1. Mendesain komponen `LoadingOverlay.tsx` dengan latar belakang blur kustom, transisi `AnimatePresence` + `motion`, dan pemutar ikon asinkron `Loader2`.\n2. Mengintegrasikan status `actionLoading` pada level halaman `/src/views/AdminPanel.tsx` dan memasang penutup asinkron pada aksi tunggal (ban, role, premium) serta aksi massal pembaharuan data (bulk update).\n3. Menyematkan interaksi pemuatan di `/src/views/AdminPremiumMonitor.tsx` selama pemuatan ulang (refresh metrics/transactions).\n4. Menerapkan transisi pemuatan di `/src/views/AdminCategoryManager.tsx` (tambah/perbarui kategori) serta di `/src/views/AdminBroadcast.tsx` (selama broadcast sedang disemai massal). |
| 23 Jun 2026 / Debug Parser Code Cleanup | Pembersihan rute diagnostik publik `/api/parser/test` dan penghapusan kode testing parser tidak berizin | Adanya sisa file pengujian instrumen debug parser yang terekspos secara publik tanpa batasan autentikasi | 1. Menghapus berkas serverless `/api/parser/test.ts` secara permanen.\n2. Lenyapkan konfigurasi rute Express pencocokan `app.get("/api/parser/test", ...)` pada file `/server.ts`.\n3. Memvalidasi ketiadaan dependensi sisa menggunakan compiler dan linter proyek agar aman saat dideploy ke environment Vercel production. |
| 23 Jun 2026 / API Health Privacy Leakage Fix | Perlindungan metadata variabel lingkungan dari rute publik `/api/health` di lingkungan pengembangan lokal | Rute `/api/health` lokal di `server.ts` membocorkan awalan sensor name dari variabel lingkungan aktif, memperlebar luasan vektor intrusi publik | 1. Membuang filter pemindaian kunci `Object.keys(process.env)` dari endpoint status kesehatan.\n2. Menghapus properti respons `envKeys` untuk mengeliminasi pemaparan nama kredensial.\n3. Menyatukan perilaku fungsional (`response payload`) antara controller Express lokal dan penanganan fungsi serverless (`/api/health.ts`) di Vercel agar sepadan kembali secara konsisten. |
| 23 Jun 2026 / Interactive Transaction Editing & Telegram Inline Categories | Kebutuhan mengedit detail transaksi (kategori & nominal) secara interaktif dari tabel riwayat web, serta mengubah kategori draf transaksi Telegram langsung melalui inline keyboard | Transaksi web yang salah kategori/nominal sebelumnya harus dihapus lalu ditulis ulang, serta draf transaksi via bot Telegram hanya mendukung pengubahan nominal dengan balasan teks pesan | 1. Membuat komponen modal baru `src/components/HistoryEditModal.tsx` dengan transisi andal `motion` serta opsi select kategori yang cerdas.\n2. Menambahkan metode pembaruan basis data `updateTransaction` di `src/lib/db.ts`.\n3. Memodifikasi `HistoryTable.tsx` dan `History.tsx` untuk mengintegrasikan tombol edit `Pencil` serta peluncur modal edit yang reaktif.\n4. Menambahkan kunci translasi bilingual baru di bawah objek `"common"` dan `"toast"` untuk id/en locales.\n5. Mendesain helper pembuat keyboard dinamis `buildDraftKeyboard` dan `buildCategoryKeyboard` di `/api/telegram-webhook.ts`.\n6. Mengintegrasikan callback handler query Telegram `tx_edit_category`, `tx_edit_category_cancel`, dan `tx_set_cat:*` untuk memproses perubahan kategori draf bot secara instan tanpa tumpang tindih. |
| 23 Jun 2026 / Telegram Bot Webhook Atomic & Deduplication | Kerentanan balasan berulang bot (Telegram Webhook Retries Loop), timeout Gemini, dan data ganda | Pemanggilan Gemini tanpa timeout, ketiadaan penapisan `update_id`, serta seleksi-hapus non-atomic pada `confirm_and_insert_telegram_tx` memicu penyimpanan ganda transaksi draf Telegram | 1. Menambahkan pembungkus `Promise.race` dengan batasan waktu (strict timeout 6 detik) pada pemanggilan Gemini API di `/api/telegram-webhook.ts` dan `/server.ts` agar langsung jatuh ke mode regex-fallback berkemampuan tinggi.\n2. Memasang cache pelacak `processedTelegramUpdates` berbasis in-memory Map dengan TTL 20 menit untuk memblokir duplikasi retry Telegram otomatis dengan sigap.\n3. Mendesain ulang instrumen PostgreSQL RPC `confirm_and_insert_telegram_tx` mengandalkan taktik atomic `DELETE ... RETURNING ... INTO` guna menepis race condition secara mutlak. |
| 26 Jun 2026 / Sync Telegram Confirmation with Production | Konsistensi status 'already_confirmed' pada kueri atomic double-tap tombol konfirmasi Telegram bot | Konflik antara status 'expired' di berkas migrasi lokal dengan status 'already_confirmed' yang sesungguhnya berjalan lancar di backend produksi | 1. Membuat file migrasi baru `/supabase/migrations/20260626000000_sync_telegram_confirm_atomic.sql` untuk menyinkronkan status keluaran RPC `confirm_and_insert_telegram_tx`.\n2. Mengganti string balik status `'expired'` menjadi lambat-tap / klaim ganda terdeteksi `'already_confirmed'` sesuai blueprint yang telah aktif di live environment production.\n3. Memvalidasi kembali validitas build dan ketiadaan regresi kode dengan menjalankan linter/compiler lokal. |






