# Rollout useThemeTokens() — Panduan Lanjutan

Status per 2026-07-15 (sesi 9): hook + token dasar sudah dibuat. File yang
sudah selesai/diaudit penuh: `src/components/ui/Card.tsx`,
`src/components/DashboardWalletCards.tsx`, `src/components/MobileBottomNav.tsx`,
`src/views/Wallets.tsx`, `src/views/Onboarding.tsx`, `src/views/Settings.tsx`,
`src/views/Login.tsx`. File yang SUDAH dipasangi hook + sebagian token
tapi BELUM full-audit cross-file (23 file): `src/views/AdminPanel.tsx`,
`src/components/SupportChatWidget.tsx`, `src/views/AdminAiMonitor.tsx`,
`src/components/Sidebar.tsx`, `src/views/AdminCategoryManager.tsx`,
`src/views/AdminPremiumMonitor.tsx`, `src/views/AdminErrorMonitor.tsx`,
`src/views/BillReminders.tsx`, `src/views/NewTransaction.tsx`,
`src/views/AdminBackup.tsx`, `src/views/AdminBroadcast.tsx`,
`src/views/AdminVoucherManager.tsx`, `src/views/AdminMaintenance.tsx`,
`src/views/Savings.tsx`, `src/views/Installments.tsx`,
`src/views/GoldSavings.tsx`, `src/components/ReceiptPreview.tsx`,
`src/views/History.tsx`, `src/views/AdminSupportChat.tsx`,
`src/components/PremiumModal.tsx`, `src/components/VoicePreview.tsx`,
`src/views/Budget.tsx`, `src/components/AdminUserDetailModal.tsx`.
Sisanya belum disentuh.

## Sesi 9: 7 file lagi (7 → total 27 file sudah tersentuh)

| File | Sebelum | Sesudah |
|---|---|---|
| `src/components/ReceiptPreview.tsx` | 43 | 22 |
| `src/views/History.tsx` | 37 | 27 |
| `src/views/AdminSupportChat.tsx` | 36 | 18 |
| `src/components/PremiumModal.tsx` | 36 | 12 |
| `src/components/VoicePreview.tsx` | 35 | 25 |
| `src/views/Budget.tsx` | 33 | 22 |
| `src/components/AdminUserDetailModal.tsx` | 32 | 22 |

Tidak ada token baru. Sudah dicek token multi-kata (`chip.accentEmerald`,
`button.accentEmerald`, `form.input`) di ke-7 file -- nihil.

**Bug ditemukan & diperbaiki di sesi ini (2 kejadian):**
1. `AdminUserDetailModal.tsx` punya 2 sub-komponen implicit-return
   (`InfoRow`, `StatCard`) yang dipakai token migrasi otomatis tanpa hook
   sendiri -- dikonversi ke block-body + `useThemeTokens()` masing-masing,
   sama seperti pola `InputField` di `Login.tsx`/`AdminCategoryManager.tsx`
   sebelumnya. Terdeteksi SEBELUM `tsc` dijalankan (dicek manual karena
   sudah tahu polanya dari sesi 7), lalu dikonfirmasi 0 error dengan `tsc`.
2. Saat menyisipkan hook call ke `AdminUserDetailModal.tsx` pakai
   str_replace, baris `const [detail, setDetail] = useState(...)` SEMPAT
   TERHAPUS TIDAK SENGAJA (old_str/new_str yang dipakai tidak menyertakan
   baris itu secara utuh) -- ketahuan langsung lewat `sed -n` manual
   sebelum lanjut, dan diperbaiki di edit berikutnya. **Pelajaran: setelah
   str_replace yang menyisipkan hook di tengah blok `const {...}` beruntun,
   SELALU `sed -n` ulang area yang diedit untuk pastikan tidak ada baris
   yang kepotong**, jangan cuma percaya exit code sukses dari tool.

Prosedur wajib (poin 1-5 di sesi 8) tetap dipakai dan terbukti efektif --
`tsc --noEmit | grep "Cannot find name"` di seluruh project = 0 error
sebelum sesi ini ditutup.

## Sesi 7: 6 file admin/nav sekaligus (proses cepat pakai script yang sama)

Sesi ini memproses banyak file sekaligus dengan 1 script Python yang sudah
mencakup SEMUA word-pair token yang ada di `tokens.ts` (text.*, surface.*,
border.*, hover.*, icon.accent) -- bukan cuma subset seperti sesi-sesi awal.
Hasilnya (kemunculan asli, sebelum → sesudah):

| File | Sebelum | Sesudah |
|---|---|---|
| `src/components/SupportChatWidget.tsx` | 74 | 61 |
| `src/views/AdminAiMonitor.tsx` | 72 | 31 |
| `src/components/Sidebar.tsx` | 51 | 40 |
| `src/views/AdminCategoryManager.tsx` | 67 | 13 |
| `src/views/AdminPremiumMonitor.tsx` | 63 | 30 |
| `src/views/AdminErrorMonitor.tsx` | 61 | 30 |

Tidak ada token BARU ditambahkan sesi ini -- semua penggantian pakai token
yang sudah ada di `tokens.ts`. Hook `useThemeTokens()` dipasang di semua 6
komponen utama.

**Catatan penting -- sub-komponen di `AdminCategoryManager.tsx`:** file ini
punya `InputField` sebagai const terpisah SETELAH komponen utama (mirip
`InputField` di `Login.tsx`) -- sempat ketinggalan dipasangi hook sendiri,
ketahuan lewat `tsc --noEmit` (`Cannot find name 'tokens'/'cx'`), sudah
diperbaiki. **Pelajaran untuk sesi berikutnya: SETELAH menjalankan script
migrasi + pasang hook di komponen utama, WAJIB jalankan
`npx tsc --noEmit -p tsconfig.json 2>&1 | grep "Cannot find name 'tokens'\|Cannot find name 'cx'"`
untuk menangkap sub-komponen yang kelewatan** -- jangan cuma cek brace
balance, karena itu tidak mendeteksi hook yang lupa dipasang di
sub-komponen terpisah.

**6 file di atas BELUM full-audit cross-file** (belum dicek satu-satu
seperti Onboarding.tsx) -- sisa kemunculannya kemungkinan besar didominasi
warna badge/status yang MEMANG berbeda secara semantik (pola yang sama
seperti temuan di `AdminPanel.tsx` sesi 6), tapi belum diverifikasi
menyeluruh.

## ⚠️ Koreksi metodologi penting (ditemukan di sesi 6)

Sesi 6 mulai dengan `grep -c "light_sakura:"` seperti biasa, TAPI `grep -c`
menghitung **BARIS yang match**, bukan **jumlah kemunculan** -- kalau 1
baris punya 2+ `light_sakura:` (sering terjadi di baris className panjang),
itu tetap dihitung 1. Jadi semua angka "150→86", "78→59", dst di sesi-sesi
sebelumnya adalah **hitungan baris**, bukan hitungan kemunculan sebenarnya.
Ini TIDAK mengubah validitas kerja yang sudah dilakukan (token yang dipasang
tetap benar), cuma berarti progress "tersisa X" itu selalu under-count
dibanding kemunculan asli. Kalau mau angka kemunculan sebenarnya, pakai
`grep -o "light_sakura:" file | wc -l` bukan `grep -c`.

**Temuan kedua yang lebih penting**: token `surface.card`
(`bg-slate-900 light_sakura:bg-white`) dan `border.default`
(`border-slate-800 light_sakura:border-slate-100`) SUDAH ADA di tokens.ts
sejak awal tapi BELUM pernah dicek di `Onboarding.tsx`, `Settings.tsx`,
`Login.tsx` di sesi-sesi sebelumnya -- sesi 6 baru sadar dan langsung
menjalankan ulang pencocokan token ini ke ke-4 file yang sudah disentuh
sejauh ini. Hasilnya: `Onboarding.tsx` (+11 blok tambahan),
`Settings.tsx` (+6), `Login.tsx` (+1), `AdminPanel.tsx` (+5 saat dikerjakan
pertama kali). **Kalau lanjut ke file baru, WAJIB cek juga pasangan
`surface.card`/`border.default`/`surface.subtle`/`border.strong`/
`border.accent`/`surface.sunken`/`hover.surface`/`hover.sunken`** -- bukan
cuma token `text.*` yang selama ini jadi fokus utama.

## Sesi 6: AdminPanel.tsx (953 baris, tabel admin user + role badge)

Dipakai token yang sudah ada: `tokens.text.primary`, `tokens.icon.accent`,
`tokens.text.muted`, `tokens.text.mutedAlt`, `tokens.text.secondary`,
`tokens.text.onSurface`, `tokens.surface.card`, `tokens.border.default`.
Hook `useThemeTokens()` sudah dipasang (semua penggunaan token ada di dalam
komponen utama `AdminPanel`, tidak ada sub-komponen terpisah seperti
`InputField` di `Login.tsx`).

**Sisa BELUM diaudit tuntas cross-file** -- mayoritas adalah warna badge
status per-role (owner/admin/user) dan per-status (banned/premium/free)
yang MEMANG beda warna secara semantik (bukan kandidat token generik):
merah untuk banned/owner, indigo untuk admin, emerald untuk premium/active,
amber untuk warning/pending. Jangan disatukan jadi 1 token walau
strukturnya mirip -- warnanya sengaja berbeda per makna status.

## Sesi 5: Login.tsx (854 baris, banyak elemen dekoratif custom)

Turun dari 67 → 47. Semua penggantian pakai token GLOBAL yang sudah ada
(tidak ada token baru sesi ini): `tokens.text.primary`, `tokens.text.onSurface`,
`tokens.text.muted`, `tokens.text.faint` (baru dipakai pertama kali di sini),
`tokens.icon.accent`. Teknik yang dipakai BEDA dari sesi-sesi sebelumnya:
karena banyak `className="..."` di file ini ditulis MULTI-BARIS (bukan 1
baris) dan token-pair-nya sering TIDAK bersebelahan langsung (ada class lain
di antaranya, mis. `text-white mb-1 light_sakura:text-slate-900`), dipakai
pencocokan PER-KATA (bukan cocok-substring-persis-berurutan) -- selama kedua
kata dari 1 token pair (mis. `text-white` DAN `light_sakura:text-slate-900`)
sama-sama ada sebagai kelas TERPISAH (whitespace-delimited) di className yang
sama, keduanya dikeluarkan dan token dipasang lewat `cx()`. Class lain di
antaranya (mis. `mb-1`) tetap dipertahankan literal.

**Struktur komponen di file ini beda dari file lain**: `InputField` adalah
komponen terpisah (arrow function) yang tadinya `=> ( ... )` (implicit
return) -- DIUBAH jadi `=> { const {tokens,cx} = useThemeTokens(); return
( ... ); }` supaya hook bisa dipanggil di situ (komponen `Login` utama
punya hook-nya sendiri, terpisah). Kalau nanti menyentuh file lain yang
punya sub-komponen serupa (arrow function implicit-return di luar komponen
utama), pola konversi yang sama berlaku.

**Elemen dekoratif TIDAK disentuh sama sekali** (dan sebaiknya jangan
dipaksakan jadi token): SVG background rings/lines dengan warna rgba unik
(`BrandPanelArcs`), glow halo & drop-shadow custom (`BrandLogoMark`),
`StatChip` dengan warna rose/white/60 satu-off. Semua ini pakai
`className={\`...\`}` (template literal, ada `${variable}` di tengah) atau
kombinasi rgba yang unik per elemen -- BUKAN kandidat token, murni styling
dekoratif satu tempat.

**47 sisa BELUM full-audit** (belum semua dicek cross-file satu per satu
seperti Onboarding.tsx) -- kalau lanjutkan file ini, cek dulu pola-pola
berikut yang berulang 2x di file ini sendiri (BELUM dicek ke file lain):
`bg-white text-indigo-700 ... light_sakura:text-rose-600` (tombol toggle,
2x, baris ~383 & ~396) dan `light_sakura:from-rose-400 light_sakura:via-rose-300
light_sakura:to-rose-400` (gradient teks, 2x).

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

Angka di bawah = jumlah KEMUNCULAN asli, diambil ulang di akhir sesi 9:

1. `src/components/DashboardChart.tsx` — 29 (BELUM disentuh sama sekali)
2. `src/components/DashboardOverviewCard.tsx` — 28 (belum disentuh)
3. `src/components/BudgetProgressCard.tsx` — 24 (belum disentuh)

File yang sudah dipasangi hook + token parsial (BELUM full-audit, boleh
dilanjutkan kalau mau daripada buka file baru, urut dari kemunculan
terbanyak): `AdminPanel.tsx` (78), `Login.tsx` (66), `SupportChatWidget.tsx`
(61), `MobileBottomNav.tsx` (44 -- lihat catatan lama, kemungkinan besar
sudah full-audited, bukan belum dikerjakan), `NewTransaction.tsx` (43),
`BillReminders.tsx` (43), `Sidebar.tsx` (40), `Installments.tsx` (35),
`GoldSavings.tsx` (33), `AdminAiMonitor.tsx` (31), `Savings.tsx` (30),
`AdminPremiumMonitor.tsx` (30), `AdminErrorMonitor.tsx` (30),
`History.tsx` (27), `AdminBackup.tsx` (26), `AdminBroadcast.tsx` (25),
`VoicePreview.tsx` (25), `Budget.tsx` (22), `ReceiptPreview.tsx` (22),
`AdminUserDetailModal.tsx` (22), `AdminMaintenance.tsx` (21),
`AdminSupportChat.tsx` (18), `AdminVoucherManager.tsx` (13),
`AdminCategoryManager.tsx` (13), `PremiumModal.tsx` (12).

**Reminder wajib untuk sesi berikutnya** (prosedur 5 langkah dari sesi 8,
DITAMBAH 1 poin baru dari temuan sesi 9):
1. `python3 scripts_migrate.py <file1> <file2> ...` -- kalau script sudah
   dihapus (selalu dihapus di akhir sesi), buat ulang dari isi word-pair
   token di bagian "Sesi 7", MENCAKUP SEMUA kategori (`text.*`,
   `surface.*`, `border.*`, `hover.*`, `icon.accent`).
2. Cek `grep -c "useThemeTokens" <file>` -- kalau 0, pasang import + hook
   call di komponen utama. Kalau file punya sub-komponen terpisah (arrow
   function implicit-return `=> (...)` di luar komponen utama, mis.
   `InputField`, `InfoRow`, `StatCard`), ubah jadi block-body `=> { const
   {tokens,cx} = useThemeTokens(); return (...); }` dan pasang hook di
   situ juga -- cek dengan `grep -n "^const.*React.FC" <file>` SEBELUM
   menganggap file cuma punya 1 komponen.
3. WAJIB: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "Cannot find name
   'tokens'\|Cannot find name 'cx'"` ke SELURUH project -- harus 0 hasil.
4. Cek juga token multi-kata (`chip.accentEmerald`, `button.accentEmerald`,
   `form.input`) dengan `grep -c` pola exact-nya di file yang dikerjakan.
5. **BARU (sesi 9):** setelah str_replace/insert manual (bukan lewat
   script Python) yang menyisipkan baris baru DI ANTARA baris-baris
   `const {...} = useXxx();` yang beruntun, WAJIB `sed -n` ulang area yang
   diedit untuk pastikan tidak ada baris tetangga yang ikut kehapus --
   jangan cuma percaya pesan sukses dari tool str_replace.
6. Update tabel progress di dokumen ini + jalankan ulang query prioritas
   (`for f in $(find src/views src/components -name "*.tsx"); do c=$(grep -o
   "light_sakura:" "$f" | wc -l); [ "$c" -gt 0 ] && echo "$c $f"; done |
   sort -rn | head -25`) supaya daftar di atas tetap akurat.

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
