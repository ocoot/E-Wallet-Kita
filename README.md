# E-Wallet Kita — Paket Perubahan (4 Fitur Baru)

Struktur folder di zip ini **PERSIS SAMA** dengan struktur project Anda — tinggal
copy/replace file yang sama persis ke lokasi yang sama di project Anda.

File BARU (belum ada sebelumnya) ditandai 🆕. File yang DIUBAH (menimpa file lama)
ditandai ✏️.

## 1. Kontrol Privasi & Data (Export Data + Hapus Akun Sendiri)

- 🆕 `supabase/migrations/20260731020000_self_service_account_deletion.sql`
  — RPC `delete_own_account_data()` (service-role only) yang membersihkan
  semua data terkait user di skema public sebelum akun auth-nya dihapus.
- 🆕 `api/account/privacy.ts` — endpoint baru:
  - `GET /api/account/privacy` → ekspor semua data pribadi user sebagai JSON
  - `DELETE /api/account/privacy` → hapus akun & seluruh data secara permanen
- 🆕 `src/lib/privacy.ts` — helper client (`exportMyData()`, `deleteMyAccount()`)
- 🆕 `src/components/DeleteAccountModal.tsx` — modal konfirmasi hapus akun
  (harus mengetik ulang frasa konfirmasi, bukan cuma klik tombol)
- ✏️ `src/views/Settings.tsx` — section baru "Privasi & Data" di halaman Settings
- ✏️ `vercel.json` — mendaftarkan function baru `api/account/privacy.ts`

**PENTING**: Endpoint ini butuh `SUPABASE_SERVICE_ROLE_KEY` di environment
variables Vercel Anda (biasanya sudah ada karena dipakai `api/telegram-webhook.ts`
& `api/premium/payment.ts` juga).

## 2. Voice Note ke Transaksi (via Telegram Bot)

- ✏️ `api/telegram-webhook.ts` — menambahkan:
  - `transcribeVoiceNote()` — transkripsi audio pakai Gemini (reuse model
    fallback chain yang sama dengan parsing teks)
  - `handleVoiceNote()` — download voice note → transkrip → masuk ke
    pipeline parsing transaksi YANG SAMA PERSIS dengan pesan teks biasa
  - Dispatch baru: `update.message.voice` di handler utama
- ✏️ `api/_lib/botText.ts` — pesan bot baru (`voiceTranscribing`, `voiceHeard`,
  `voiceTranscribeError`, `voiceTooLong`) + update teks `/help` & `/start`
  untuk menyebutkan fitur voice note

Tidak ada perubahan skema database untuk fitur ini — reuse infrastruktur
`parseFinancialQuery` + `upsert_pending_telegram_tx` yang sudah ada.

## 3. Cicilan / Utang Jangka Panjang (dengan Progress)

- 🆕 `supabase/migrations/20260731000000_installments.sql` — tabel
  `installments` + RPC `mark_installment_month_paid_for_user()` &
  `unmark_installment_last_payment_for_user()` + registrasi feature-lock
  `installments` di Admin Panel
- 🆕 `src/hooks/useInstallments.ts`
- 🆕 `src/views/Installments.tsx` — halaman penuh (CRUD + progress bar +
  "12 dari 24 bulan selesai")
- 🆕 `src/components/DashboardInstallments.tsx` — widget ringkas di dashboard
- ✏️ `src/types.ts` — interface `Installment`
- ✏️ `src/lib/db.ts` — method CRUD + mark/unmark paid
- ✏️ `src/components/Sidebar.tsx` — menu baru "Cicilan"
- ✏️ `src/App.tsx` — route `/installments` + lazy import + skeleton
- ✏️ `src/views/Dashboard.tsx` — render widget `DashboardInstallments`

## 4. Saldo Terakumulasi di Dashboard

- 🆕 `supabase/migrations/20260731010000_accumulated_balance_rpc.sql` — RPC
  `get_accumulated_balance()` (SUM agregat di server, bukan fetch semua
  transaksi ke client)
- 🆕 `src/components/DashboardAccumulatedBalance.tsx` — kartu banner baru
  di paling atas dashboard (setelah header, sebelum ringkasan bulan berjalan)
- ✏️ `src/lib/db.ts` — method `getAccumulatedBalance()`
- ✏️ `src/views/Dashboard.tsx` — render banner tsb

## i18n

- ✏️ `src/locales/id.json` & `src/locales/en.json` — semua string baru untuk
  ke-4 fitur di atas, termasuk label fitur baru "Cicilan/Utang" di Admin
  Panel → Maintenance Mode.

## Deploy Checklist

1. Copy semua file dari zip ini ke project Anda (replace langsung, path sudah sama).
2. Jalankan 3 migration baru secara berurutan lewat Supabase CLI/Dashboard:
   - `20260731000000_installments.sql`
   - `20260731010000_accumulated_balance_rpc.sql`
   - `20260731020000_self_service_account_deletion.sql`
3. Deploy ke Vercel seperti biasa (`vercel.json` sudah include function baru).
4. Cek Admin Panel → Maintenance untuk lihat entry fitur baru "Cicilan/Utang"
   (defaultnya *tidak terkunci*).
5. Test end-to-end:
   - Settings → Privasi & Data → coba "Unduh Data Saya" (jangan test hapus akun
     di akun produksi asli — buat akun uji coba dulu).
   - Kirim voice note ke bot Telegram, mis. rekam "beli bensin 50 ribu".
   - Buka `/installments`, tambah cicilan baru, coba "Tandai Bulan Ini Lunas".
   - Buka Dashboard, cek banner "Saldo Terakumulasi" muncul di atas.

## Catatan Desain Penting

- **Hapus akun** memakai 2 langkah: RPC SECURITY DEFINER membersihkan skema
  `public` dulu (termasuk `user_voucher_claims` yang tidak punya
  `ON DELETE CASCADE`), baru setelah itu `supabase.auth.admin.deleteUser()`
  dipanggil. Urutan ini disengaja: kalau langkah auth gagal, data yang sudah
  bersih tidak apa-apa (user tinggal coba lagi), tapi tidak ada risiko akun
  auth hilang duluan sementara datanya masih nyangkut.
- **Voice note** TIDAK menulis ulang logic parsing transaksi — cuma
  menambahkan langkah transkripsi di depan, lalu memanggil fungsi
  `parseFinancialQuery()` yang sama persis dengan pesan teks biasa. Ini
  supaya tidak ada 2 tempat terpisah yang perlu dites & dipelihara untuk
  logic yang sama.
- **Cicilan** pakai pola hybrid yang sama dengan `bill_reminders`: "Tandai
  Bulan Ini Lunas" otomatis membuat transaksi pengeluaran (kalau nominal
  cicilan/bulan sudah diisi). Kalau nominal belum diisi (variatif tiap
  bulan), user diarahkan ke halaman "Transaksi Baru" dengan kategori &
  catatan sudah terisi otomatis.
- **Saldo terakumulasi** dihitung lewat `SUM()` di server (RPC), bukan fetch
  semua baris transaksi ke browser lalu dijumlah di client — supaya tetap
  cepat meski user sudah punya ribuan transaksi bertahun-tahun.
