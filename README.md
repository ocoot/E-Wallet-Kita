# E-Wallet Kita 💰

**E-Wallet Kita** adalah aplikasi web pencatatan keuangan pribadi/rumah tangga berbasis PWA (Progressive Web App), dirancang agar pencatatan pemasukan dan pengeluaran bisa dilakukan secepat mungkin — baik lewat form manual, AI text parsing, upload foto struk, catatan suara, maupun chat lewat Telegram bot.

## ✨ Fitur Utama

- **Pencatatan transaksi cepat** — input manual, parsing teks otomatis dengan AI (memahami singkatan seperti "25rb", "1.5jt"), OCR struk belanja, dan input suara.
- **Integrasi Telegram Bot** — catat transaksi langsung dari chat Telegram tanpa perlu membuka aplikasi web.
- **Dashboard ringkasan** — grafik tren pemasukan/pengeluaran, saldo akumulasi, dan ringkasan bulanan.
- **Riwayat transaksi** — filter per bulan/kategori/dompet, pagination, edit & hapus transaksi.
- **Manajemen dompet (wallets)** — dukungan multi-dompet (e-wallet, bank, tunai, umum) beserta saldo masing-masing.
- **Budget & kategori** — atur anggaran per kategori dan dapatkan notifikasi saat mendekati/melewati batas.
- **Tabungan & cicilan** — kelola pos tabungan, tabungan emas, dan pelacakan cicilan/angsuran.
- **Pengingat tagihan (bill reminders)** — notifikasi otomatis untuk tagihan berulang.
- **Ekspor laporan PDF** — ringkasan bulanan maupun laporan lengkap multi-bulan.
- **Fitur Premium** — pembayaran via QRIS, sistem voucher diskon, dan struk pembayaran.
- **Multi-bahasa & multi-tema** — Indonesia/Inggris dan tema Dark Obsidian/Light Sakura, dapat diganti tanpa reload.
- **Guest Mode** — bisa dicoba tanpa perlu mendaftar akun.
- **Panel Admin** — manajemen kategori, voucher, mode maintenance, broadcast notifikasi, monitoring error & pemakaian AI/premium.

## 🎯 Target Pengguna

Aplikasi ini utamanya ditujukan untuk ibu rumah tangga dan pengelola keuangan keluarga yang butuh pencatatan sederhana dan minim friksi, termasuk pengguna yang lebih nyaman mencatat lewat chat Telegram dibanding membuka aplikasi web.

## 🛠️ Tech Stack

- **Frontend:** React 19, TypeScript, Vite, React Router, Tailwind CSS, Motion (Framer Motion), Recharts
- **Backend/API:** Express (server.ts) + Vercel Serverless Functions
- **Database & Auth:** Supabase (Postgres + Auth + RLS)
- **AI:** Google Gemini & OpenAI (parsing transaksi teks/suara, OCR struk)
- **Notifikasi:** Firebase Cloud Messaging (push notification), Telegram Bot API
- **PDF:** jsPDF + jsPDF-AutoTable (ekspor laporan & struk)
- **PWA:** vite-plugin-pwa + Workbox (service worker, offline support)

## 📁 Struktur Folder Singkat

```
src/
├── views/        # Halaman utama (Dashboard, History, Budget, Savings, Settings, Admin*, dll)
├── components/   # Komponen UI & modal yang dapat dipakai ulang
├── contexts/      # React Context (Auth, Toast, Language, dll)
├── hooks/        # Custom hooks
├── lib/          # Utilitas (Supabase client, PDF generator, audio feedback, dll)
├── locales/      # File terjemahan (id.json, en.json)
└── types/        # Definisi TypeScript

api/              # Serverless functions (webhook Telegram, parsing AI, pembayaran premium, dll)
supabase/         # Migrasi database
docs/             # Dokumentasi produk (PRD, master prompt)
```

## 🚀 Menjalankan Secara Lokal

```bash
npm install
npm run dev      # menjalankan server pengembangan (server.ts via tsx)
```

Build untuk produksi:

```bash
npm run build
npm start
```

## 📄 Dokumentasi Lebih Lanjut

Lihat `docs/prd.md` untuk detail Product Requirements Document (latar belakang, scope, dan arsitektur produk).
