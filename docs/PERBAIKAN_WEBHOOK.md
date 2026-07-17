# Perbaikan Webhook Pembayaran KlikQRIS

Ringkasan perubahan hasil audit webhook `api/premium/payment.ts`. Isi zip ini
menimpa file yang sama persis di project asli (path relatif dipertahankan).

## File yang berubah/baru

- `api/premium/payment.ts` — diubah
- `.github/workflows/premium-payment-reconcile.yml` — baru
- `supabase/migrations/20260823000000_atomic_klikqris_webhook.sql` — baru
  (dipakai baik oleh webhook maupun reconciliation job, lihat poin 3)

`vercel.json` **tidak ikut berubah** di versi ini — sempat ditambah
`crons`, tapi scheduling dipindah ke GitHub Actions (lihat poin 3), jadi
file aslinya tidak perlu disentuh.

## 1. Response blocking + race condition (PUT webhook)

Sebelumnya 3 query berurutan (`select` → `update tx` → `update user`) sebelum
membalas 200. Diganti jadi 1 RPC atomic (`process_klikqris_webhook`) dengan
`FOR UPDATE` di dalam Postgres — 1 round-trip, dan tidak bisa lagi diproses
dobel kalau 2 webhook datang nyaris bersamaan.

## 2. Bug tersembunyi: kolom `paid_amount` tidak pernah ada di schema

Kode lama meng-update kolom `paid_amount` yang tidak pernah dibuat lewat
migration manapun. Supabase menolak seluruh `UPDATE` kalau ada kolom tak
dikenal, dan kode lama tidak mengecek `error` dari `.update()` itu — jadi
`premium_transactions.status` **tidak pernah** benar-benar berubah jadi
`SUCCESS` lewat webhook (gagal senyap), walau `users.is_premium` tetap
ke-set benar (query terpisah). Dampaknya: dashboard revenue admin
(`admin_revenue_rpc`, filter `status = 'SUCCESS'`) kemungkinan menampilkan
angka lebih rendah dari transaksi asli. RPC baru tidak menulis kolom itu
lagi — otomatis ikut terperbaiki.

## 3. Reconciliation job (jaring pengaman retry)

Webhook PUT sengaja selalu balas `200` ke KlikQRIS walau ada error internal
(supaya KlikQRIS tidak infinite-retry endpoint yang error terus) — artinya
kalau proses gagal di tengah jalan, tidak ada retry otomatis dari provider.

Ditambahkan `handleReconcile()` di `payment.ts`, dipicu lewat **GitHub
Actions** (`.github/workflows/premium-payment-reconcile.yml`, tiap 15
menit) — bukan endpoint publik baru dan bukan Vercel native cron (Hobby
plan cuma bisa 1x/hari & tidak presisi; GitHub Actions gratis, dipakai
project ini, dan minimum interval-nya 5 menit).

Cara kerja: cari transaksi `status = PENDING` yang dibuat > 10 menit lalu
(non-sandbox), cek ulang status ASLI ke API KlikQRIS, lalu selesaikan lewat
RPC atomic yang sama dengan webhook. Hasil tiap run dicatat ke
`error_logs` (level `info`) supaya bisa dipantau lewat Admin Panel >
Monitor Error.

### Yang perlu disiapkan manual

1. **Set env var `CRON_SECRET`** di Vercel project settings (isi bebas,
   string acak yang panjang).
2. **Set 2 secret di GitHub** (Settings → Secrets and variables → Actions):
   - `CRON_SECRET` — **harus sama persis** dengan yang di Vercel (poin 1).
   - `APP_URL` — kemungkinan sudah ada (dipakai `notify-update.yml`),
     contoh: `https://nama-app-kamu.vercel.app`. Kalau belum ada, buat baru.
3. Jalankan migration baru (`20260823000000_...sql`) ke Supabase sebelum
   deploy `payment.ts` yang baru, karena kode memanggil RPC
   `process_klikqris_webhook` yang didefinisikan di situ.
4. Setelah deploy, cek tab **Actions** di GitHub — workflow
   "Premium Payment Reconciliation" akan mulai jalan otomatis tiap 15
   menit. Bisa juga dipicu manual lewat tombol "Run workflow" untuk tes.

### Keterbatasan yang perlu disadari

- Waktu run GitHub Actions **tidak presisi** — delay 5–30 menit saat
  traffic tinggi itu wajar, jadi anggap ini "biasanya dalam 15–45 menit",
  bukan jaminan 15 menit persis.
- Scheduled workflow GitHub otomatis nonaktif kalau **repo tidak ada
  aktivitas 60 hari** — kecil kemungkinannya untuk repo yang aktif
  dikembangkan, tapi kalau project sempat "istirahat" lama, cek tab
  Actions dan klik "Enable workflow" lagi.
- GitHub tidak mengirim notifikasi otomatis kalau scheduled run gagal;
  workflow-nya sengaja `exit 1` kalau HTTP response bukan 200, supaya
  minimal kelihatan sebagai run merah di tab Actions.

### Kenapa tidak dibuat tabel log terpisah

Sempat direncanakan tabel `webhook_delivery_log`, tapi project ini sudah
punya `error_logs` (dengan kolom `level`, `context`, dan tampilan di Admin
Panel) — jadi reconciliation cukup menulis ke situ dengan `source:
"premium/payment:reconcile"`, tidak perlu tabel baru.
