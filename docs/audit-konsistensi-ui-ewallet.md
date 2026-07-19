# Audit Konsistensi Visual — e-wallet-kita (porselen-giok v3)

**Lingkup:** komponen bersama (`Button`, `Card`, `Badge`, `Input`, `ToggleSwitch`, `Modal`) vs. pemakaian aktualnya di seluruh `src/components` & `src/views`.
**Metode:** pemeriksaan langsung ke source code (grep pola class, bukan asumsi) — setiap temuan disertai file & baris.

---

## Ringkasan Eksekutif

| Komponen | Status | Tingkat Risiko |
|---|---|---|
| `ToggleSwitch` | ✅ Konsisten, 100% terpusat | — |
| `Card` | 🟢 Mayoritas terpusat, 2 kebocoran kecil | Rendah |
| `Input` | 🟠 **Ada 3 sumber kebenaran paralel** untuk gaya input | Sedang–Tinggi |
| `Badge` | 🟠 Banyak pola pill status ditulis manual, 1 kasus **theme-breaking bug** | Sedang–Tinggi |
| `Button` | 🟠 CTA primary/success ditulis ulang manual di ±10 file | Sedang |
| `Modal` (shell/backdrop) | 🔴 Backdrop & container ditulis ulang identik di 13 file, nilai mulai divergen (opacity/blur/z-index beda-beda) | **Tinggi** |
| Theme tokens (`light_sakura:`) | 🟢 98%+ terpusat di `tokens.ts`, sisa kebocoran kecil tapi berpola jelas | Rendah |

Inti masalah bukan "tidak ada sistem terpusat" — sistemnya **sudah ada dan sudah bagus** (`Button.tsx`, `Card.tsx`, `Badge.tsx`, `Input.tsx`, `ToggleSwitch.tsx`, `tokens.ts`, `useThemeTokens`). Masalahnya: **beberapa file belum migrasi**, dan yang lebih berbahaya, **ada token "jalan pintas" di `tokens.ts` sendiri yang sengaja dibuat sebagai jalur paralel** di luar komponen (`tokens.form.input`, `tokens.button.accentEmerald`) — ini justru melegitimasi duplikasi ke depannya kalau tidak segera dipensiunkan.

---

## 1. Input — 🟠 Tiga sumber kebenaran paralel

Ditemukan **tiga pola berbeda** untuk field teks yang seharusnya satu:

| Sumber | Radius | Padding | Dipakai di |
|---|---|---|---|
| `ui/Input.tsx` (komponen resmi) | `rounded-2xl` | `px-4 py-3` | Login-adjacent forms, sebagian form utama |
| `tokens.form.input` (string di `tokens.ts`) | `rounded-xl` | `px-3 py-2` | `Wallets.tsx`, `WalletTopUpModal.tsx`, `WalletTransferModal.tsx`, `HistoryEditModal.tsx`, `Onboarding.tsx`, `AdminUserManager.tsx` |
| `tokens.form.inputLg` (varian ke-2, beda `py-2.5` saja) | `rounded-xl` | `px-3 py-2.5` | `ConfirmTransactionModal.tsx`, `HistoryEditModal.tsx` |

Komentar di `tokens.ts` baris 261–270 **mengonfirmasi ini kondisi migrasi setengah jalan**:
> *"Kalau app ini nanti pindah ke `ui/Input.tsx` sepenuhnya untuk semua field, token ini bisa dipensiunkan; sampai saat itu, dipakai untuk `<input>` polos yang belum migrasi ke komponen `Input`."*

**Dampak:** kalau desain input diubah (radius, padding, warna focus), harus edit di **3 tempat berbeda** dan tetap ada risiko file yang pakai `<input className="w-full px-4 py-3 border rounded-xl ...">` custom (mis. `NewTransaction.tsx` baris 530) yang tidak tersentuh sama sekali oleh token maupun komponen.

Catatan positif: warnanya (bg/border/text) **hampir semua sudah lewat `tokens.*`**, jadi migrasi tema (dark_obsidian ↔ light_sakura) aman — yang bocor murni di layer *shape* (radius/padding), bukan warna.

---

## 2. Badge — 🟠 Pola pill ditulis manual + 1 bug lintas-tema

`Badge.tsx` + `tokens.badge.*` sudah lengkap (5 tone, sudah dua-tema). Tapi banyak status pill ditulis manual meniru class yang sama persis, tanpa lewat komponen ataupun token:

- **`AdminBackup.tsx` baris 315/321/326** — 3 status (`success`/`failed`/`running`) ditulis manual dengan pola `px-2.5 py-1 rounded-full text-[10px] font-black bg-{tone}-500/10 text-{tone}-400 border border-{tone}-500/20`, **tanpa varian `light_sakura:` sama sekali**. Ini bukan cuma soal maintenance — **ini bug nyata**: badge status backup akan salah warna/tidak kontras saat tema light_sakura aktif, karena ditulis manual dan penulisnya lupa menyertakan pasangan warna terang. Kalau pakai `<Badge tone="success">`, bug ini otomatis tidak mungkin terjadi karena tone sudah dua-tema dari sononya.
- Pola serupa (beda opacity `/15` vs `/10`, tanpa border) juga di: `WalletTopUpModal.tsx`, `WalletTransferModal.tsx`, `DashboardBillReminders.tsx`, `DashboardWalletSelectorCard.tsx`, `ConfirmTransactionModal.tsx`, `Savings.tsx`, `GoldSavings.tsx`, `AdminBroadcast.tsx`, `AdminSupportChat.tsx`, `AdminErrorMonitor.tsx`, `AdminUserManager.tsx`.

**Dampak:** setiap kali ada aturan baru untuk badge (misal ukuran font atau border-radius pill diseragamkan), tim harus grep manual ke ±13 file alih-alih ubah satu tempat.

---

## 3. Toggle Switch — ✅ Bersih

Hanya dipakai lewat `<ToggleSwitch />` di `NotificationSettings.tsx` dan `Settings.tsx`. Tidak ditemukan pola `peer-checked:translate-x` atau `role="switch"` custom di file lain. **Tidak perlu tindakan** — ini contoh migrasi yang benar dan bisa jadi acuan pola kerja untuk komponen lain.

---

## 4. Button — 🟠 CTA primary/success ditulis ulang

Class identik dengan `variantClasses.primary`/`success` di `Button.tsx` (`bg-indigo-600 hover:bg-indigo-500/700`, `bg-emerald-600 hover:bg-emerald-500`) ditulis manual di:
`AdminVoucherManager.tsx` (2×), `AdminCategoryManager.tsx` (2×), `AdminBroadcast.tsx`, `AdminBackup.tsx`, `Wallets.tsx` (3×), `ProfileSettings.tsx`, `Settings.tsx` (2×), `PwaSettings.tsx`, `NewTransaction.tsx`, `Savings.tsx`, `GoldSavings.tsx`.

Efek yang sudah kelihatan: radius tombol untuk aksi yang **secara semantik sama** (submit primer) bervariasi — `rounded-xl` vs `rounded-lg` vs `rounded-2xl` — tergantung siapa yang menulis filenya. `tokens.ts` bahkan sudah mencatat sendiri (baris 205–216) bahwa `tokens.button.accentEmerald` sengaja dibuat sebagai "tombol custom inline, bukan lewat komponen Button" — ini pola yang sama seperti `tokens.form.input`: **token dipakai untuk melegitimasi jalur di luar komponen**, bukan untuk migrasi ke komponen.

---

## 5. Modal / dialog shell — 🔴 Prioritas tertinggi

`Modal.tsx` hanya menangani dialog konfirmasi sederhana (title/description/confirm/cancel). Untuk modal dengan konten custom (form top-up, form transfer, edit riwayat, dst), **tidak ada wrapper bersama** — 13 file menulis ulang markup backdrop + container yang sama persis:

```
<div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
  ...
  <div className="fixed inset-0 bg-black/60 backdrop-blur-xs" .../>
```

File: `AdminUserDetailModal`, `ConfirmTransactionModal`, `DeleteAccountModal`, `ExportFullModal`, `ExportSummaryModal`, `HistoryDeleteModal`, `HistoryEditModal`, `ResetPasswordModal`, `WalletTopUpModal`, `WalletTransferModal`, `VoicePreview`, `PremiumModal`, `UpdatePrompt`.

**Karena ditulis manual, nilainya sudah mulai berbeda-beda** — bukti nyata risiko duplikasi:

| Variasi | Nilai berbeda ditemukan |
|---|---|
| Opacity backdrop | `/60` (mayoritas) vs `/70` (`DeleteAccountModal`, `HistoryDeleteModal`) vs `bg-slate-950/80` (`PremiumModal`) |
| Blur | `backdrop-blur-xs` vs `backdrop-blur-sm` |
| Z-index | `z-50` vs `z-[45]` (`EmojiPicker`) vs `z-[90]` (`UpdatePrompt`) |

Hook pendukung (`useLockBodyScroll`, `useDialogA11y`) **sudah reusable dan sudah dipakai konsisten** — yang belum diekstrak murni bagian visual (backdrop + container + animasi masuk/keluar).

---

## 6. Theme tokens (`light_sakura:`) — 🟢 Mayoritas rapi

402 dari ±418 total pemakaian `light_sakura:` ada di `tokens.ts` (terpusat). Sisa 16 kebocoran, yang paling signifikan **karena identik dan berulang** (kandidat token baru, bukan cuma "rapikan"):

```
hover:bg-slate-800/50 light_sakura:hover:bg-rose-100/50
```
— muncul persis sama 6× di `SupportChatWidget.tsx` (3×) dan `AdminSupportChat.tsx` (3×). Sisanya di `EmojiPicker.tsx` dan `SplashScreen.tsx`, dampaknya kecil (1–2 kemunculan).

---

## Akar Masalah (kenapa ini terus terjadi)

1. **Token "escape hatch" di `tokens.ts` sendiri** (`form.input`, `form.inputLg`, `button.accentEmerald`) secara implisit mengizinkan pola di luar komponen — developer baru akan mencontoh pola ini karena terlihat "resmi" (ada di `tokens.ts`, dikutip lewat `useThemeTokens()`), padahal tujuannya cuma sementara.
2. **Tidak semua elemen UI berulang punya wadah komponen** — khususnya *modal shell* dan *status pill/badge inline* — sehingga developer terpaksa copy-paste dari file modal/badge terdekat setiap kali butuh yang baru.
3. Tidak ada *lint rule* atau *code review checklist* yang menahan class Tailwind hardcode (`bg-indigo-600`, `bg-emerald-500/15`, dst.) masuk ke PR baru.

---

## Rencana Prioritas Perbaikan

### P0 — Cegah bug & hentikan pertumbuhan duplikasi (1 sprint)
1. **Perbaiki bug `AdminBackup.tsx`**: ganti 3 badge status manual → `<Badge tone="success"|"danger"|"warning">`. Ini prioritas #1 karena satu-satunya temuan yang benar-benar salah visual di produksi (light_sakura), bukan cuma soal maintenance.
2. **Ekstrak `ModalShell`** (`components/ui/ModalShell.tsx` atau letakkan di `Modal.tsx` sebagai named export terpisah): satu wrapper untuk backdrop + container + `useLockBodyScroll` + `useDialogA11y`, terima `children` sebagai konten. Standarkan nilai final: pilih satu opacity (`/60`), satu blur, satu skema z-index (base `z-50`, dengan token `z-[90]` khusus untuk *update prompt*/toast-level jika memang perlu beda layer).
3. Migrasi 13 file modal custom ke `ModalShell` satu per satu — tidak perlu big-bang, tapi jangan buat modal baru tanpa `ModalShell` lagi mulai sekarang.

### P1 — Satukan sumber kebenaran Input & Button (1–2 sprint)
4. **Pensiunkan `tokens.form.input` & `tokens.form.inputLg`**: migrasi 6 file pemakainya ke `<Input />`. Untuk kasus tabel inline (`AdminCategoryManager.tsx`) yang butuh input ramping tanpa label, tambahkan prop resmi di `Input.tsx`, misalnya `size="compact"` (bukan bikin token baru lagi).
5. **Pensiunkan `tokens.button.accentEmerald`** dan CTA hardcode lain → pastikan `Button.tsx` mendukung semua kombinasi warna yang selama ini dicapai manual (cek apakah varian `success` sudah cukup, atau perlu varian baru yang eksplisit, bukan class bebas).
6. Audit ulang & migrasi 10 file dengan CTA `bg-indigo-600`/`bg-emerald-600` manual → `<Button variant="primary"|"success">`.

### P2 — Rapikan Badge & sisa token bocor (paralel dengan P1)
7. Migrasi ±13 pemakaian pill status manual → `<Badge tone="...">`.
8. Tambahkan token baru `tokens.surface.hoverSubtle` untuk pola `hover:bg-slate-800/50 light_sakura:hover:bg-rose-100/50`, lalu ganti 6 kemunculannya di `SupportChatWidget.tsx`/`AdminSupportChat.tsx`.
9. Bereskan 2 kasus kecil `Card` hardcode (`TelegramSettings.tsx`, `Settings.tsx` baris ~1103) → gunakan `<Card>` atau minimal `tokens.surface.card` + `tokens.border.default`.

### Governance — supaya tidak berulang lagi
- **Hapus token "jalan pintas"** begitu migrasi selesai (jangan biarkan `tokens.form.input` dkk hidup permanen sebagai "opsi B" resmi).
- Tambahkan **catatan wajib** di `tokens.ts`/komponen `ui/`: token baru hanya boleh ditambah kalau pola dipakai ≥2 file **dan** tidak bisa dicapai lewat prop baru di komponen yang sudah ada (pola dokumentasi yang sudah bagus di file ini — tinggal ditegakkan lebih ketat untuk kasus Button/Input).
- Opsional: `eslint` rule sederhana (regex-based, mis. `no-restricted-syntax`) yang menandai literal class seperti `bg-indigo-600`, `bg-emerald-500\/15`, `fixed inset-0 z-50` di luar folder `components/ui/` sebagai warning saat PR.

**Kenapa urutan ini:** P0 dulu karena satu-satunya temuan yang sudah jadi bug tampilan aktif, dan karena `ModalShell` adalah duplikasi dengan sebaran file (13) & divergensi nilai terbesar. P1 baru setelah itu karena Input/Button punya *dua sistem resmi yang saling bersaing* — kalau dibiarkan, migrasi tema atau desain berikutnya akan makin mahal karena harus menyentuh `tokens.ts` **dan** komponen **dan** file yang belum migrasi sekaligus. P2 murni pembersihan volume kecil yang bisa dikerjakan sambil jalan.
