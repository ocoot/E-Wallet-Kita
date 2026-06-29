# FCM Fixes — Panduan Replace File

Audit & perbaikan ini mencakup poin #1–#7 dari hasil audit fitur FCM
(e-wallet-kita__83_.zip). Semua file di sini sudah berisi PATCH LENGKAP
(termasuk patch multi-device sebelumnya) — cukup timpa file lama dengan
file yang sesuai, TIDAK perlu digabung manual.

## Cara pakai
Salin tiap file ke lokasi yang SAMA PERSIS di project Anda (timpa file
lama). Struktur folder di zip ini sudah mengikuti struktur project asli,
jadi tinggal extract zip ini ke root project dan timpa (replace) semua
file yang konflik.

## Daftar file & lokasinya

| File di zip                                          | Lokasi di project                                     | Status      |
|-------------------------------------------------------|--------------------------------------------------------|-------------|
| `src/lib/firebase.ts`                                  | `src/lib/firebase.ts`                                   | Diubah      |
| `src/App.tsx`                                          | `src/App.tsx`                                           | Diubah      |
| `api/_lib/fcm.ts`                                      | `api/_lib/fcm.ts`                                       | Diubah      |
| `api/admin/broadcast.ts`                               | `api/admin/broadcast.ts`                                | **MERGED**  |
| `api/internal/send-bill-reminder-push.ts`              | `api/internal/send-bill-reminder-push.ts`               | **BARU**    |
| `scripts/inject-push-handler.mjs`                      | `scripts/inject-push-handler.mjs`                       | Diubah      |
| `vercel.json`                                          | `vercel.json` (root project)                            | Diubah      |
| `supabase/functions/bill-reminder-notifier/index.ts`   | `supabase/functions/bill-reminder-notifier/index.ts`    | Diubah      |

Catatan: migration SQL `20260728000000_push_tokens_multi_device.sql`
(dari sesi sebelumnya) TIDAK disertakan ulang di sini karena tidak ada
perubahan baru padanya — pastikan migration itu sudah Anda jalankan.

## Ringkasan perbaikan per nomor

1. **Hapus token saat logout** (`firebase.ts`, `App.tsx`) — fungsi baru
   `clearFcmToken()` dipanggil sebelum `signOut()`, supaya device yang
   dipakai bersama tidak terus menerima notifikasi user yang sudah logout.
2. **Rewrite Vercel yang menimpa `firebase-messaging-sw.js`** (`vercel.json`)
   — rule yang mengarahkan file itu ke `sw.js` sudah dihapus.
3. **Hardcoded Firebase config** (`scripts/inject-push-handler.mjs`) —
   sekarang baca dari env var `VITE_FIREBASE_*` (fallback ke nilai lama
   kalau env var belum di-set, supaya build tidak langsung patah).
4. **Akurasi successCount/failCount broadcast** (`api/_lib/fcm.ts`,
   `api/admin/broadcast.ts`) — sekarang melaporkan jumlah sukses/gagal
   yang sebenarnya dari FCM, bukan asumsi semua sukses.
5. **Kolom `device_info` diisi** (`firebase.ts`) — deteksi OS+browser
   sederhana dari User-Agent, dikirim setiap kali token disimpan.
6. **Hindari permintaan izin & fetch token berulang** (`firebase.ts`) —
   ada cache in-memory per sesi + short-circuit kalau permission sudah
   `denied`.
7. **FCM sebagai kanal tambahan untuk bill reminder** (`api/_lib/fcm.ts`,
   `api/internal/send-bill-reminder-push.ts` [baru],
   `supabase/functions/bill-reminder-notifier/index.ts`) — reminder
   tagihan sekarang juga kirim push notification (selain Telegram seperti
   sebelumnya), lewat endpoint internal baru.

## ⚠️ WAJIB: Environment variable baru yang harus di-set

Untuk poin #7 berfungsi, tambahkan env var berikut:

### Di Vercel (project settings → Environment Variables)
- `INTERNAL_API_SECRET` — string rahasia acak (generate sendiri, contoh:
  `openssl rand -hex 32`). Dipakai untuk autentikasi endpoint internal
  baru `api/internal/send-bill-reminder-push.ts`.

### Di Supabase Edge Function secrets (untuk `bill-reminder-notifier`)
- `VERCEL_APP_URL` — URL domain produksi Anda, contoh `https://e-wallet-kita.vercel.app`
  (tanpa trailing slash).
- `INTERNAL_API_SECRET` — **HARUS SAMA PERSIS** dengan nilai yang di-set
  di Vercel di atas.

Cara set secret di Supabase Edge Function (lewat Supabase CLI):
```
supabase secrets set VERCEL_APP_URL=https://domain-anda.vercel.app
supabase secrets set INTERNAL_API_SECRET=nilai-rahasia-yang-sama
```

Kalau kedua env var di sisi Supabase ini TIDAK di-set, fitur #7 otomatis
nonaktif (skip) dan reminder tagihan tetap berjalan normal lewat Telegram
saja seperti sebelumnya — tidak ada yang patah kalau Anda belum sempat
setup ini.

## Langkah setelah replace file

1. Timpa semua file sesuai tabel di atas.
2. Set 2 env var baru (lihat bagian ⚠️ di atas) — atau skip kalau belum
   mau pakai fitur #7.
3. Deploy ulang ke Vercel (`vercel.json` berubah, jadi perlu redeploy
   penuh, bukan cuma update function).
4. Redeploy Edge Function `bill-reminder-notifier` ke Supabase:
   ```
   supabase functions deploy bill-reminder-notifier
   ```
5. Tes logout di satu device → cek tabel `user_push_tokens` di Supabase,
   pastikan baris token device itu sudah terhapus setelah logout.
6. Tes notifikasi push seperti biasa (transaksi baru / receipt) untuk
   memastikan tidak ada regresi dari perubahan `fcm.ts`.
