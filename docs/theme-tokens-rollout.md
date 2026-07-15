# Rollout useThemeTokens() — Panduan Lanjutan

Status per 2026-07-15 (sesi 4): hook + token dasar sudah dibuat. File yang
sudah selesai/diaudit penuh: `src/components/ui/Card.tsx`,
`src/components/DashboardWalletCards.tsx`, `src/components/MobileBottomNav.tsx`,
`src/views/Wallets.tsx`, `src/views/Onboarding.tsx`. Sesi 4 (ini) mengerjakan
`src/views/Settings.tsx` (78 → 59 kemunculan `light_sakura:`, hook sudah
terpasang, TAPI belum 100% diaudit -- lihat catatan di bawah). Sisanya
(~59 file) belum disentuh — sengaja tidak direfactor sekaligus dalam 1 sesi
supaya setiap perubahan bisa direview & di-test per file, bukan 1 diff
raksasa yang berisiko kalau ada yang salah.

## Sesi 4: Settings.tsx (1238 baris, file terbesar sejauh ini)

Turun dari 78 → 59 kemunculan. Semua yang diganti adalah **exact match ke
token GLOBAL yang sudah ada** (bukan token baru): `tokens.text.onSurface`,
`tokens.text.mutedAlt`, `tokens.text.muted`, `tokens.icon.accent`,
`tokens.text.primary` (baru dipakai di sini: `text-white
light_sakura:text-slate-900`), `tokens.text.success` (baru dipakai di sini:
`text-emerald-400 light_sakura:text-emerald-600`). Hook `useThemeTokens()`
sudah dipasang -- karena file ini SUDAH punya `useTheme()` sendiri (untuk
switcher tema), sengaja HANYA destructure `{ tokens, cx }` dari
`useThemeTokens()` supaya tidak bentrok nama variabel `theme` yang sudah ada.

**59 sisa BELUM diaudit tuntas** seperti halnya Onboarding.tsx, tapi dari
observasi awal sudah ketahuan mayoritas adalah duplikasi INTERNAL file ini
sendiri (dicek cross-file, TIDAK ada match) -- kalau session berikutnya mau
lanjutkan Settings.tsx (bukan pindah ke Login.tsx), fokus ke pola-pola ini
yang paling sering muncul:

- **"Section card" wrapper** (7x): `p-5 rounded-2xl border bg-slate-950/40
  border-slate-800/60 transition-colors duration-300 light_sakura:bg-rose-50/20
  light_sakura:border-rose-100/50 shadow-sm` + `space-y-4`/`space-y-5` beda-beda.
- **H3 section header** (6x): `font-sans font-bold text-sm text-slate-200
  border-b border-slate-800/10 pb-2.5 light_sakura:text-slate-800
  light_sakura:border-rose-100` (beberapa + `flex items-center gap-2`).
- **Toggle/pill tidak-aktif** (4x): `bg-slate-950 border-slate-800
  text-slate-400 hover:bg-slate-900 light_sakura:bg-rose-50/20
  light_sakura:border-rose-100 light_sakura:text-slate-500`.
- **Kotak kecil bg-950/border-800/text-xs** (3x): `bg-slate-950
  border-slate-800 text-xs light_sakura:bg-slate-50 light_sakura:border-rose-100`.
- **Deskripsi muted paragraf** (5x): `font-sans text-xs text-slate-400
  leading-relaxed light_sakura:text-slate-500`.

**PENTING:** kelima pola di atas SUDAH dicek cross-file (grep ke seluruh
`src/views` & `src/components`) dan TIDAK ditemukan exact match di file
lain manapun saat ini -- jadi TIDAK ditambahkan ke `tokens.ts` (mengikuti
aturan "≥2 file berbeda"). Kalau nanti file lain (mis. `Login.tsx`,
`AdminPanel.tsx`) ternyata punya section-card/h3-header dengan class PERSIS
sama, BARU jadikan token global saat itu -- jangan asumsikan dari nama
"section card" saja, tetap `grep -o` exact string dulu.

## Sesi 3: token CTA button baru + Onboarding.tsx dianggap SELESAI diaudit

- **Token baru: `tokens.button.accentEmerald`** —
  `bg-emerald-500 hover:bg-emerald-400 text-white light_sakura:bg-rose-500
  light_sakura:hover:bg-rose-400`, untuk tombol CTA custom (bukan lewat
  `ui/Button.tsx`) dengan aksen emerald/rose. Exact match diverifikasi di
  3 file: `Onboarding.tsx` (3x), `BillReminders.tsx` (1x), `Dashboard.tsx`
  (1x) — shadow & ukuran TIDAK dimasukkan ke token karena beda-beda per
  pemakaian, tetap ditulis literal di pemanggil.
- `BillReminders.tsx` sekarang sudah punya `useThemeTokens()` hook
  terpasang (import + `const { tokens, cx } = useThemeTokens();`) tapi
  BARU 1 dari 34 baris yang dimigrasi (baris tombol "+ Tambah Reminder").
  33 sisanya masih literal — **jangan anggap file ini "selesai"**, hook-nya
  cuma dipasang lebih awal karena kebutuhan token di atas.
- 1 baris no-op dibersihkan di `Onboarding.tsx` baris 356:
  `text-slate-500 light_sakura:text-slate-500` → `text-slate-500` (nilainya
  identik di kedua tema, jadi varian `light_sakura:` di situ tidak
  mengubah apa pun -- bukan token, murni bersih-bersih kode mati).

**`Onboarding.tsx` sekarang dianggap SELESAI diaudit** (81 kemunculan
tersisa, SEMUA sudah dicek cross-file dan TIDAK exact match di file lain):

- Kartu info kecil (`bg-slate-950/40 border-800/40 → rose-50/10 border-
  rose-100`, ~17x) & kartu section (`bg-slate-950/60 border-800/80 →
  rose-50/20 border-rose-100`, ~9x) — tetap literal.
- Ikon polos `text-emerald-500 light_sakura:text-rose-500` tanpa bg (~14x
  di `CheckCircle2`) — tetap literal.
- Avatar/icon-circle abu-abu (`bg-slate-800 ... text-slate-400 →
  light_sakura:bg-rose-50 light_sakura:text-rose-500`, 2x di file ini) —
  dicek cross-file, tidak ada match, tetap literal.
- Input custom, progress bar gradient, badge status transaksi, kombinasi
  gradient/shadow spesifik satu tempat — semua sudah dicek, tetap literal
  sesuai pola yang sama seperti temuan `MobileBottomNav.tsx` sebelumnya.

Kalau nanti mengerjakan `Settings.tsx` atau `Login.tsx` (struktur step/
section mirip Onboarding) dan menemukan kartu info/section dengan class
PERSIS sama seperti di atas, BARU saat itu layak dijadikan token global —
saat ini belum ada file kedua yang cocok.

## Onboarding.tsx: riwayat migrasi (sesi 2, sekarang sudah final -- lihat "Sesi 3" di atas)

File ini 900 baris & 150 kemunculan — jauh lebih besar dari file lain yang
sudah dikerjakan, jadi sesi ini HANYA menuntaskan bagian yang exact-match
aman, bukan seluruh file. Sudah dipakai:

- `tokens.text.onSurface`, `tokens.text.secondary`, `tokens.text.muted`,
  `tokens.text.mutedAlt` — exact match untuk heading/label/body text yang
  berulang puluhan kali (step title, step description, form label).
- **Token baru: `tokens.chip.accentEmerald`** — kombinasi bg+text
  (`bg-emerald-500/10 text-emerald-500 light_sakura:bg-rose-500/10
  light_sakura:text-rose-500`) untuk lingkaran ikon fitur/step. BEDA dari
  `tokens.icon.accent` yang sudah ada (itu indigo/rose, ini emerald/rose).
  Ditemukan identik 11x di `Onboarding.tsx` DAN 1x di `Dashboard.tsx`
  (banner "lanjutkan onboarding") — sudah diverifikasi exact match sebelum
  ditambahkan ke `tokens.ts`, jadi memenuhi aturan "≥2 file berbeda".
  **Cek file lain** (`Budget.tsx`, `Settings.tsx`,
  `DashboardBudgetSummary.tsx`, dll) yang punya ikon lingkaran serupa — dari
  audit sesi ini beberapa TERLIHAT mirip tapi TERNYATA beda kelas
  (opacity/varian warna beda), jadi jangan asumsikan otomatis cocok, tetap
  cek `grep -o` exact string dulu.

86 kemunculan tersisa di `Onboarding.tsx` BELUM disentuh, mayoritas:

- Pola kartu info "step" (`bg-slate-950/40 border border-slate-800/40
  light_sakura:bg-rose-50/10 light_sakura:border-rose-100`, ~17x) dan kartu
  section (`bg-slate-950/60 ... light_sakura:bg-rose-50/20
  light_sakura:border-rose-100`, ~9x) — SUDAH dicek cross-file, TIDAK exact
  match di file lain (file lain pakai opacity border beda, mis. `/40` bukan
  `/80`, atau ada `hover:` tambahan) → tetap literal per aturan, TAPI karena
  berulang >5x dalam file ini sendiri, layak dipertimbangkan jadi token
  kalau nanti ditemukan match di file besar berikutnya (Settings.tsx,
  Login.tsx punya struktur step/section yang mirip).
- Ikon polos `text-emerald-500 light_sakura:text-rose-500` tanpa bg (~16x,
  dipakai di `CheckCircle2` checklist) — dicek cross-file, TIDAK ada
  exact match lain, tetap literal.
- Input custom (2 baris, beda dari `tokens.form.input` karena bg/border/
  focus color berbeda — JANGAN dipaksa pakai token itu).
- Baris dengan varian 3-arah / kombinasi gradient/shadow spesifik satu
  tempat (progress bar warna, badge status transaksi, dll) — pola sama
  seperti temuan `MobileBottomNav.tsx`, sengaja tetap literal.

**Lanjutan untuk sesi berikut:** selesaikan sisa 86 baris di Onboarding.tsx
DULU sebelum pindah file lain (biar tidak ada file "setengah jadi" menumpuk),
baru lanjut ke `Settings.tsx` (78).

## Wallets.tsx: 29 → 9 kemunculan `light_sakura:`

File ini hasilnya jauh lebih bersih dari `MobileBottomNav.tsx` karena
banyak pola form (label field, `<input>`) yang berulang PERSIS. Selain
4 kategori token yang sudah ada, ditemukan 1 token baru yang layak jadi
global:

- **`tokens.form.input`** — styling `<input>` teks/angka standar
  (bg/border/text/focus), berulang VERBATIM 5x hanya di file ini. Kalau
  file lain (NewTransaction, Savings, dll) punya `<input>` custom serupa
  (bukan lewat `ui/Input.tsx`), kemungkinan besar bisa pakai token ini juga
  -- cek dulu exact match sebelum pakai.

9 sisa kemunculan di `Wallets.tsx` sengaja tetap literal: opacity kartu
umum (`/30`, `/40`) yang unik untuk state "general wallet", dan tombol
"+ Tambah" dengan warna rose-600 yang tidak ada padanan tokennya.

## Temuan penting dari MobileBottomNav.tsx (378 baris, 29 kemunculan `light_sakura:`)

Dari 29 kemunculan di file ini, **hanya 4 yang exact match** dengan token
yang sudah ada (icon aktif/inactive di tombol "Lainnya", label aksen,
ikon ShieldCheck, ikon Volume2). 25 sisanya SENGAJA dibiarkan literal
karena:
- Banyak memakai varian eksplisit `dark_obsidian:` berdampingan dengan
  `light_sakura:` (pola 3-arah, bukan 2 seperti token), mis. baris navbar
  utama & bottom-sheet.
- Banyak shade yang mirip tapi beda satu tingkat dari token yang ada
  (`rose-200` vs token yang cuma punya `rose-100`, `red-500` vs token
  `red-600`, dst) — kalau dipaksa akan mengubah tampilan.
- Beberapa kombinasi (gradient tombol FAB, ring warna, shadow custom)
  memang spesifik 1 tempat, tidak reusable.

**Pelajaran untuk file-file berikutnya:** jangan asumsikan semua file
berdensitas duplikasi setinggi `DashboardWalletCards.tsx`. Komponen kartu/
list (dashboard, wallet cards) polanya memang sangat berulang. Komponen
navigasi/layout (nav bar, sheet, modal) cenderung punya kombinasi warna
custom per elemen — nilai refactornya lebih kecil per file, tapi tetap
menyumbang import + hook yang konsisten dipakai di seluruh app.

## File dengan prioritas tertinggi (jumlah `light_sakura:` per file)

Urutkan pengerjaan dari sini ke bawah:

1. `src/views/Settings.tsx` — 59 tersisa (**SEDANG DIKERJAKAN** — lanjutkan
   dulu file ini, lihat 5 pola di atas, sebelum pindah ke file baru)
2. `src/views/Login.tsx` — 67
3. `src/views/AdminPanel.tsx` — 58
4. `src/views/AdminAiMonitor.tsx` — 50
5. `src/components/SupportChatWidget.tsx` — 47
6. `src/views/AdminBackup.tsx` — 41
7. `src/views/AdminPremiumMonitor.tsx` — 38
8. `src/views/AdminErrorMonitor.tsx` — 38
9. `src/views/BillReminders.tsx` — 33 (hook SUDAH terpasang, 1/34 baris
   sudah dimigrasi -- lanjutkan sisanya, jangan pasang hook lagi)
10. `src/views/AdminCategoryManager.tsx` — 33
11. `src/views/AdminMaintenance.tsx` — 32
12. `src/views/Savings.tsx` / `src/views/NewTransaction.tsx` — 31
13. `src/views/Installments.tsx` / `src/views/GoldSavings.tsx` — 30
14. `src/views/AdminBroadcast.tsx` — 29
   (`MobileBottomNav.tsx`, `Wallets.tsx`, `Onboarding.tsx` sudah selesai
   diaudit, dulu di posisi atas juga)

Untuk lihat sisa file & angka terbaru, jalankan dari root repo:

```bash
grep -rlo "light_sakura:" src/components src/views | \
  xargs -I{} sh -c 'echo "$(grep -c "light_sakura:" "{}") {}"' | sort -rn
```

## Cara migrasi 1 file (langkah manual per file)

1. Buka file, `grep -n "light_sakura:" <file>` untuk lihat semua titik.
2. Untuk tiap baris, cek dulu apakah kombinasi class-nya PERSIS sama dengan
   salah satu token di `src/lib/theme/tokens.ts`. Kalau ya → ganti ke
   `tokens.<kategori>.<nama>`.
3. Kalau MIRIP tapi tidak persis (beda opacity, beda shade satu tingkat) →
   **jangan dipaksa pakai token yang ada** (itu akan diam-diam mengubah
   tampilan). Tetap literal, atau kalau polanya muncul >2x di file lain juga,
   tambahkan token baru dulu di `tokens.ts` baru dipakai.
4. Tambahkan `const { tokens, cx } = useThemeTokens();` di awal komponen
   (butuh import `useThemeTokens` dari `../hooks/useThemeTokens`).
5. Ganti template string manual (`` `a b ${x} c` ``) dengan `cx(...)` kalau
   sudah ada beberapa token campur literal, supaya tetap rapi.
6. **Wajib**: bandingkan screenshot sebelum/sesudah di kedua tema
   (dark_obsidian & light_sakura) sebelum lanjut ke file berikutnya —
   refactor ini murni tentang lokasi definisi warna, BUKAN tentang ganti
   warna. Kalau ada yang keliatan beda, itu tandanya token yang dipakai
   tidak benar-benar exact match (lihat poin 3).

## Kapan menambah token baru

Tambahkan ke `tokens.ts` HANYA kalau kombinasi tsb muncul di ≥2 file
berbeda. Kombinasi yang cuma dipakai 1 kali di 1 komponen spesifik lebih
baik tetap literal di tempatnya — memaksakannya jadi token generik cuma
menambah lapisan tak berguna dan bikin token map makin gemuk tanpa manfaat
reuse yang nyata.

## Tidak termasuk cakupan refactor ini

`ui/Button.tsx`, `ui/Input.tsx`, `ui/Badge.tsx` SENGAJA tidak diutak-atik.
Ketiganya sudah jadi single source of truth untuk komponennya sendiri
(warna varian button/badge sudah tersentralisasi di 1 file per komponen),
jadi tidak masuk kategori "2000+ duplikasi tersebar" yang jadi masalah
awal. Kalau suatu saat warna varian di file-file itu mau diselaraskan
dengan token semantik (mis. `Button`'s `secondary` variant border memakai
`tokens.border.strong`), itu refactor terpisah dengan risiko yang berbeda
(bisa mengubah tampilan SEMUA tombol sekaligus) — sebaiknya dikerjakan di
sesi sendiri, bukan digabung ke rollout token ini.
