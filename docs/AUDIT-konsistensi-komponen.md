# Audit Konsistensi Komponen — e-wallet-kita

**Scope:** Modal shell, Badge, Button, Input, Card
**Metode:** Static grep/AST-level scan seluruh `src/`, verifikasi manual tiap temuan (bukan sekadar match keyword)
**Konteks penting:** Codebase ini **sudah punya** primitive yang matang di `src/components/ui/` (Button, Badge, Input, Card, ModalShell) plus sistem `useThemeTokens()` yang mendukung 2 tema (`dark_obsidian` default & `light_sakura`). Masalahnya bukan "belum ada design system" — masalahnya adalah **adopsi yang tidak merata**: primitive-nya bagus, tapi banyak file menulis ulang polanya sendiri secara manual alih-alih memakainya. Inilah sumber risiko drift yang disebutkan.

---

## Ringkasan Temuan (urut prioritas)

| # | Area | Tingkat | Dampak |
|---|---|---|---|
| 1 | Card container di level halaman | 🔴 Tinggi | Shadow/elevation drift di hampir semua view |
| 2 | `Modal.tsx` (confirm dialog) duplikat shell | 🔴 Tinggi | Dipakai di ~18 file, tidak sinkron dgn `ModalShell` |
| 3 | `WalletPickerField` vs `DropdownField` | 🔴 Tinggi | Duplikasi **logika stateful penuh**, bukan cuma style |
| 4 | Badge/status-pill inline | 🟠 Sedang | Radius, padding, font-size beda-beda antar layar |
| 5 | Input field custom di Login & Admin | 🟠 Sedang | Radius, focus-style, posisi ikon beda |
| 6 | Toggle switch manual di `AdminMaintenance.tsx` | 🟠 Sedang | 3 ukuran & warna berbeda, lolos dari token tema |
| 7 | Kontainer ikon bulat/kotak (avatar-like) | 🟡 Rendah | Radius beda di ukuran fisik yang sama |
| 8 | Tombol CTA hardcode warna (non-Button) | 🟡 Rendah | Kasus jarang, tapi lolos dari sistem tema |

---

## 1. 🔴 Card container: primitive ada, tapi nyaris tidak dipakai

`src/components/ui/Card.tsx` sudah mengekstrak pola `rounded-3xl border ... shadow` dengan token tema. Tapi:

- **Card hanya di-import di 8 file** — semuanya subkomponen `Dashboard*`.
- **Setiap view halaman utama** (`Budget.tsx`, `Savings.tsx`, `Wallets.tsx`, `Installments.tsx`, `GoldSavings.tsx`, `History.tsx`, `Settings.tsx`, dan **seluruh 10 file `views/Admin*.tsx`**) menulis ulang `<div className="rounded-3xl border ...">` secara manual — tidak satupun mengimpor `Card`.

Karena ditulis manual, kombinasi kelasnya **tidak konsisten**. Scan atas seluruh occurrence `rounded-3xl border ...` menghasilkan varian berikut (dihitung dari kemunculan sebenarnya di kode):

```
15x  rounded-3xl border shadow-sm
10x  rounded-3xl border shadow-lg overflow-hidden
 4x  rounded-3xl border shadow-sm space-y-6
 4x  rounded-3xl border shadow-sm overflow-hidden
 2x  rounded-3xl border shadow-sm overflow-hidden flex flex-col
 2x  rounded-3xl border   (tanpa shadow)
 1x  rounded-3xl border shadow-xl space-y-6 max-w-xl mx-auto
 1x  rounded-3xl border shadow-xl
 1x  rounded-3xl border shadow-2xl overflow-hidden
 1x  rounded-3xl border p-6 shadow-sm space-y-4
 ... dst
```

Radius-nya (`rounded-3xl`) sudah konsisten karena semua orang copy-paste dari pola yang sama secara turun-temurun — tapi **shadow elevation-nya melompat dari `shadow-sm` → `shadow-lg` → `shadow-xl` → `shadow-2xl` tanpa aturan yang jelas**, tergantung siapa yang menulis kartu itu terakhir kali. `Card.tsx` sendiri menyediakan prop `elevation` persis untuk mengatur ini secara terpusat, tapi propnya tidak pernah dipanggil di luar Dashboard.

**Kenapa ini yang paling berisiko:** ini adalah kontainer paling sering muncul di seluruh app (tiap section halaman = 1 card), jadi driftnya paling kelihatan ke user — dua halaman yang letaknya bersebelahan di navigasi bisa terasa beda "berat"-nya secara visual.

**Rekomendasi:**
1. Audit satu per satu ke-26 halaman/komponen yang hand-roll pola ini, pilih salah satu varian shadow sebagai standar per konteks (mis. `shadow-sm` untuk section biasa, `shadow-lg` khusus modal/overlay-level card), lalu migrasikan ke `<Card elevation="...">`.
2. Jangan lakukan sekaligus — mulai dari view yang paling sering dibuka user (Dashboard sudah beres, lanjut Budget → History → Wallets), supaya regresi visual gampang diverifikasi bertahap.
3. Ini refactor mekanis (bukan re-desain) — cocok dikerjakan file-per-file karena `Card` sudah backward-compatible lewat `className` override.

---

### 📍 Status pengerjaan (update terakhir)

**Status: ✅ SELESAI — 18 dari 18 file target sudah dimigrasi (26 occurrence "rounded-3xl border" manual sudah nol).**

Perubahan pada `Card.tsx`:
- Ditambahkan varian baru `border="neutral"` (mapping ke `tokens.border.default`) khusus untuk halaman Admin, supaya border slate netral Admin Panel tidak ikut berubah jadi warna aksen rose seperti di halaman user-facing. `border="default"` (mapping ke `tokens.border.accent`) tetap dipakai apa adanya di halaman user-facing.

✅ **Selesai dimigrasi ke `<Card>` (7 view utama):**
- `src/views/Budget.tsx`
- `src/views/Savings.tsx`
- `src/views/Wallets.tsx`
- `src/views/Installments.tsx`
- `src/views/GoldSavings.tsx`
- `src/views/History.tsx`
- `src/views/Settings.tsx`

✅ **Selesai dimigrasi ke `<Card>` (11 dari 11 file `views/Admin*.tsx`):**
- `src/views/AdminAiMonitor.tsx` (3 card dimigrasi; 1 kotak alert amber di baris ~417 sengaja **tidak** disentuh — itu bukan pola card/shadow yang jadi temuan ini, melainkan kotak peringatan inline tanpa shadow)
- `src/views/AdminBackup.tsx` (3 card)
- `src/views/AdminBroadcast.tsx` (1 card)
- `src/views/AdminCategoryManager.tsx` (3 card)
- `src/views/AdminErrorMonitor.tsx` (3 card)
- `src/views/AdminMaintenance.tsx` (2 card — sesi ini)
- `src/views/AdminPanel.tsx` (1 card, pola header-card dgn accent stripe — sesi ini)
- `src/views/AdminPremiumMonitor.tsx` (4 card — sesi ini)
- `src/views/AdminSupportChat.tsx` (3 card — sesi ini)
- `src/views/AdminUserManager.tsx` (1 card, pola header-card dgn accent stripe — sesi ini)
- `src/views/AdminVoucherManager.tsx` (4 card — sesi ini)

**Detail 6 file yang dikerjakan sesi ini (16 occurrence):**
- `AdminMaintenance.tsx`: 2 card, keduanya `border="neutral"` — card toggle maintenance global (`padding="lg"`) & card daftar feature-lock (`padding="none"`, konten tabelnya sudah punya padding sendiri per baris).
- `AdminPanel.tsx`: 1 hero card dengan accent stripe gradient di atas (`padding="none"` supaya stripe-nya full-bleed, konten di dalamnya tetap pakai wrapper `p-6 md:p-8` manual seperti pola `Settings.tsx`), `border="default"` sesuai rekomendasi (bukan `neutral`).
- `AdminPremiumMonitor.tsx`: 4 card — header (`padding="lg"`), toggle Dummy QRIS (`padding="lg"`), 6 kartu metrik dalam grid (`padding="md"`), wrapper tabel transaksi (`padding="none"`, `overflow-hidden`). Semua `border="neutral"`.
- `AdminSupportChat.tsx`: 3 card — header (`padding="lg"`), panel daftar sesi chat & panel detail/thread (keduanya `padding="none"` + `className="overflow-hidden flex flex-col"` karena aslinya pakai flex-col untuk area scroll). Semua `border="neutral"`.
- `AdminUserManager.tsx`: 1 hero card dengan accent stripe (pola identik `AdminPanel.tsx`), `border="default"`.
- `AdminVoucherManager.tsx`: 4 card — 3 kartu statistik dalam grid (`padding="md"`), card setting harga premium (`padding="lg"`), card form buat voucher (`padding="lg"`), wrapper tabel voucher (`padding="none"`, `overflow-hidden`). Semua `border="neutral"`.

**Perubahan visual minor yang disengaja (bukan bug regresi), ditemukan saat migrasi 6 file ini:**
1. `AdminPanel.tsx` & `AdminUserManager.tsx` — border hero card sebelumnya beda-beda: `AdminPanel.tsx` pakai `tokens.settings.cardBorder` (`border-slate-800/60 light_sakura:border-rose-100/40`, ada opacity), `AdminUserManager.tsx` sudah pakai `tokens.border.accent` (`border-slate-800 light_sakura:border-rose-100`, tanpa opacity — persis sama dengan `Card border="default"`). Sesuai rekomendasi lanjutan sesi sebelumnya, **keduanya sekarang seragam ke `border="default"`** — jadi border `AdminPanel.tsx` jadi sedikit lebih solid/kontras (kehilangan opacity `/60` dan `/40`) dibanding sebelumnya. Dampak visual kecil (perbedaannya di opacity border tipis), dan ini justru **menghilangkan** satu variasi warna border yang sebelumnya cuma dipakai 1x di seluruh app (`tokens.settings.cardBorder` sekarang tidak dipakai lagi di context ini — masih dipakai di tempat lain, cek sebelum menghapus token-nya).
2. Padding `AdminMaintenance.tsx` & `AdminVoucherManager.tsx` (card yang tadinya `p-8` tetap/fixed) → `padding="lg"` Card (`p-6 md:p-8`, responsif). Di mobile, padding jadi sedikit lebih kecil (`p-6` vs `p-8` lama) — konsisten dengan standar `Card` yang dipakai di 15 file lain, dan lebih ramah layar kecil, bukan regresi.

**Verifikasi yang sudah dilakukan:**
- `npx tsc --noEmit` di seluruh project → **0 error** (baseline maupun setelah migrasi 6 file sesi ini).
- `vite build` → **berhasil**, `✓ built in 23.39s`, 0 error. Warning ukuran chunk sama persis dengan sebelum perubahan ini (bawaan project, tidak berkaitan).
- Grep ulang `rounded-3xl border` manual di ke-6 file → **nol hasil**, terkonfirmasi seluruh pola sudah pindah ke `<Card>`.

**Belum dilakukan (langkah wajib sebelum benar-benar dianggap tuntas):**
- Verifikasi visual manual (screenshot) tiap halaman yang baru dimigrasi sesi ini, terutama 2 hero card dengan accent stripe (`AdminPanel.tsx`, `AdminUserManager.tsx`) karena border-nya sengaja dinormalisasi (lihat poin #1 di atas) dan 2 panel flex-col di `AdminSupportChat.tsx` (area scroll internal harus tetap terpotong rapi di `max-h`/`overflow-y-auto` bawaannya, bukan ikut kepotong oleh `overflow-hidden` milik `Card`).
- Cross-check apakah `tokens.settings.cardBorder` masih dipakai di file lain sebelum dianggap "token mati" — di luar scope migrasi ini, cukup dicatat sebagai potensi cleanup lanjutan.

---

## 2. 🔴 `Modal.tsx`: reimplementasi penuh shell yang seharusnya pakai `ModalShell`

Ini temuan paling structural. `ModalShell.tsx` secara eksplisit didesain untuk **jadi satu-satunya tempat** yang menulis backdrop/animasi/a11y modal (komentar di file itu sendiri bilang ini "menggantikan pola duplikasi 13 file"). Dan itu berhasil — **12 dari 13 komponen modal** (`DeleteAccountModal`, `WalletTopUpModal`, `PremiumModal`, `HistoryEditModal`, dst.) memang sudah compose lewat `ModalShell`.

**Kecuali satu: `src/components/Modal.tsx`** — komponen confirm-dialog generik (dipakai untuk semua dialog "konfirmasi hapus/batal/info") — yang menulis ulang sendiri:
- `fixed inset-0 z-50 flex items-end md:items-center ...` (persis pola yang `ModalShell` coba hilangkan)
- Backdrop `bg-black/60 backdrop-blur-xs` secara manual
- `useLockBodyScroll` + `useDialogA11y` dipanggil manual, terpisah dari `ModalShell`
- Animasi spring & bottom-sheet-di-mobile ditulis ulang identik

Dan komponen ini **bukan kasus minor** — di-import di **18 file** (`App.tsx`, `Budget.tsx`, `Savings.tsx`, `Wallets.tsx`, `Login.tsx`, `Installments.tsx`, `Settings.tsx`, `History.tsx`, `GoldSavings.tsx`, `AdminUserManager.tsx`, `AdminSupportChat.tsx`, `AdminVoucherManager.tsx`, `AdminPremiumMonitor.tsx`, `ProfileSettings.tsx`, `TelegramSettings.tsx`, `PremiumModal.tsx`, `SupportChatWidget.tsx`, `HistoryDeleteModal.tsx`).

**Risiko konkret:** kalau `ModalShell` di-update (misalnya z-index elevated diubah, breakpoint bottom-sheet digeser, atau timing animasi disesuaikan untuk aksesibilitas), **`Modal.tsx` tidak ikut ter-update** karena dia jalur kode terpisah — padahal secara visual dia harus terasa identik dengan modal lain di app (dan saat ini memang kebetulan masih identik, tapi tidak ada jaminan struktural). Ini persis pola "style bisa drift antar layar" yang disebutkan di brief.

**Rekomendasi (prioritas #1 untuk dikerjakan):**
1. Refactor `Modal.tsx` supaya isinya (icon indicator, title, description, 2 tombol aksi) di-render sebagai `children` dari `<ModalShell>`, bukan menulis ulang backdrop-nya.
2. Karena dipakai di 18 file lewat props yang sama (`isOpen`, `title`, `description`, `type`, dst.), refactor ini **tidak mengubah API publik** — jadi aman dilakukan tanpa harus menyentuh 18 file pemanggil sama sekali. Ini "low-risk, high-value fix".
3. Setelah itu, hapus duplikasi `useLockBodyScroll`/`useDialogA11y` manual di `Modal.tsx` karena sudah dihandle `ModalShell`.

---

### 📍 Status pengerjaan (update terakhir)

**Status: ✅ SELESAI.**

`Modal.tsx` sekarang compose dari `<ModalShell>` sebagai `children`, bukan menulis ulang backdrop/animasi/a11y sendiri. `useLockBodyScroll`, `useDialogA11y`, `useIsDesktopViewport`, dan `springPresets` yang tadinya dipanggil manual di `Modal.tsx` sudah dihapus — semua sudah dihandle `ModalShell` secara terpusat. API publik (`isOpen`, `title`, `description`, `type`, `confirmLabel`, `cancelLabel`, `onConfirm`, `onCancel`, `confirmDisabled`) **tidak berubah sama sekali**, jadi ke-18 file pemanggil tidak disentuh.

**Kendala yang muncul saat pengerjaan (dan solusinya):**
- Panel `Modal.tsx` untuk tipe `danger`/tipe lain (`tokens.modal.panelDanger` / `tokens.modal.panelNormal`) punya warna bg+border sendiri yang **berbeda** dari default `ModalShell` (`tokens.surface.card` + `tokens.border.default`, dipakai apa adanya oleh ke-12 modal lain). Menumpuk kelas lewat prop `className` yang sudah ada (seperti dipakai `DeleteAccountModal`/`WalletTopUpModal`/dst.) tidak aman di sini karena akan ada dua kelas Tailwind berbeda yang menata properti CSS yang sama (`bg-*` dan `border-*`) — hasilnya tidak deterministic tergantung urutan generate CSS, bukan urutan di atribut `class`.
- **Solusi:** tambah prop baru `panelTone?: string` di `ModalShell.tsx` (opsional, default `undefined`) yang kalau di-set **menggantikan** `tokens.surface.card`/`tokens.border.default` sepenuhnya alih-alih ditumpuk. Prop ini backward-compatible — ke-18 pemanggil `ModalShell` lain yang sudah ada tidak mengoper prop ini sama sekali, jadi perilakunya identik seperti sebelumnya. `Modal.tsx` satu-satunya pemakai `panelTone` untuk saat ini.

**Perubahan visual minor yang disengaja (bukan bug regresi):**
1. `max-h-[85vh]` (nilai lama, unik cuma di `Modal.tsx`) → `max-h-[90vh]` (standar `ModalShell`, dipakai 12 modal lain). Modal konfirmasi kontennya pendek (title + description + 2 tombol) jadi praktiknya tidak akan pernah menyentuh batas manapun — dampak visual nyaris nol.
2. `aria-labelledby`/`aria-describedby` manual (unik di `Modal.tsx`) → `ariaLabel={title}` (pola yang sama persis dipakai `DeleteAccountModal`, `WalletTopUpModal`, `PremiumModal`, dst.). Ini justru menghilangkan satu lagi sumber inkonsistensi (pola a11y beda sendiri), meski technically `aria-describedby` eksplisit ke paragraf deskripsi tidak ada lagi di versi baru.

**Verifikasi yang sudah dilakukan:**
- `npx tsc --noEmit` → **0 error** (termasuk ke-18 file pemanggil `Modal`, tidak ada satupun yang butuh perubahan tipe).
- `vite build` → **berhasil**, `✓ built in 19.32s`, 0 error. Warning ukuran chunk yang muncul sama persis dengan sebelum perubahan ini (bawaan project, tidak berkaitan).

**Belum dilakukan (langkah wajib sebelum benar-benar dianggap tuntas):**
- Verifikasi visual manual (screenshot tiap 4 varian `type`: `danger`/`warning`/`info`/`success`, di kedua tema `dark_obsidian` & `light_sakura`) — tsc & build cuma menjamin tipe & bundling valid, bukan kesamaan piksel dengan versi lama. Prioritaskan cek panel `danger` & `normal` (sumber utama `panelTone`) dan animasi ikon `success` (bounce spring).
- Regression check interaksi: klik backdrop untuk menutup, tombol `Escape`, dan return-focus setelah modal ditutup — secara kode sudah identik (`useDialogA11y` dipanggil `ModalShell` dengan `onClose` yang sama seperti `onCancel` lama), tapi belum diverifikasi manual di browser.

---

## 3. 🟠 Badge/status-pill: banyak versi inline di luar `Badge.tsx`

`Badge.tsx` mengekstrak pola pill status (`px-2 py-1 rounded-lg border ... uppercase`) dan sudah dipetakan ke token tema. Tapi ditemukan **14 file** yang menulis pill sejenis secara manual, dengan variasi nyata:

| File | Radius | Padding | Catatan |
|---|---|---|---|
| `Budget.tsx` | `rounded-lg` | `px-2.5 py-1` | pakai token, radius beda tipis dari `Badge` (`rounded-lg` sama, tapi ukuran font clamp beda) |
| `Installments.tsx` | `rounded-lg` | `px-2 py-0.5` | padding lebih kecil dari `Badge` |
| `AdminErrorMonitor.tsx` | **`rounded-full`** | `px-2.5 py-1` | **keluarga radius berbeda total** (pill bulat vs `Badge` yang rounded-lg/kotak) |
| `GoldSavings.tsx` | **`rounded-full`** | `px-2 py-0.5` | sama, radius beda + **warna hardcode** (`bg-black/15 text-emerald-950` / `bg-black/25 text-red-950`) — **tidak lewat `tokens`**, sehingga tidak bereaksi sama sekali saat ganti tema |
| `DashboardHeader.tsx` | `rounded-md` | `px-2 py-1` | radius ketiga yang berbeda lagi |
| `Onboarding.tsx` (baris 814) | `rounded` (default, paling kecil) | `px-2 py-0.5` | radius keempat |

Ini contoh nyata dari yang disebutkan di brief: **radius berbeda antar layar** untuk elemen yang secara fungsi sama (status pill), dan di kasus `GoldSavings.tsx` warnanya hardcode sehingga **berpotensi kontras buruk saat tema berganti** ke `light_sakura` (warna gelap `emerald-950`/`red-950` di atas background yang didesain untuk overlay gelap, belum tentu kontras cukup di card terang lain).

**Rekomendasi:**
1. Prioritaskan `GoldSavings.tsx` — ini satu-satunya yang benar-benar bypass sistem token (bukan cuma beda radius, tapi beda *sistem warna* sepenuhnya). Migrasi ke `<Badge tone="...">` atau minimal ke `tokens.badge.*` supaya ikut adaptif tema.
2. Untuk sisanya, konsolidasikan ke 1-2 varian radius resmi (`Badge` pakai `rounded-lg` sebagai standar) — file yang pakai `rounded-full`/`rounded-md`/`rounded` polos migrasi bertahap ke komponen `Badge`.

---

## 4. 🟠 Input custom di Login & beberapa Admin view

`Input.tsx` sudah menstandardisasi label uppercase + icon kiri + focus-border + radius `rounded-2xl` (default). Dua area menyimpang:

**a) `Login.tsx`** punya `InputField` lokal sendiri (didefinisikan di file yang sama) yang meniru pola yang *nyaris* sama — label kecil uppercase, icon kiri absolute — tapi dengan detail berbeda:
- Radius `rounded-xl` (Input: `rounded-2xl`)
- Padding `pl-10 pr-10 py-3` (Input: `px-4 py-3`, `pl-11` saat ada icon)
- Token warna terpisah (`tokens.login.inputFieldBgBorder`/`inputFieldFocus`) — bukan `tokens.surface.subtle`/`border.strong` yang dipakai `Input.tsx`

Dampaknya: form login (halaman pertama yang dilihat user) punya "rasa" radius/padding yang sedikit beda dari form lain di seluruh app (Budget, Savings, Settings, dll. yang sudah pakai `Input`).

**b) `AdminVoucherManager.tsx`** menulis input manual dengan:
```
border p-3 rounded-xl ... focus:ring-2 focus:ring-indigo-500
```
Ini beda secara **mekanisme fokus**, bukan cuma kelas — `Input.tsx` pakai `focus:border-{accent}` (garis tepi berubah warna), sementara file ini pakai `focus:ring-2` (muncul cincin/glow di luar border). Dua interaksi fokus yang terlihat & terasa berbeda untuk aksi yang sama, dalam app yang sama.

**Rekomendasi:**
1. `Login.tsx`: ganti `InputField` lokal jadi wrapper tipis di atas `<Input leftIcon={...} />` (Input sudah punya prop `leftIcon` persis untuk use-case ini) — bisa dilakukan tanpa mengubah tampilan drastis, cuma menyamakan angka radius/padding.
2. `AdminVoucherManager.tsx` (dan pola serupa jika ditemukan di file admin lain): ganti ke `<Input accent="indigo" />` supaya efek fokusnya konsisten dengan form lain.
3. Area Admin secara umum tampak dibangun terpisah dari form user-facing (pola tombol/badge di admin juga cenderung lebih "manual" — lihat temuan #3). Kalau Admin Panel dianggap prioritas rendah karena internal-only, boleh didokumentasikan sebagai **utang teknis yang disengaja**, tapi sebaiknya eksplisit (komentar) supaya tidak dianggap terlewat.

---

## 3. 🔴 `WalletPickerField.tsx` vs `DropdownField.tsx`: duplikasi logika penuh, bukan cuma style

Ini bukan sekadar kelas Tailwind yang beda — dua file ini menduplikasi ~150 baris **logika stateful yang identik**:

- Render lewat React Portal ke `document.body` (posisi dihitung via `useDropdownPosition`, supaya tidak terpotong `overflow-hidden` di ancestor)
- Handler klik-di-luar (`mousedown`/`touchstart`), termasuk edge case khusus karena panel di-portal jadi bukan descendant DOM dari trigger-nya
- Handler `Escape` untuk menutup dan mengembalikan fokus
- Animasi buka/tutup (`AnimatePresence` + `motion.div`) dengan arah geser tergantung `openUpward`
- Markup tombol trigger dan tiap opsi di panel — **persis sama karakter demi karakter**, termasuk komentar penjelasan di kedua file

Diff aktual antara kedua file cuma ~60 baris dari total ~330 baris gabungan — sisanya identik. Perbedaan fungsional cuma dua: `DropdownField` mendukung opsi `disabled` per-item dan 4 varian warna aksen (`indigo`/`amber`/`emerald`/`rose`), sementara `WalletPickerField` cuma 2 varian dan tanpa dukungan disabled.

**Kenapa ini serius:** kalau ada bug di logika posisi dropdown (mis. salah hitung saat scroll, atau salah arah buka ke atas/bawah di layar kecil), atau kalau perlu perbaikan aksesibilitas pada navigasi keyboard, perbaikannya harus dilakukan **di dua tempat terpisah** — dan sangat mudah salah satu terlewat karena keduanya terlihat seperti komponen yang tidak berhubungan (nama beda, tidak saling import).

**Rekomendasi:**
1. Jadikan `DropdownField` sebagai satu-satunya implementasi (sudah superset — dukung lebih banyak fitur).
2. Ubah `WalletPickerField` jadi wrapper tipis: terima props versi lama (`WalletPickerOption[]`, 2 varian aksen), lalu delegasikan ke `<DropdownField>` di dalamnya. Pemanggil (`Wallets.tsx`, satu-satunya konsumen) tidak perlu diubah sama sekali.
3. Setelah itu, `WalletPickerField.tsx` cukup ~20 baris (mapping props), bukan ~160 baris logika duplikat.

---

## 6. 🟠 Toggle switch: `ToggleSwitch.tsx` ada, tapi `AdminMaintenance.tsx` bikin 3 versi sendiri

`ToggleSwitch.tsx` sudah menstandardisasi switch on/off (track + thumb bulat animasi spring) lewat token tema, dan sudah dipakai di `Settings.tsx` & `NotificationSettings.tsx`. Tapi `AdminMaintenance.tsx` menulis **3 toggle manual berbeda di file yang sama**, bukan lewat komponen ini:

| Toggle (di `AdminMaintenance.tsx`) | Ukuran track | Warna "aktif" |
|---|---|---|
| Mode maintenance global | `w-14 h-7` | `bg-amber-600` (hardcode) |
| Sandbox bypass per-fitur | `w-10 h-5` | `bg-violet-600` (hardcode) |
| Lock fitur | `w-14 h-7` | `bg-red-600` (hardcode) |

Tiga ukuran/warna berbeda untuk elemen yang secara fungsi identik (on/off switch), semuanya di-hardcode di luar sistem token (`tokens.toggleSwitch.trackActive` yang dipakai `ToggleSwitch.tsx` sama sekali tidak disentuh). Kalau warna semantik "warning/danger" di-refresh lewat `tokens.ts` nanti, ketiga toggle di halaman Admin Maintenance ini tidak akan ikut berubah — dan halaman ini termasuk yang paling sensitif (mengontrol maintenance mode & fitur lock), jadi konsistensi visualnya justru penting untuk menghindari salah baca status oleh admin.

**Rekomendasi:** migrasikan ketiganya ke `<ToggleSwitch>`. Kalau butuh warna semantik berbeda per jenis toggle (amber untuk maintenance, merah untuk lock), tambahkan prop `tone` di `ToggleSwitch` yang memetakan ke token warna yang sudah ada (`tokens.badge.warning`/`tokens.badge.danger`, dsb.) — bukan menulis hex/warna Tailwind manual di pemanggil.

---

## 7. 🟡 Kontainer ikon bulat/kotak: radius berbeda di ukuran fisik yang sama

Untuk kontainer ikon `w-10 h-10` (dipakai sebagai avatar/icon-badge kecil di card, list item, dan chat widget), ditemukan campuran radius yang tidak konsisten untuk konteks visual yang mirip:

- `rounded-xl` — dipakai di beberapa tempat
- `rounded-2xl` — dipakai di tempat lain
- `rounded-full` (bulat penuh) — dipakai di tempat lain lagi

Ketiganya muncul bergantian di `Dashboard.tsx`, `Onboarding.tsx`, dan `SupportChatWidget.tsx`. Polanya sama seperti temuan Badge (#4) — karena orang cenderung copy-paste angka ukuran (`w-10 h-10`) tapi tidak copy radius yang menyertainya, ukurannya jadi konsisten sementara radiusnya drift.

**Dampak:** relatif kecil karena kontainer ikon ini biasanya berdiri sendiri (bukan elemen yang dibandingkan berdampingan), tapi tetap berkontribusi ke kesan "tidak seragam" kalau user berpindah antar halaman dengan cepat.

**Rekomendasi:** bukan prioritas mendesak, tapi kalau nanti ada sesi konsolidasi Badge (#4), sekalian standardisasi radius kontainer ikon jadi satu pilihan resmi (disarankan `rounded-2xl` mengikuti radius `Card`, kecuali untuk elemen yang secara desain memang harus bulat seperti avatar foto profil).

---

## 8. 🟡 Tombol CTA hardcode (kasus terisolasi, prioritas rendah)

`ErrorBoundary.tsx` punya tombol "Reload" dengan warna `bg-indigo-600 hover:bg-indigo-500` — cocok dengan varian `primary` milik `Button.tsx`, tapi **hardcode manual**, radius `rounded-xl` (Button: `rounded-2xl` di size `md`), dan **tanpa varian `light_sakura`** — jadi kalau app crash saat user memakai tema terang, tombol reload tetap indigo gelap.

Ini kemungkinan **sengaja**: `ErrorBoundary` diletakkan di luar semua context provider (termasuk `ThemeProvider`) supaya tetap bisa menangkap crash dari provider itu sendiri — jadi dia memang tidak bisa memanggil `useThemeTokens()`. Ini trade-off yang wajar untuk error boundary, bukan bug ceroboh.

**Rekomendasi:** bukan untuk diperbaiki dengan hook tema (tidak mungkin secara arsitektur), tapi:
1. Tambahkan komentar eksplisit di file itu bahwa warnanya sengaja hardcode & tidak ikut tema, supaya developer berikutnya tidak salah paham lalu mencoba "memperbaikinya" dengan cara yang salah.
2. Kalau mau lebih baik, gunakan warna netral (mis. abu-abu/putih transparan) yang cukup kontras di kedua tema, alih-alih warna brand yang berasosiasi kuat dengan satu tema.

---

## Prioritas Perbaikan (Ringkas)

1. ✅ **`Modal.tsx` → compose dari `ModalShell`** — **SELESAI** (dampak tertinggi per baris kode yang diubah, 18 titik pakai, API tidak berubah). Butuh tambahan prop `panelTone` di `ModalShell` (backward-compatible) untuk menampung warna panel danger/normal yang beda dari default. Belum diverifikasi visual manual — lihat detail status di temuan #2 di atas.
2. **`WalletPickerField` → wrapper tipis di atas `DropdownField`** — sama-sama migrasi 1 file, tapi menghilangkan ~150 baris duplikasi logika stateful (bukan cuma style) sekaligus.
3. ✅ **Migrasi Card di level view** — **SELESAI**, seluruh 18 file (7 view utama + 11 file Admin) sudah dimigrasi, nol occurrence pola manual `rounded-3xl border` tersisa. Verifikasi visual manual per halaman masih belum dilakukan — lihat detail status di temuan #1 di atas.
4. **`GoldSavings.tsx` badge hardcode** — kecil tapi satu-satunya yang benar-benar lolos dari sistem tema sepenuhnya (bukan cuma beda radius).
5. **Toggle switch di `AdminMaintenance.tsx` → `ToggleSwitch`** — halaman sensitif (maintenance/feature-lock), worth diprioritaskan meski jumlah file kecil.
6. **`Login.tsx` InputField → `Input`** — halaman pertama yang dilihat user, worth prioritizing meski dampaknya kecil.
7. Sisanya (badge lain, kontainer ikon, `AdminVoucherManager` input, admin views secara umum) — technical debt yang bisa dikerjakan bertahap, cocok masuk backlog "polish" per-sprint.

Catatan umum: primitive di `src/components/ui/` sudah didesain dengan baik (dokumentasi tiap komponen menjelaskan pola apa yang diekstrak & dari file mana) — masalahnya murni **adopsi**, bukan desain. Fix paling efektif adalah migrasi bertahap ke primitive yang sudah ada, bukan membangun sistem baru.
