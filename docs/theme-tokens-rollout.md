# Rollout useThemeTokens() — Panduan Lanjutan

Status per 2026-07-16 (sesi 13): hook + token dasar sudah dibuat. File yang
sudah selesai/diaudit penuh: `src/components/ui/Card.tsx`,
`src/components/DashboardWalletCards.tsx`, `src/components/MobileBottomNav.tsx`,
`src/views/Wallets.tsx`, `src/views/Onboarding.tsx`, `src/views/Settings.tsx`,
`src/views/Login.tsx`, `src/components/SkeletonLoader.tsx` (diaudit, 0
migrasi -- lihat catatan sesi 11 di bawah, bukan berarti belum dikerjakan).
File yang SUDAH dipasangi hook + sebagian token tapi BELUM full-audit
cross-file (30 file): `src/views/AdminPanel.tsx`,
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
`src/views/Budget.tsx`, `src/components/AdminUserDetailModal.tsx`,
`src/components/DashboardChart.tsx`, `src/components/DashboardOverviewCard.tsx`,
`src/components/BudgetProgressCard.tsx`, `src/components/ConfirmTransactionModal.tsx`,
`src/components/DashboardRecentTransactions.tsx`, `src/components/UpdatePrompt.tsx`,
`src/components/ResetPasswordModal.tsx`.
Sisanya belum disentuh.

**Dead code / TIDAK dimigrasi (bukan bagian rollout):**
- `src/components/DashboardAccumulatedBalance.tsx` -- ditemukan di sesi 11
  TIDAK diimpor di mana pun (`grep -rln "DashboardAccumulatedBalance" src`
  cuma nemu dirinya sendiri + 2 komentar di `DashboardOverviewCard.tsx` &
  `InfoTooltip.tsx` yang menyebutnya sebagai "komponen lama"). Digantikan
  oleh `DashboardOverviewCard.tsx`.
- `src/components/HistoryTable.tsx` -- ditemukan di sesi 12, TIDAK diimpor
  di mana pun (`grep -rn "HistoryTable" src` cuma nemu dirinya sendiri +
  1 komentar di `ScrollableTableWrapper.tsx`). Sempat masuk daftar
  prioritas (17 `light_sakura:`) tapi dilewati setelah verifikasi impor.
- `src/components/DashboardStats.tsx` -- ditemukan di sesi 12, TIDAK
  diimpor (cuma disebut di komentar `DashboardAccumulatedBalance.tsx`,
  `DashboardOverviewCard.tsx`, `InfoTooltip.tsx` sebagai "komponen lama"
  yang sudah digantikan `DashboardOverviewCard.tsx`, pola sama seperti
  `DashboardAccumulatedBalance.tsx`).
- `src/components/WalletPickerField.tsx` -- ditemukan di sesi 12, TIDAK
  diimpor (cuma disebut di komentar `useDropdownPosition.ts`).

**Jangan migrasi token di file-file di atas** -- kalau mau dihapus, itu di
luar scope rollout token, perlu konfirmasi dulu ke user karena keputusan
penghapusan kode berbeda dari keputusan styling. Sebelum membuka file baru
manapun untuk migrasi, WAJIB cek dulu apakah file itu benar-benar diimpor
(`grep -rln "import.*<NamaKomponen>" src`) supaya tidak buang waktu migrasi
token di dead code lagi.

## Sesi 13: 1 file dimigrasi (16 → 6, 1 → total 34 file tersentuh)

| File | Sebelum | Sesudah | Catatan |
|---|---|---|---|
| `src/components/ResetPasswordModal.tsx` | 16 | 6 | hook dipasang |

Tidak ada token baru ditambahkan. Token yang dipakai: `surface.card`,
`border.accent` (3x -- 1x di kartu modal utama, 2x identik di
`className` override `<Input>` untuk field password & confirm password),
`text.muted`, `icon.accent`, `text.primary`, `text.mutedAlt` (3x --
deskripsi + 2 label field, className identik jadi diedit satu-satu pakai
konteks baris tetangga yang beda (`t("auth.new_password_label")` vs
`t("auth.confirm_password_label")`) supaya `str_replace` tetap unik).

**Pola baru dicatat:** `className` override yang dilempar ke komponen
`<Input>` (`bg-slate-950 border-slate-800 py-3 light_sakura:bg-slate-50
light_sakura:border-rose-100`) -- BAGIAN BORDER exact match `border.accent`
tapi bagian BACKGROUND (`bg-slate-950 light_sakura:bg-slate-50`) TIDAK
match token manapun (`surface.subtle` beda di sisi dark: `bg-slate-800`
bukan `bg-slate-950`) -- jadi cuma border yang ditoken-kan, bg tetap
literal. Sama seperti prinsip sesi 11 soal tidak memaksa kombinasi
sebagian; di sini kombinasi PECAH per kategori token (border vs surface),
bukan cuma soal opacity.

**Baris yang TIDAK dimigrasi:** tombol show/hide password
(`text-slate-400 hover:text-slate-200`, tanpa `light_sakura:` sama sekali
jadi bukan bagian hitungan) dan `shadow-rose-150/10` di kartu modal (tidak
ada token shadow).

`tsc --noEmit` penuh dijalankan (node_modules diinstall ulang karena
dihapus di akhir sesi 12 sebelum zip) -- 0 hasil untuk `Cannot find name
'tokens'/'cx'` di seluruh project, 0 error baru terkait
`ResetPasswordModal.tsx`.

Query prioritas berikutnya (sudah memfilter dead code & file di luar
scope) menghasilkan `src/components/HistoryEditModal.tsx` (16, sudah
diverifikasi diimpor di `src/views/History.tsx`, bukan dead code) sebagai
kandidat sesi 14.

## Sesi 12: 1 file dimigrasi (17 → 11, 1 → total 33 file tersentuh) + 3 dead code baru ditemukan

| File | Sebelum | Sesudah | Catatan |
|---|---|---|---|
| `src/components/UpdatePrompt.tsx` | 17 | 11 | hook dipasang |

Tidak ada token baru ditambahkan. Token yang dipakai: `surface.card`,
`text.onSurface`, `icon.accent`, `text.muted`, `text.label` (2x, salah
satunya diekstrak dari tengah string className panjang yang juga punya
class `bg-*`/`hover:*`/`disabled:*` -- polanya sama seperti kasus
`icon.accent` di `DashboardRecentTransactions.tsx` sesi 11: token
diselipkan lewat `cx()` di antara class literal, class lain tidak
dihapus).

**Baris yang TIDAK dimigrasi (mirip tapi tidak persis, tetap literal):**
- Baris tombol X close (`text-slate-500 hover:text-slate-300 ...
  light_sakura:hover:text-slate-700 light_sakura:hover:bg-black/5`) --
  pola hover-only, tidak ada token yang cocok.
- Ikon bg (`bg-indigo-500/15 light_sakura:bg-rose-500/10`) -- sesuai
  aturan sesi 11, background berwarna dengan opacity bukan bagian dari
  token `icon.accent`, tetap ditulis literal terpisah dari token teksnya.
- Label "Yang Baru" (`text-indigo-300 light_sakura:text-rose-500`) --
  MIRIP `text.accent` (`text-indigo-400 light_sakura:text-rose-500`) tapi
  beda shade dark (300 vs 400), tidak dipaksa.
- Bullet list (`text-indigo-400 light_sakura:text-rose-400`) -- MIRIP
  `text.accent` tapi beda shade light (rose-400 vs rose-500), tidak
  dipaksa.
- Tombol "Perbarui" (`bg-indigo-600 hover:bg-indigo-500 ...
  light_sakura:bg-rose-500 light_sakura:hover:bg-rose-400`) -- bagian
  `light_sakura:` persis sama dengan `button.accentEmerald`, TAPI sisi
  dark-nya beda warna (indigo vs emerald token), jadi bukan exact match,
  tetap literal.

**3 dead code baru ditemukan** (lihat detail di bagian atas dokumen):
`HistoryTable.tsx`, `DashboardStats.tsx`, `WalletPickerField.tsx` -- semua
lolos filter angka `light_sakura:` tinggi di query prioritas tapi gagal di
langkah verifikasi impor (poin 2 prosedur sesi 11). Query prioritas
sesudah memfilter dead code ini menghasilkan `ResetPasswordModal.tsx` (16)
sebagai kandidat berikutnya untuk sesi 13.

`npm install` dijalankan di awal sesi (node_modules belum ada).
`tsc --noEmit` penuh dijalankan di akhir sesi -- 0 hasil untuk `Cannot
find name 'tokens'/'cx'` di seluruh project. 1 error pre-existing tetap
ada di `UpdatePrompt.tsx` baris 57 (`Property 'catch' does not exist on
type 'PromiseLike<void>'`) -- sudah dikonfirmasi di catatan sesi 11
sebagai pre-existing, tidak berkaitan dengan migrasi token.

## Sesi 11: 2 file dimigrasi + 1 file diaudit-tapi-tidak-dimigrasi (2 → total 32 file tersentuh)

| File | Sebelum | Sesudah | Catatan |
|---|---|---|---|
| `src/components/ConfirmTransactionModal.tsx` | 19 | 12 | hook dipasang |
| `src/components/DashboardRecentTransactions.tsx` | 18 | 6 | hook dipasang |
| `src/components/SkeletonLoader.tsx` | 19 | 19 | **diaudit, TIDAK ada exact match** -- lihat di bawah |

Tidak ada token baru. Semua penggantian pakai token existing (`text.muted`,
`text.onSurface`, `text.accent`, `icon.accent`, `text.label`, `text.danger`,
`text.success`, `text.faint`).

**`SkeletonLoader.tsx` -- kasus baru: file diaudit lengkap tapi 0 migrasi,
hook TIDAK dipasang.** Semua 8 komponen skeleton di file ini
(`DashboardSkeleton`, `HistorySkeleton`, `TransactionSkeleton`,
`BudgetSkeleton`, `SettingsSkeleton`, `BillRemindersSkeleton`,
`AdminSkeleton`, `DefaultSkeleton`) memakai 1 pola berulang: `bg-slate-900/50
border border-slate-800/50 ... light_sakura:bg-rose-50/50
light_sakura:border-rose-100/50` (8x identik) plus varian shimmer
`bg-slate-800/60 light_sakura:bg-rose-200/60` (1x, di const module-level
`shimmer`). **SEMUA class di file ini pakai suffix opacity (`/50`, `/60`,
`/30`) yang TIDAK ada di token manapun di `tokens.ts`** (token yang ada
semua tanpa opacity suffix, mis. `border.default` = `border-slate-800
light_sakura:border-slate-100`, BUKAN `border-slate-800/50
light_sakura:border-rose-100/50`) -- jadi TIDAK ADA satupun exact match di
file ini. Dicek juga cross-file (`grep -rl "bg-slate-900/50 border
border-slate-800/50" src/views src/components`) -- nihil, tidak ada file
lain yang pakai kombinasi ini, jadi juga tidak memenuhi syarat token baru
("≥2 file berbeda"). **Keputusan: TIDAK pasang `useThemeTokens()` hook di
file ini** (beda dari file-file lain yang selalu dipasangi hook meski
migrasi parsial) karena kalau hook dipasang tapi tidak ada satupun token
yang dipakai, itu cuma nambah import + variabel `tokens`/`cx` yang tidak
terpakai (dead code / bisa kena warning `noUnusedLocals` tergantung
tsconfig). **Kalau nanti tokens.ts menambahkan varian ber-opacity untuk
surface/border, baru revisit file ini.**

**Pola yang ditemukan di 2 file yang dimigrasi (dicatat untuk audit
lanjutan):**
- `ConfirmTransactionModal.tsx` baris 157 & 201 (`<input>` nominal &
  tanggal): classnya HAMPIR identik dengan `tokens.form.input`, BEDA CUMA
  di `py-2.5` (di sini) vs `py-2` (di token) -- **TIDAK dipaksa pakai
  token** sesuai aturan "mirip tapi tidak persis", tetap literal. Kalau
  pola `py-2.5` versi ini muncul lagi identik di file lain (NewTransaction,
  Savings, dll saat nanti diaudit penuh), baru pertimbangkan tambah varian
  token baru (mis. `form.inputLg`) -- jangan asumsikan dari 1 file ini saja.
- `DashboardRecentTransactions.tsx` baris 44: kombinasi `bg-indigo-500/15
  ... light_sakura:bg-rose-50` (bg saja) dipasangkan dengan
  `tokens.icon.accent` (yang cuma text-color) lewat `cx()` -- **PENTING:
  token `icon.accent`/`text.accent` HANYA mencakup warna teks/ikon, bukan
  background** -- background di sekitarnya (`bg-indigo-500/15`,
  `light_sakura:bg-rose-50`, dst) tetap harus ditulis literal terpisah,
  JANGAN dihapus saat menyisipkan token warna teks. (Nyaris kepotong tidak
  sengaja saat pengeditan sesi ini, ketahuan & diperbaiki sebelum lanjut --
  **pelajaran: selalu baca ulang hasil replace sebelum lanjut ke baris
  berikutnya, khususnya saat 1 baris className punya bg DAN text token yang
  overlap secara visual tapi beda konsep token-nya**.)

Prosedur wajib (poin 1-8 di sesi 10) tetap dipakai. Sebelum membuka file
baru, sesi ini menambahkan 1 langkah verifikasi: cek dulu file benar-benar
dipakai (`grep -rln "import.*<Nama>" src`) -- ditemukan
`DashboardAccumulatedBalance.tsx` (yang tadinya masuk daftar prioritas
karena angka `light_sakura:`-nya tinggi) ternyata dead code, jadi DIGANTI
dengan `DashboardRecentTransactions.tsx` sebagai file ke-3 sesi ini.
`tsc --noEmit` penuh dijalankan di akhir sesi -- 0 error baru di kedua file
yang dimigrasi (error pre-existing di `ErrorBoundary.tsx`/`SplashScreen.tsx`/
`UpdatePrompt.tsx` masih ada, tidak berkaitan dengan sesi ini).

## Sesi 10: 3 file prioritas teratas (30 → total 30 file sudah tersentuh)

| File | Sebelum | Sesudah |
|---|---|---|
| `src/components/DashboardChart.tsx` | 29 | 14 |
| `src/components/DashboardOverviewCard.tsx` | 28 | 20 |
| `src/components/BudgetProgressCard.tsx` | 24 | 15 |

Tidak ada token baru ditambahkan sesi ini -- semua penggantian pakai token
yang sudah ada di `tokens.ts`. Hook `useThemeTokens()` dipasang di semua 3
komponen utama (tidak ada sub-komponen implicit-return terpisah di
ketiganya -- `CustomTooltip` di `DashboardChart.tsx` didefinisikan sebagai
`const` DI DALAM komponen utama, jadi otomatis punya akses ke `tokens`/`cx`
lewat closure, tidak perlu hook sendiri -- dicek dengan
`grep -n "^const.*React.FC"` di ke-3 file, hasilnya cuma 1 komponen utama
per file).

**Teknik baru yang dipakai sesi ini -- ekstraksi token di dalam template
literal/ternary className:** `DashboardChart.tsx` punya 4 tombol filter
(`chartType`/`chartMode`) yang classNamenya ditulis
`` className={`...${cond ? "A" : "B"}`} `` (template literal berisi
ternary). Token TIDAK bisa langsung disisipkan ke dalam string literal di
situ, jadi strukturnya diubah jadi `className={cx("...static...", cond ?
cx(...) : cx(...))}` -- hasil akhir daftar class SAMA persis (cuma urutan
class berubah, yang tidak masalah untuk Tailwind karena tidak ada konflik
specificity antar class yang dipertukar urutannya). Cabang aktif yang
warnanya TIDAK exact match token (mis. `text-indigo-300` tanpa padanan)
tetap dibiarkan literal apa adanya, hanya cabang yang match yang diekstrak.

**Bug ditemukan & diperbaiki (1 kejadian, TS type-narrowing dari
`as const`):** Di `DashboardChart.tsx`, `let colorCls = tokens.text.accentStrong;`
menyebabkan TypeScript meng-infer tipe `colorCls` sebagai literal type
persis dari `tokens.text.accentStrong` (karena `themeTokens` dideklarasikan
`as const` di `tokens.ts`), sehingga assignment berikutnya ke token lain
(`tokens.text.success`, atau string literal danger) di baris-baris `if`
setelahnya gagal type-check (`TS2322`). **Ketahuan lewat `tsc --noEmit`
penuh (bukan cuma filter "Cannot find name"), jadi kalau assignment
token ke variabel `let` yang di-reassign kondisional, WAJIB anotasi
eksplisit `let x: string = tokens...` supaya tidak ke-infer sebagai
literal type.** Diperbaiki, dikonfirmasi 0 error tsc untuk ke-3 file
sesudahnya.

**Sisa yang SENGAJA dibiarkan literal di ke-3 file** (pola yang sama
seperti temuan sesi-sesi sebelumnya):
- Class dengan suffix opacity (`/50`, `/40`, `/30`, `/60`, `/20`, `/80`,
  dst) yang mirip tapi tidak persis sama dengan token dasar (mis.
  `border-slate-800/50 light_sakura:border-rose-100/30` vs token
  `border.accent` yang tidak punya opacity) -- di ketiga file ini polanya
  sangat banyak (background gradient hero card, section wrapper, dsb).
- `DashboardOverviewCard.tsx`: background gradient hero card (baris ~119,
  komentar di kode SUDAH menjelaskan ini sengaja tidak pakai `<Card>`
  karena gradient custom) dan warna badge/kartu aset per-kategori
  (emerald untuk tabungan, amber untuk emas, slate netral untuk
  income/expense akumulasi) -- semantik per-kategori seperti temuan
  `AdminPanel.tsx` sesi 6, bukan kandidat token generik.
- `BudgetProgressCard.tsx`: `STATUS_CONFIG` (objek konstanta di LUAR
  komponen, module-level) punya field `badgeBg`/`badgeText` per status
  (safe/warning/danger) yang beberapa NILAINYA exact match ke token
  (`text-amber-400 light_sakura:text-amber-600` = `tokens.text.warning`,
  dst) TAPI field ini didefinisikan SEBELUM komponen (di luar scope hook)
  dan setelah dicek dengan `grep -n "badgeText\|badgeBg"` ternyata TIDAK
  dipakai di mana pun dalam file (dead code) -- diputuskan TIDAK
  dipindah/direfactor karena (1) memindah `STATUS_CONFIG` ke dalam
  komponen supaya bisa akses hook akan re-create objek tiap render tanpa
  manfaat nyata untuk field yang tidak dipakai, (2) berisiko mengubah
  behaviour di luar scope refactor token murni. Kalau field ini nanti
  benar-benar dipakai, baru pertimbangkan direfactor saat itu.
- `border-slate-800/60 bg-slate-950/20 ... light_sakura:bg-slate-50
  light_sakura:border-slate-200` (kartu income/expense akumulasi di
  `DashboardOverviewCard.tsx`, 2x) dan `text-slate-100/text-slate-200
  light_sakura:text-slate-800/700` varian (beda shade satu tingkat dari
  token `text.onSurface`/`text.secondary`) -- dicek, tidak exact match,
  tetap literal.

Prosedur wajib (poin 1-6 di sesi 9) tetap dipakai dan terbukti efektif.
`npm install` (841 package, `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` supaya
tidak download browser binary) dijalankan dulu di sesi ini karena
`node_modules` belum ada di lingkungan kerja -- **catatan untuk sesi
berikutnya: kalau `node_modules` tidak ada, install dulu sebelum bisa
jalankan `tsc`, jangan asumsikan sudah terpasang.** `tsc --noEmit` penuh
(bukan cuma grep "Cannot find name") dijalankan sekali di akhir sesi untuk
menangkap error type selain hook -- ditemukan 1 (lihat di atas). Sisa error
tsc di project (`ErrorBoundary.tsx`, `SplashScreen.tsx`, `UpdatePrompt.tsx`)
adalah pre-existing, tidak berkaitan dengan file yang disentuh sesi ini.

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

Angka di bawah = jumlah KEMUNCULAN asli, diambil ulang di akhir sesi 11.
**Sebelum mengerjakan, cek dulu file ini benar-benar dipakai** (lihat
poin dead-code di sesi 11) -- `DashboardAccumulatedBalance.tsx` dan
`HistoryTable.tsx` SUDAH DICORET dari daftar karena dead code (tidak
diimpor di manapun, cuma disebut di komentar).

1. `src/components/UpdatePrompt.tsx` — 17 (BELUM disentuh, dipakai di `App.tsx`)
2. `src/components/ResetPasswordModal.tsx` — 16 (belum disentuh, dipakai di `App.tsx`)
3. `src/components/HistoryEditModal.tsx` — 16 (belum disentuh, dipakai di `History.tsx`)
4. `src/components/DropdownField.tsx` — 15 (belum disentuh -- cek dulu dipakai luas, kemungkinan besar dipakai banyak view, migrasi di sini akan berdampak ke banyak tempat sekaligus)
5. `src/components/ReceiptUploader.tsx` — 14 (belum disentuh)
6. `src/components/Modal.tsx` — 14 (belum disentuh -- cek dulu dipakai luas seperti `DropdownField.tsx`)

~~`src/components/ui/Badge.tsx`~~ -- JANGAN disentuh, di luar cakupan
refactor ini (lihat bagian "Tidak termasuk cakupan refactor ini" di bawah).

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
`DashboardOverviewCard.tsx` (20), `ConfirmTransactionModal.tsx` (12),
`AdminSupportChat.tsx` (18), `AdminVoucherManager.tsx` (13),
`AdminCategoryManager.tsx` (13), `PremiumModal.tsx` (12),
`DashboardChart.tsx` (14), `BudgetProgressCard.tsx` (15),
`DashboardRecentTransactions.tsx` (6), `UpdatePrompt.tsx` (11),
`ResetPasswordModal.tsx` (6).

**File yang diaudit tapi TIDAK dipasangi hook (0 exact match token):**
`SkeletonLoader.tsx` (19 tersisa, semua ber-opacity, lihat sesi 11).

**Reminder wajib untuk sesi berikutnya** (prosedur dari sesi 8-10,
DITAMBAH 2 poin baru dari sesi 11):
1. `python3 scripts_migrate.py <file1> <file2> ...` -- kalau script sudah
   dihapus (selalu dihapus di akhir sesi), buat ulang dari isi word-pair
   token di bagian "Sesi 7", MENCAKUP SEMUA kategori (`text.*`,
   `surface.*`, `border.*`, `hover.*`, `icon.accent`).
2. **BARU (sesi 11): SEBELUM membuka file manapun untuk migrasi, cek dulu
   file itu benar-benar diimpor/dipakai** dengan `grep -rln "import.*
   <NamaKomponen>" src --include="*.tsx" | grep -v "src/components/
   <NamaKomponen>.tsx"` (atau path `src/views/` kalau view). Kalau hasilnya
   kosong atau cuma nemu komentar/referensi teks (bukan `import` statement
   sungguhan), file itu KEMUNGKINAN dead code -- jangan buang waktu migrasi
   token di situ, catat di bagian "Dead code" dokumen ini dan pindah ke
   file berikutnya di daftar prioritas.
3. Cek `grep -c "useThemeTokens" <file>` -- kalau 0, pasang import + hook
   call di komponen utama, KECUALI kalau setelah diaudit ternyata TIDAK
   ADA satupun kombinasi class yang exact-match ke token (lihat kasus
   `SkeletonLoader.tsx` sesi 11) -- dalam kasus itu JANGAN pasang hook
   (menghindari import/variabel tidak terpakai), cukup catat sebagai
   "diaudit, 0 migrasi" di dokumen. Kalau file punya sub-komponen terpisah
   (arrow function implicit-return `=> (...)` di luar komponen utama,
   mis. `InputField`, `InfoRow`, `StatCard`), ubah jadi block-body `=> {
   const {tokens,cx} = useThemeTokens(); return (...); }` dan pasang hook
   di situ juga -- cek dengan `grep -n "^const.*React.FC\|^function " <file>`
   SEBELUM menganggap file cuma punya 1 komponen. Kalau sub-komponen
   didefinisikan sebagai `const`/fungsi DI DALAM body komponen utama
   (bukan di luar, sejajar scope module), TIDAK perlu hook sendiri --
   otomatis dapat `tokens`/`cx` lewat closure.
4. WAJIB: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "Cannot find name
   'tokens'\|Cannot find name 'cx'"` ke SELURUH project -- harus 0 hasil.
   Kalau `node_modules` belum ada (cek dulu dengan `ls node_modules`),
   jalankan `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install` DULU.
5. Cek juga token multi-kata (`chip.accentEmerald`, `button.accentEmerald`,
   `form.input`) dengan `grep -c` pola exact-nya di file yang dikerjakan --
   TERMASUK varian yang MIRIP tapi beda 1 detail kecil (mis. `py-2.5` vs
   `py-2` di `tokens.form.input`, ditemukan di `ConfirmTransactionModal.tsx`
   sesi 11) -- jangan dipaksa cocok, tapi CATAT kalau ditemukan supaya
   sesi lain yang menemukan pola sama tahu ini sudah pernah dicek.
6. Setelah str_replace/insert manual (bukan lewat script Python) yang
   menyisipkan baris baru DI ANTARA baris-baris `const {...} = useXxx();`
   yang beruntun, WAJIB `sed -n` ulang area yang diedit untuk pastikan
   tidak ada baris tetangga yang ikut kehapus.
7. Kalau token dipasang ke variabel `let` yang di-reassign kondisional,
   WAJIB anotasi tipe eksplisit `let x: string = tokens...` (lihat sesi 10).
8. Untuk className template-literal+ternary, ekstrak lewat pola
   `cx("...statis...", cond ? cx(...) : cx(...))` (lihat sesi 10).
9. **BARU (sesi 11): token warna teks (`text.accent`, `icon.accent`, dst)
   HANYA mencakup class warna TEKS, bukan background di sekitarnya.**
   Saat menyisipkan token warna teks ke className yang JUGA punya
   background berwarna (mis. `bg-indigo-500/15 ... text-indigo-400 ...
   light_sakura:bg-rose-50 light_sakura:text-rose-500`), JANGAN ikut
   menghapus bagian `bg-*`/`light_sakura:bg-*` -- itu class terpisah yang
   harus tetap ditulis literal. Baca ulang hasil `cx(...)` sebelum lanjut
   untuk pastikan tidak ada class background yang ikut kepotong.
10. Update tabel progress di dokumen ini + jalankan ulang query prioritas
    (`for f in $(find src/views src/components -name "*.tsx"); do c=$(grep -o
    "light_sakura:" "$f" | wc -l); h=$(grep -c useThemeTokens "$f"); [ "$c"
    -gt 0 ] && [ "$h" -eq 0 ] && echo "$c $f"; done | sort -rn | head -10`
    -- versi ini SUDAH memfilter file yang sudah punya hook, supaya daftar
    "belum disentuh" tetap akurat tanpa perlu cek manual satu-satu).

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
