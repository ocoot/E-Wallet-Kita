# Dummy QRIS Toggle — Ringkasan Implementasi

## Apa yang dikerjakan & kenapa

Menambahkan toggle **"Mode Dummy QRIS"** di Admin Panel > Monitor Premium,
supaya admin bisa menguji alur pembelian premium dari awal sampai sukses
(create transaction -> tampil QR -> polling status -> akun jadi premium)
tanpa pernah memanggil gateway KlikQRIS asli atau memproses uang
sungguhan — sesuai kebutuhan untuk memastikan alurnya aman sebelum fitur
premium diperkenalkan ke publik.

Saat toggle **aktif**:
1. `api/premium/create-transaction.ts` tidak memanggil KlikQRIS asli sama
   sekali. Sebagai gantinya, membuat QR dummy (lewat `api.qrserver.com`,
   mengikuti konvensi yang sudah ada di kode dev-sandbox lama) dan
   menyimpan transaksi dengan `is_sandbox = true`.
2. `api/premium/status.ts` mendeteksi `is_sandbox = true` pada transaksi
   tersebut dan otomatis menandainya `SUCCESS` ± 8 detik setelah dibuat
   (tanpa pernah memanggil API status KlikQRIS asli), lalu mengaktifkan
   `is_premium` pada user persis seperti alur asli.
3. Karena responsnya berbentuk identik dengan transaksi asli, **tidak ada
   perubahan sama sekali** di `PremiumModal.tsx`/alur polling — UI yang
   sama persis yang akan dipakai publik ikut teruji.
4. `PremiumModal.tsx` menampilkan catatan kecil "mode uji coba" yang baru
   (beda dari catatan dev-sandbox lama) supaya jelas ini bukan transaksi
   asli.

Saat toggle **nonaktif** (default): semuanya berjalan seperti sebelumnya,
memanggil KlikQRIS asli.

## File yang dibuat/diubah (path lengkap)

**Dibuat:**
- `supabase/migrations/20260711000000_dummy_qris_setting.sql` — seed key
  `dummy_qris_enabled` di tabel `app_settings` (default `'false'`).
- `supabase/migrations/20260711000001_fix_revenue_metrics_exclude_sandbox.sql`
  — lihat catatan bug di bawah.

**Diubah:**
- `api/premium/create-transaction.ts` — cabang dummy QRIS + helper
  `isDummyQrisEnabled()` / `randomUniqueCode()`.
- `api/premium/status.ts` — auto-resolve transaksi `is_sandbox` ke
  `SUCCESS` tanpa memanggil KlikQRIS asli.
- `src/lib/premium.ts` — tambah field opsional `is_sandbox?: boolean` di
  interface `PremiumTransaction` (murni tipe, tidak ada logic yang
  berubah).
- `src/components/PremiumModal.tsx` — catatan UI tambahan untuk transaksi
  dummy yang dibuat server (beda dari catatan dev-sandbox `isSandboxMode()`
  yang sudah ada, tidak diubah).
- `src/views/AdminPremiumMonitor.tsx` — kartu toggle baru, banner
  peringatan saat aktif, modal konfirmasi (beda teks untuk aktif/nonaktif),
  dan penyesuaian state/`useEffect` terkait.
- `src/locales/id.json` & `src/locales/en.json` — 15 key baru di
  namespace `admin.dummy_qris_*` + 1 key baru `premium.dummy_qris_notice`,
  ditambahkan ke kedua file secara paralel (parity terverifikasi: 766 = 766
  leaf keys).

## Migration SQL baru — idempotent?

Ya, keduanya idempotent:
- `dummy_qris_setting.sql` pakai `INSERT ... ON CONFLICT (key) DO NOTHING`.
- `fix_revenue_metrics_exclude_sandbox.sql` pakai `CREATE OR REPLACE
  FUNCTION` dengan signature yang sama (`get_admin_revenue_metrics()`).

## Bug yang ditemukan & diperbaiki sekalian (bukan dari task asli, tapi konsekuensi langsung)

`get_admin_revenue_metrics()` RPC sebelumnya menghitung **semua** baris di
`premium_transactions` tanpa memfilter `is_sandbox`. Begitu toggle Dummy
QRIS ini dipakai dan menghasilkan transaksi `SUCCESS`, angka tersebut akan
ikut tercampur ke Total Pendapatan & hitungan status asli di dashboard.
Sudah diperbaiki: angka utama (`totalRevenue`, `totalTransactions`,
`successCount`, `pendingCount`, `expiredCount`, `failedCount`) sekarang
hanya menghitung transaksi `is_sandbox = false`. Ditambahkan field baru
`sandboxCount` (transaksi dummy, status apa pun) untuk visibilitas, sengaja
dipisah dari angka revenue asli. Field `sandboxCount` ditampilkan sebagai
teks kecil di bawah toggle (bukan tile metrik baru), supaya layout grid
6-tile yang sudah ada tidak berubah.

## id.json / en.json masih sinkron?

Ya — diverifikasi dengan skrip Python, 766 leaf keys persis sama di kedua
file, tidak ada key yang hilang di salah satu sisi.

## Apakah server.ts perlu disamakan?

Tidak. `server.ts` tidak pernah memproxy `/api/premium/*` sama sekali
(bukan drift baru dari task ini — itu kondisi yang sudah ada sebelumnya),
jadi tidak ada logic paralel yang perlu disinkronkan untuk perubahan ini.

## Penyimpangan dari aturan (WAJIB dijelaskan kalau ada)

Satu keputusan desain yang perlu dikonfirmasi balik ke kamu:

- **Tidak menambah RPC `SECURITY DEFINER` + audit log** untuk toggle ini.
  Ditulis sebagai update langsung ke `app_settings` dari client (dilindungi
  RLS admin/owner-only yang sudah ada), mengikuti pola yang sama persis
  dengan `premium_base_price` di `AdminVoucherManager.tsx` (juga update
  langsung, juga tidak ada audit log). Karena toggle ini cukup sensitif
  (bisa mematikan pembayaran asli secara diam-diam kalau lupa
  dinonaktifkan), saya kompensasi dengan modal konfirmasi (beda teks untuk
  aktif/nonaktif) + banner peringatan persisten saat aktif — tapi TIDAK
  menambah infrastruktur RPC/audit baru tanpa konfirmasi kamu dulu, sesuai
  §9.2/§9.4 di guardrail. Kalau kamu mau jejak audit (siapa & kapan
  mengaktifkan/menonaktifkan), saya bisa tambahkan RPC
  `admin_set_dummy_qris_mode` yang menulis ke `admin_audit_logs` mengikuti
  pola `admin_set_maintenance_mode` — tapi itu perlu approval karena
  menambah RPC baru.

## Catatan/Usulan (perlu approval)

- `admin.revenue_sandbox` ("Sandbox") di `id.json`/`en.json` masih jadi key
  orphan (tidak dipakai di mana pun) — sudah ada dari sebelumnya, tidak
  saya hapus maupun saya pakai, hanya melaporkan sesuai aturan kebersihan
  i18n.
- Kode dev-sandbox lama di `src/lib/premium.ts` (`isSandboxMode()` yang
  ditentukan dari `import.meta.env.DEV`, lalu insert/update langsung ke
  `premium_transactions` dari client) sebetulnya akan gagal kena RLS di
  Supabase manapun, karena migration `20260623000000_premium_feature.sql`
  me-revoke insert/update tabel itu dari role `authenticated`. Saya tidak
  menyentuh/memperbaikinya karena di luar scope task ini — flag saja
  sesuai §9.3.
