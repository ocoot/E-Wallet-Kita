# Product Requirements Document (PRD)
## E-Wallet Kita — Aplikasi Pencatatan Keuangan Pribadi/Rumah Tangga

**Versi:** 1.0
**Tanggal:** 20 Juni 2026
**Status:** Draft untuk Development

---

## 1. Latar Belakang & Tujuan

### 1.1 Latar Belakang
Ibu rumah tangga membutuhkan alat pencatatan keuangan yang sederhana, cepat diakses, dan tidak merepotkan secara teknis. Pencatatan manual sering terlewat karena harus membuka aplikasi, memilih kategori, dan mengisi form. **E-Wallet Kita** menjawab ini dengan kombinasi AI parsing teks otomatis + integrasi Telegram bot, sehingga pencatatan bisa dilakukan secepat mengirim chat.

### 1.2 Tujuan Produk
- Mempermudah pencatatan transaksi pemasukan/pengeluaran rumah tangga.
- Meminimalkan friksi input dengan AI yang memahami bahasa natural (termasuk singkatan Indonesia: "25rb", "1.5jt", "1k").
- Mendukung multi-user dengan isolasi data penuh (tidak ada kebocoran data antar pengguna).
- Tersedia di web maupun Telegram, agar dapat dicatat kapan saja tanpa membuka aplikasi.

### 1.3 Target Pengguna
- Ibu rumah tangga / pengelola keuangan keluarga.
- Pengguna casual yang ingin coba tanpa daftar (Guest Mode).
- Pengguna yang lebih nyaman chat di Telegram dibanding membuka web app.

---

## 2. Lingkup Produk (Scope)

### 2.1 In-Scope
- Autentikasi: Google OAuth, Guest Mode, Email/Password (via Supabase Auth).
- Pencatatan transaksi manual (form) dan via AI text parsing (Gemini).
- Integrasi Telegram Bot (webhook) untuk pencatatan via chat, dengan linking akun.
- Dashboard ringkasan keuangan.
- Riwayat transaksi dengan filter bulan & pagination.
- Hapus transaksi (per item & hapus semua).
- Multi-bahasa (ID/EN) dan multi-tema (Dark Obsidian / Light Sakura), berganti tanpa reload.
- Responsive mobile-first.
- Storage Supabase untuk aset (misal avatar/lampiran struk — opsional fase 2).

### 2.2 Out of Scope (Fase 1)
- Multi-currency.
- Budgeting/anggaran otomatis & notifikasi limit.
- Laporan ekspor PDF/Excel.
- Multi-akun keluarga (shared wallet antar user) — dicatat sebagai catatan future work.

---

## 3. Persona Pengguna

| Persona | Deskripsi | Kebutuhan Utama |
|---|---|---|
| Bu Siti (Primary) | Ibu rumah tangga, 35–55 thn, tidak terlalu mahir teknologi | Input cepat, tampilan jelas, bahasa Indonesia |
| Pengguna Coba-coba | Ingin coba tanpa daftar | Guest Mode tanpa kehilangan fitur inti |
| Pengguna Mobile-first | Selalu pakai HP | Telegram bot, UI responsif |

---

## 4. Arsitektur & Tech Stack

| Komponen | Teknologi |
|---|---|
| Frontend | Next.js (React) — direkomendasikan App Router, deploy di Vercel |
| Auth | Supabase Auth (Google OAuth, Email/Password, Anonymous/Guest) |
| Database | Supabase Postgres |
| Storage | Supabase Storage |
| Hosting/Deploy | Vercel |
| AI Engine | Google Gemini API (text parsing & financial assistant) |
| Bot Messaging | Telegram Bot API via Webhook (bukan polling) — bot: `@AppFinMgr_bot` |
| i18n | next-intl / i18next (wajib: tidak ada hardcoded string) |
| State theme/lang | Context/Provider tanpa reload halaman (client-side switch) |

### 4.1 Diagram Alur Tinggi (High-Level)
```
[User Web] ──┐
             ├─> [Next.js App / Vercel] ──> [Supabase Auth/DB/Storage]
[Telegram] ──┘            │
                           └─> [Gemini API] (parsing teks transaksi)

Telegram Webhook ──> [API Route Next.js: /api/telegram/webhook] ──> [Supabase]
```

---

## 5. Data Model (Supabase)

### 5.1 Tabel `users` (extend dari `auth.users`)
| Kolom | Tipe | Keterangan |
|---|---|---|
| id | uuid (PK, = auth.users.id) | |
| display_name | text | |
| is_guest | boolean | default false |
| telegram_chat_id | bigint, nullable, unique | terisi setelah linking |
| preferred_language | text | 'id' / 'en' |
| preferred_theme | text | 'dark_obsidian' / 'light_sakura' |
| created_at | timestamptz | |

### 5.2 Tabel `transactions`
| Kolom | Tipe | Keterangan |
|---|---|---|
| id | uuid (PK) | |
| user_id | uuid (FK -> users.id) | **WAJIB** RLS by user_id |
| type | text | 'income' / 'expense' |
| category | text (key i18n, bukan label) | e.g. `category.food_drink` |
| amount | numeric | disimpan dalam satuan Rupiah (integer/numeric) |
| note | text, nullable | catatan asli/teks asal AI |
| source | text | 'manual' / 'ai_web' / 'telegram' |
| transaction_date | date | |
| created_at | timestamptz | |

### 5.3 Tabel `categories` (master, bukan hardcode di kode)
| Kolom | Tipe | Keterangan |
|---|---|---|
| id | uuid | |
| key | text | unique, dipakai untuk lookup i18n, e.g. `salary`, `bonus`, `food_drink`, `monthly_groceries`, `vegetables`, `bills`, `other` |
| type | text | 'income' / 'expense' |

### 5.4 Tabel `telegram_link_codes`
| Kolom | Tipe | Keterangan |
|---|---|---|
| code | text (PK) | kode 5 digit, contoh `12345` |
| user_id | uuid | |
| expires_at | timestamptz | misal 10 menit |
| used | boolean | |

### 5.5 RLS (Row Level Security) — KRITIKAL
- Semua tabel `transactions`, `telegram_link_codes` **wajib** RLS: `user_id = auth.uid()`.
- Guest mode tetap punya `auth.uid()` (anonymous sign-in Supabase), sehingga data guest pun terisolasi dan policy sama berlaku.
- Policy terpisah untuk SELECT/INSERT/UPDATE/DELETE, semua dibatasi `user_id = auth.uid()`.

---

## 6. Fitur Detail

### 6.1 Halaman Login (Sebelum Login)
- Pilihan login: **Google**, **Guest Mode**, **Email & Password** (sign in / sign up).
- Guest Mode → Supabase Anonymous Auth, data tetap tersimpan per sesi/akun anonim (disclaimer: data guest bisa hilang jika clear browser/ganti device, tampilkan notice).
- Validasi form email/password (format email, minimum panjang password).
- Lupa password → reset via email (Supabase).

### 6.2 Layout Setelah Login
- **Sidebar** collapsible (toggle buka/tutup), berisi menu:
  1. Dashboard
  2. Pencatatan Manual
  3. Riwayat Transaksi
  4. Setting
- Sidebar otomatis collapse di mobile (hamburger menu), expand di desktop.

### 6.3 Dashboard
- Ringkasan total pemasukan, pengeluaran, saldo bulan ini.
- Grafik sederhana (opsional: bar/line per kategori atau per hari).
- Quick-input box: ketik teks bebas → AI parsing → konfirmasi → simpan (lihat 6.5).

### 6.4 Pencatatan Manual
- Form: Tipe (income/expense), Kategori (dropdown dari tabel `categories`, label di-translate via i18n key), Jumlah, Tanggal, Catatan.
- Validasi input jumlah (angka positif).
- Submit → **modal konfirmasi** → loading spinner → toast sukses/gagal.

### 6.5 AI Financial Assistant (Gemini) — Transaction Parsing
- Input bebas teks, contoh:
  - `"Makan siang 25000"` → category: `food_drink`, amount: 25000, type: expense.
  - `"Gaji 1.5jt"` → category: `salary`, amount: 1500000, type: income.
  - `"Belanja sayur 25rb"` → category: `vegetables`, amount: 25000.
  - `"Bonus 1k"` → category: `bonus`, amount: 1000, type: income. *(catatan: "1k" = 1.000, bukan 1.000.000 — harus konsisten sesuai notasi yang ditentukan: k = ribu, rb = ribu, jt = juta)*
- Output AI harus berupa JSON terstruktur: `{ type, category_key, amount, original_text }`.
- Setelah parsing, **selalu tampilkan konfirmasi** ke user (bisa edit sebelum simpan) — AI tidak boleh auto-save tanpa konfirmasi user.
- Mapping angka & singkatan:

| Notasi | Nilai |
|---|---|
| `rb` / `ribu` | × 1.000 |
| `k` | × 1.000 |
| `jt` / `juta` | × 1.000.000 |
| `.` sebagai desimal pengganda (misal `1.5jt`) | 1.5 × 1.000.000 = 1.500.000 |

- Kategori fallback `other` jika AI tidak yakin/tidak cocok kategori manapun.

### 6.6 Telegram Bot Integration
- Bot: `@AppFinMgr_bot`, menggunakan **Webhook** (eksplisit: dilarang polling).
- Endpoint webhook: `/api/telegram/webhook` (Next.js API Route di Vercel).
- **Linking akun:**
  1. User login web → buka Setting → generate kode link (5 digit, expired 10 menit), contoh `12345`.
  2. User kirim `/link 12345` ke bot Telegram.
  3. Bot verifikasi kode di tabel `telegram_link_codes` → jika valid & belum expired, set `telegram_chat_id` pada `users` sesuai `user_id` pemilik kode, tandai `used = true`.
  4. Bot balas konfirmasi sukses/gagal (kode invalid/expired).
- Setelah linked, user dapat kirim teks transaksi langsung ke bot (sama seperti AI parsing di web) → bot parsing via Gemini → balas ringkasan & minta konfirmasi (misal reply `/ya` atau tombol inline "Konfirmasi"/"Batal") → simpan ke `transactions` dengan `source = 'telegram'`.
- Command tambahan disarankan: `/unlink`, `/help`, `/saldo` (ringkasan cepat).

### 6.7 Riwayat Transaksi
- Filter berdasarkan **bulan** (dropdown bulan/tahun).
- Pagination: pilihan **5 / 10 / 15 / 20 / 50 / All** per halaman.
- Tombol **Delete** per item transaksi → modal konfirmasi → loading → toast sukses/gagal.
- Tombol **Hapus Semua** → modal konfirmasi (dengan penekanan peringatan, misal harus ketik "HAPUS" atau checkbox konfirmasi tambahan) → loading → toast sukses/gagal.

### 6.8 Setting
- Ganti bahasa (ID/EN) — **instan tanpa reload**.
- Ganti tema (Dark Obsidian / Light Sakura) — **instan tanpa reload**.
- Kelola koneksi Telegram (generate kode link / unlink).
- Edit profil (nama tampilan).
- Logout.
- (Guest mode) opsi upgrade ke akun permanen (link ke Google/Email).

---

## 7. Desain UI/UX

### 7.1 Tema
| Tema | Karakter Visual |
|---|---|
| Dark Obsidian | Latar gelap pekat (hitam keabu-abuan/obsidian), aksen warna kontras (misal ungu/teal), cocok malam hari |
| Light Sakura | Latar terang, aksen pink/sakura lembut, hangat & ramah |

- Switch tema disimpan di `preferred_theme` (DB) + local state (Context), terapkan via CSS variables/class — **tidak reload halaman**.

### 7.2 Internasionalisasi (i18n)
- **Wajib**: semua teks UI, label kategori, pesan error/sukses, nama bulan, dll harus melalui translation key — **dilarang hardcode string** di komponen.
- Struktur file terjemahan terpisah per bahasa: `locales/id.json`, `locales/en.json`.
- Kategori transaksi disimpan sebagai `key` (bukan label langsung) di DB, label ditentukan saat render via i18n lookup.
- Switch bahasa instan tanpa reload (client-side context + persist ke DB/local storage).

### 7.3 Responsivitas
- Mobile-first: breakpoint minimal mobile (<640px), tablet (640–1024px), desktop (>1024px).
- Sidebar: overlay/drawer di mobile, fixed/collapsible di desktop.
- Komponen form & tabel riwayat harus tetap usable di layar kecil (tabel → card view di mobile jika perlu).

### 7.4 Pola Konfirmasi & Loading (Berlaku Global)
Setiap aksi yang mengubah data (create/update/delete, link/unlink telegram, ganti tema/bahasa jika dianggap "aksi" — minimal untuk aksi destruktif & simpan data) **wajib**:
1. Tampilkan **modal konfirmasi** sebelum eksekusi.
2. Setelah dikonfirmasi → tampilkan **loading indicator** (spinner/skeleton).
3. Setelah selesai → tampilkan **toast/notifikasi sukses** atau **toast/notifikasi gagal** (dengan pesan error yang jelas, ter-i18n).

---

## 8. Alur Pengguna Utama (User Flow)

### 8.1 Flow Pencatatan via AI (Web)
1. User ketik di quick-input: "Belanja bulanan 250rb".
2. Klik "Proses dengan AI" → loading.
3. AI (Gemini) mengembalikan: `{ type: expense, category: monthly_groceries, amount: 250000 }`.
4. Tampilkan card konfirmasi (bisa edit kategori/jumlah jika salah).
5. User klik "Simpan" → modal konfirmasi → loading → toast sukses → data muncul di riwayat & dashboard.

### 8.2 Flow Telegram Linking
1. Web → Setting → "Hubungkan Telegram" → tampil kode `12345` + instruksi kirim `/link 12345` ke `@AppFinMgr_bot`.
2. User buka Telegram, kirim `/link 12345`.
3. Bot proses via webhook → validasi → balas "Akun berhasil terhubung".
4. Web (polling status singkat atau realtime Supabase subscription) update status "Terhubung".

### 8.3 Flow Pencatatan via Telegram
1. User (sudah linked) kirim: "Tagihan listrik 350rb".
2. Bot parsing via Gemini → balas ringkasan: "Pengeluaran - Tagihan - Rp350.000. Konfirmasi?" dengan inline button Ya/Batal.
3. User tekan "Ya" → bot simpan ke Supabase → balas "Tersimpan".

### 8.4 Flow Hapus Semua Transaksi
1. User di Riwayat Transaksi klik "Hapus Semua".
2. Modal konfirmasi destruktif (warning tegas, mungkin perlu konfirmasi ganda).
3. Loading → eksekusi delete by `user_id`.
4. Toast sukses ("Semua transaksi berhasil dihapus") atau gagal.

---

## 9. Keamanan & Privasi

- **Isolasi data**: RLS Supabase wajib aktif di semua tabel sensitif; setiap query difilter `user_id = auth.uid()`.
- Guest mode tetap menggunakan Supabase Anonymous Auth (punya `auth.uid()`), bukan session tanpa identitas, agar RLS tetap berlaku.
- Webhook Telegram harus verifikasi secret token (Telegram `secret_token` di header) untuk mencegah spoofing request ke endpoint webhook.
- Kode linking Telegram: harus expired (≤10 menit) & single-use (`used = true` setelah dipakai).
- Gemini API key & Telegram Bot token disimpan sebagai environment variable di Vercel (tidak pernah di expose ke client).
- Validasi input di server-side (API routes) untuk semua data yang masuk ke DB (jangan percaya input client/AI mentah-mentah).

---

## 10. Non-Functional Requirements

| Aspek | Requirement |
|---|---|
| Performa | Dashboard & riwayat load < 2 detik pada koneksi normal |
| Skalabilitas | Desain multi-tenant via RLS, siap untuk banyak user tanpa migrasi besar |
| Aksesibilitas | Kontras warna cukup di kedua tema, label form jelas, ukuran tap target mobile-friendly |
| Reliabilitas Bot | Webhook harus idempotent (hindari duplikat transaksi bila Telegram retry) |
| Observability | Logging error di API routes (Telegram webhook, Gemini call) untuk debugging |

---

## 11. Metrik Sukses (KPI)

- % transaksi yang dicatat via AI/Telegram vs manual.
- Rata-rata waktu pencatatan transaksi (target < 15 detik).
- Tingkat error parsing AI (target < 5% perlu koreksi manual oleh user).
- Retention pengguna guest → upgrade ke akun permanen.

---

## 12. Rencana Fase (Roadmap Singkat)

| Fase | Fitur |
|---|---|
| Fase 1 (MVP) | Auth, manual input, AI parsing dasar, dashboard, riwayat + filter/pagination, delete, i18n, tema, responsive |
| Fase 2 | Telegram bot full integration + linking |
| Fase 3 | Storage (upload struk), grafik lanjutan, budgeting/limit notifikasi |

---

## 13. Lampiran: Daftar Kategori Default

| Key | Tipe | Label ID | Label EN |
|---|---|---|---|
| salary | income | Gaji | Salary |
| bonus | income | Bonus | Bonus |
| food_drink | expense | Makanan & Minuman | Food & Drink |
| monthly_groceries | expense | Belanja Bulanan | Monthly Groceries |
| vegetables | expense | Belanja Sayur | Vegetables |
| bills | expense | Tagihan | Bills |
| other | expense/income | Lain-lain | Other |
