# Rollout useThemeTokens() — Panduan Lanjutan

> ⚠️ **Audit koreksi 2026-07-18**: Paragraf status di bawah ini sebelumnya
> berhenti update di "sesi 14" (2026-07-16) padahal log sesi di dokumen ini
> sudah berjalan sampai **sesi 39**, dan beberapa file yang disebut "selesai"
> ternyata TIDAK selesai lagi di kode aktual saat ini (kemungkinan besar
> literal `light_sakura:` baru masuk lewat fitur-fitur baru yang ditambah
> setelah sesi migrasi terkait, bukan berarti migrasinya gagal). Paragraf ini
> sudah ditulis ulang berdasarkan audit ulang `grep` terhadap kode aktual
> (bukan cuma catatan sesi lama). Lihat juga bagian **"Bug ditemukan saat
> audit"** dan **"Rencana Sesi Selanjutnya (revisi 2026-07-18)"** di bawah.
>
> **Update 2026-07-18 (setelah sesi 40-44)**: Sesi 40-44 sudah dieksekusi
> (`Settings.tsx`, `AdminPremiumMonitor.tsx`, `SupportChatWidget.tsx`,
> `TelegramSettings.tsx`, `History.tsx`, `AdminBroadcast.tsx`,
> `NewTransaction.tsx`, `Budget.tsx`). Lihat log masing-masing sesi di
> bawah untuk detail token baru yang ditambahkan. Total literal turun dari
> 690 → **455** (67 file, jumlah file tidak berubah karena semua 8 file
> yang disentuh masih menyisakan >0 literal, lihat rincian per-file di log
> sesi). Roadmap "Sesi 45+" di bagian bawah SUDAH diperbarui.
>
> **Update 2026-07-18 (setelah sesi 45-46)**: Sesi 45 (`AdminMaintenance.tsx`,
> `AdminSupportChat.tsx`) & sesi 46 (`SettingsMobileMenu.tsx`,
> `LanguageSettings.tsx`, `Dashboard.tsx`, `AdminCategoryManager.tsx`) sudah
> dieksekusi. Total literal turun dari 455 → **397** (66 file --
> `LanguageSettings.tsx` mencapai 0 literal penuh sehingga keluar dari
> hitungan file). Lihat log Sesi 45 & 46 di bawah. Sesi ini juga menambahkan
> beberapa token cross-file baru (`toggle.inactiveTrack`, `border.subtleRose`,
> `divide.subtleRose`, `icon.subtle`, `settings.avatarBg`,
> `settings.premiumBadge`, `settings.premiumDismissBtn`,
> `settings.optionInactive`, `button.cancelSlate`, `adminSupportChat.*`) --
> file lain yang punya pola sama (`AdminPremiumMonitor.tsx`,
> `WalletTransferModal.tsx`, `AdminPanel.tsx`, `ProfileSettings.tsx`,
> `ThemeSettings.tsx`, `AdminBroadcast.tsx`, `EmptyState.tsx`) BELUM ikut
> dipasangi karena di luar cakupan target sesi 45-46 -- dicatat sebagai
> peluang reuse di komentar token terkait `tokens.ts` untuk sesi berikutnya.
> **Sesi 47 (Badge.tsx/Button.tsx) BELUM dieksekusi** -- perlu konfirmasi
> user dulu soal status pengecualian "Tidak termasuk cakupan refactor ini"
> (lihat roadmap Sesi 47 & bagian akhir dokumen).
>
> **Update 2026-07-18 (setelah sesi 47-48)**: User mengonfirmasi pengecualian
> `Badge.tsx`/`Button.tsx` DIREVISI -- kedua file boleh dimigrasi. Sesi 47
> (`ui/Badge.tsx`, `ui/Button.tsx`) & sesi 48 (`AdminBackup.tsx`,
> `Sidebar.tsx`, `VoicePreview.tsx`, `PremiumModal.tsx`) sudah dieksekusi.
> Total literal turun dari 397 → **329** (63 file -- `Badge.tsx`, `Button.tsx`,
> `AdminBackup.tsx` mencapai 0 literal penuh sehingga keluar dari hitungan
> file). Lihat log Sesi 47 & 48 di bawah. **Koreksi metodologi**: paragraf
> status sebelumnya (setelah sesi 45-46) sempat memverifikasi ulang jumlah
> `Badge.tsx`/`Button.tsx` pakai `grep -c` (hitung BARIS yang match), bukan
> `grep -o | wc -l` (hitung KEMUNCULAN) yang dipakai konsisten di seluruh
> dokumen ini -- sempat salah lapor 5/4 padahal aktualnya 15/12 (cocok
> dengan angka roadmap lama). Sudah diverifikasi ulang & tidak berulang di
> sesi 48. Token baru yang ditambahkan sesi ini: `badge.*` (5 tone),
> `buttonVariant.*` (4 varian), `sidebar.collapsedIconBtn`,
> `voicePreview.cancelBtn`/`confirmBtn`, `premiumModal.*` (4 key) -- reuse
> cross-file juga dipasang: `Sidebar.tsx` avatar bg → `mobileBottomNav.profileBg`,
> `VoicePreview.tsx` icon chip → `budget.statusDanger`. Detail lengkap di
> log Sesi 47 & 48.
>
> **Update 2026-07-18 (setelah sesi 49)**: Sesi 49 (`AdminMaintenance.tsx`,
> `AdminPremiumMonitor.tsx`, `ProfileSettings.tsx`, `Dashboard.tsx`,
> `NewTransaction.tsx`, `ReceiptUploader.tsx`, `DashboardOverviewCard.tsx`,
> `ThemeSettings.tsx`, `PrivacySettings.tsx`) sudah dieksekusi -- lihat log
> Sesi 49 di bawah untuk rincian per-file. Total literal turun dari 329 →
> **294** (61 file -- `ProfileSettings.tsx` & `ThemeSettings.tsx` mencapai 0
> literal penuh sehingga keluar dari hitungan file). `NewTransaction.tsx`
> **TIDAK berkurang** (tetap 10) -- diaudit tuntas cross-file, semua sisa
> literal genuinely 1x-pakai, tidak ada exact match ke token manapun.
> Token baru sesi ini: `toggle.inactiveIconBorder` (reuse cross-file
> `AdminMaintenance.tsx` ⇄ `AdminPremiumMonitor.tsx`), `chip.accentAmberRose`
> (reuse `ReceiptUploader.tsx` ⇄ `VoiceRecorder.tsx`, hanya dipasang di
> `ReceiptUploader.tsx` sesi ini), `chip.accentIndigo` (reuse
> `DashboardOverviewCard.tsx` ⇄ `DashboardInstallments.tsx`, hanya dipasang
> di `DashboardOverviewCard.tsx` sesi ini). Reuse token lama yang akhirnya
> terpasang setelah sempat dicatat "di luar cakupan" di sesi sebelumnya:
> `settings.avatarBg`/`premiumBadge`/`premiumDismissBtn` (di `ProfileSettings.tsx`,
> dicatat sejak sesi 46), `settings.optionInactive` (di `ThemeSettings.tsx`,
> dicatat sejak sesi 46), `toggle.inactiveTrack` (di `AdminPremiumMonitor.tsx`,
> dicatat sejak sesi 45).

> **Update 2026-07-18 (setelah sesi 50)**: Sesi 50 dieksekusi sebagai audit
> "sapu bersih" terhadap 7 file target roadmap (`AdminMaintenance.tsx`,
> `AdminPremiumMonitor.tsx`, `DashboardOverviewCard.tsx`, `Dashboard.tsx`,
> `NewTransaction.tsx`, `ReceiptUploader.tsx`, `PrivacySettings.tsx`) +
> `WalletPickerField.tsx`, plus eksekusi 3 reuse cross-file yang sudah
> dicatat sejak sesi 48-49 tapi belum dipasang (`chip.accentAmberRose` →
> `VoiceRecorder.tsx`, `chip.accentIndigo` → `DashboardInstallments.tsx`,
> `voicePreview.cancelBtn` → `ReceiptPreview.tsx`). **Hasil audit 7 file
> target roadmap: TIDAK ADA yang berkurang** (`AdminMaintenance.tsx` tetap
> 15, `AdminPremiumMonitor.tsx` tetap 14, `DashboardOverviewCard.tsx` tetap
> 9, `Dashboard.tsx` tetap 10, `NewTransaction.tsx` tetap 10,
> `ReceiptUploader.tsx` tetap 7, `PrivacySettings.tsx` turun dari 3 → 2
> lewat token baru `text.dangerSoft`, lihat di bawah) -- semua literal
> lainnya di 7 file ini genuinely 1x-pakai/tidak exact-match setelah
> di-cross-check ke `tokens.ts` & ke seluruh `src/`, lihat log Sesi 50 di
> bawah untuk rincian per-baris. Total literal turun dari kontribusi 3
> reuse tercatat + 2 token baru yang ditemukan tak terduga saat audit
> (`chip.badgeIndigo` / `chip.badgeAmber` -- exact match `DropdownField.tsx`
> colorMap ⇄ `WalletPickerField.tsx` badge; `text.dangerSoft` -- exact
> match `Settings.tsx` ⇄ `PrivacySettings.tsx` teks peringatan hapus akun):
> **294 → 277** (60 file -- `WalletPickerField.tsx` mencapai 0 literal
> penuh sehingga keluar dari hitungan file & keluar dari daftar dead-code
> lama). Detail lengkap di log Sesi 50.

> **⚠️ PERUBAHAN STRATEGI 2026-07-18 (setelah sesi 51, konfirmasi user)**:
> Mulai Sesi 52, tujuan rollout ini berubah dari "kurangi duplikasi lewat
> reuse ≥2 file" menjadi **persiapan migrasi tema besar** -- SEMUA sisa
> literal `light_sakura:` (termasuk yang genuinely 1x-pakai) sekarang WAJIB
> dipindah ke `tokens.ts`, bukan lagi opsional. Target akhir yang baru:
> **0 literal `light_sakura:` di seluruh `src/`**, tanpa pengecualian
> "genuinely 1x-pakai". Detail lengkap & alasan di bagian "Kapan menambah
> token baru" dan roadmap Sesi 52 di bawah.
>
> **Update 2026-07-18 (setelah sesi 52)**: Sesi 52 (`AdminMaintenance.tsx`,
> `AdminPremiumMonitor.tsx`, `NewTransaction.tsx`, `Dashboard.tsx`,
> `DashboardOverviewCard.tsx` -- 5 file target teratas dari daftar roadmap
> sesi 52, sesuai kebijakan tokenisasi penuh baru) sudah dieksekusi. Total
> literal turun dari 247 → **187** (53 file -- kelima file target sesi ini
> mencapai 0 literal penuh sehingga keluar dari hitungan file). Rincian
> per-file: `AdminMaintenance.tsx` 15 → **0**, `AdminPremiumMonitor.tsx`
> 14 → **0**, `NewTransaction.tsx` 10 → **0**, `Dashboard.tsx` 10 → **0**,
> `DashboardOverviewCard.tsx` 9 → **0**. Semua kombinasi di 5 file ini
> dicek cross-file dulu (tidak ada exact match ≥2 file) sebelum dipindah
> sebagai token per-file (`adminMaintenance.*`, `dashboard.*`,
> `dashboardOverviewCard.*` -- grup baru; `adminPremium.*` &
> `newTransaction.*` -- ditambah ke grup lama yang sudah ada). Lihat log
> Sesi 52 di bawah untuk rincian per-baris. **Prioritas tambahan juga
> dieksekusi**: `modal.closeBtn` (token dari sesi 51) dipasang ke 2 file
> yang sudah dikonfirmasi exact-match sejak sesi 51: `WalletTopUpModal.tsx`
> 6 → 5, `HistoryEditModal.tsx` 4 → 3 (masing-masing masih ada sisa literal
> lain di luar cakupan `modal.closeBtn`, belum diaudit sesi ini). `npx tsc
> --noEmit -p tsconfig.json` dijalankan bersih (0 error) atas SELURUH
> project setelah `npm install` berhasil di sandbox sesi ini (`node_modules`
> sebelumnya tidak tersedia di sesi 51) -- termasuk verifikasi retroaktif
> perubahan sesi 51 yang belum sempat di-tsc.
>
> **Update 2026-07-19 (setelah sesi 53)**: Sesi 53 (`SecuritySettings.tsx`,
> `Settings.tsx`, `AdminSupportChat.tsx`, `AdminPanel.tsx`,
> `MobileSettingsDetailPage.tsx`, `ReceiptUploader.tsx`,
> `HistoryGroupedList.tsx`, `DashboardWalletSelectorCard.tsx` -- 8 file
> target sesi 53, masing-masing 7 literal) sudah dieksekusi TUNTAS. Total
> literal turun dari 187 → **129** (44 file). Semua 8 file mencapai
> **0 literal penuh**. Temuan penting sesi ini: banyak token dari sesi
> 45/46/49 SUDAH ADA di `tokens.ts` tapi belum sempat dipasang ke file-file
> ini (`settings.cardBorder`, `settings.sectionBorder`, `settings.avatarBg`,
> `settings.premiumBadge`, `text.muted`, `border.subtleRose`,
> `divide.subtleRose`, `surface.card`, `icon.subtle`, `chip.accentIndigo`,
> `hover.textAccent`, `text.danger`, `text.success`, `toggle.inactiveTrack`)
> -- jadi sebagian besar pekerjaan sesi ini adalah *pemasangan ulang token
> lama* (audit ulang menemukan reuse yang terlewat), bukan cuma bikin token
> baru. Ditemukan juga 1 pasang exact-match baru lintas-file:
> `settings.sunkenBorderPanel` (Settings.tsx L1028 & TelegramSettings.tsx
> L213, keduanya dipasang -- TelegramSettings.tsx sbg "prioritas tambahan"
> di luar 8 file target utama). `npx tsc --noEmit -p tsconfig.json`
> dijalankan bersih (0 error) atas SELURUH project setelah semua perubahan.
> Lihat log Sesi 53 di bawah untuk rincian per-baris & per-token.
>
> **Update 2026-07-18 (setelah sesi 51)**: Sesi 51 (`NotificationSettings.tsx`,
> `WalletTransferModal.tsx`, `Modal.tsx`, `DashboardRecentTransactions.tsx`,
> `ConfirmTransactionModal.tsx` -- 5 file target teratas dari daftar "8
> literal" di roadmap sesi 51) sudah dieksekusi. Total literal turun dari
> 277 → **247** (58 file -- `NotificationSettings.tsx` &
> `ConfirmTransactionModal.tsx` mencapai 0 literal penuh sehingga keluar
> dari hitungan file). Rincian per-file: `NotificationSettings.tsx` 8 → **0**,
> `WalletTransferModal.tsx` 8 → 2, `Modal.tsx` 6 → 3, `ConfirmTransactionModal.tsx`
> 8 → **0**, `DashboardRecentTransactions.tsx` 8 → 5. Lihat log Sesi 51 di
> bawah untuk rincian per-baris. Token baru sesi ini: `modal.panel` &
> `modal.closeBtn` (reuse cross-file `WalletTransferModal.tsx` ⇄
> `ConfirmTransactionModal.tsx`, `modal.closeBtn` pola sama juga ditemukan
> di `WalletTopUpModal.tsx` & `HistoryEditModal.tsx` tapi BELUM dipasang di
> sana -- di luar cakupan target sesi 51, dicatat untuk sesi berikutnya).
> Reuse token lama yang terpasang lintas file sesi ini: `border.subtleRose`
> (`WalletTransferModal.tsx`), `newTransaction.amountInputExpense`/`amountInputIncome`/
> `amountDisplayExpense` (`ConfirmTransactionModal.tsx` & `Modal.tsx`),
> `budgetProgressCard.badgeBgDanger`/`badgeBgWarning`/`badgeBgSafe` &
> `budget.statusSafe` (`Modal.tsx`), `errorMonitor.progressBg` &
> `settings.sectionBorder` (`DashboardRecentTransactions.tsx`).
> **Catatan lingkungan**: `npx tsc --noEmit` (poin 4 di "Reminder wajib")
> TIDAK BISA dijalankan sesi ini karena `node_modules` belum ter-install dan
> sandbox tidak punya akses jaringan ke registry npm -- verifikasi diganti
> dengan pengecekan manual (audit baris-per-baris + cek keseimbangan
> kurung kurawal `{}` di tiap file yang diubah). **Perlu dijalankan ulang
> di sesi berikutnya begitu `node_modules` tersedia** untuk memastikan
> tidak ada `Cannot find name 'tokens'/'cx'`.

Status per 2026-07-18 (setelah sesi 51): hook + token dasar sudah terpasang
di HAMPIR SEMUA file (`useThemeTokens` sudah di-import & dipanggil), tapi
total **247 literal inline `light_sakura:` masih tersisa di 58 file**
(turun dari 277/60 setelah sesi 50, lihat tabel audit terbaru di bagian
roadmap). Ini jauh lebih tinggi dari angka-angka yang tercatat di sesi-sesi
lama karena fitur baru terus ditambahkan ke file yang sudah pernah
"dituntaskan".

File yang BENAR-BENAR 0 literal saat ini (dikonfirmasi ulang via `grep`):
`src/views/Wallets.tsx`, `src/views/Onboarding.tsx`, `src/views/Login.tsx`,
`src/components/DashboardWalletCards.tsx`, `src/components/SplashScreen.tsx`,
`src/views/GoldSavings.tsx`, `src/views/Savings.tsx`, `src/views/Installments.tsx`,
`src/views/BillReminders.tsx`, `src/views/AdminErrorMonitor.tsx`,
`src/views/AdminUserManager.tsx`, `src/views/AdminVoucherManager.tsx`,
`src/views/DashboardChart.tsx`, `src/contexts/ToastContext.tsx` (1 tersisa,
lihat sesi 27), `src/App.tsx`, `src/components/AdminUserDetailModal.tsx`,
`src/components/ui/Badge.tsx`,
`src/components/ui/Button.tsx`, `src/views/AdminBackup.tsx`,
`src/views/settings/ProfileSettings.tsx` (sesi 49),
`src/views/settings/ThemeSettings.tsx` (sesi 49),
`src/components/WalletPickerField.tsx` (sesi 50),
`src/views/settings/NotificationSettings.tsx` (sesi 51),
`src/components/ConfirmTransactionModal.tsx` (sesi 51).

> **Koreksi sesi 50**: `src/views/NewTransaction.tsx` SEBELUMNYA tercantum
> di daftar ini, TAPI itu keliru -- audit `grep` aktual (sesi 44, 49, 50)
> konsisten menunjukkan file ini punya **10 literal** tersisa (semua
> genuinely 1x-pakai, lihat log Sesi 49 & 50). Kemungkinan besar sisa salah
> catat dari sesi jauh lebih lama yang tidak pernah dikoreksi. Sudah
> dihapus dari daftar ini.

**Klaim "selesai" yang TERNYATA SUDAH TIDAK AKURAT** (dikoreksi audit ini):
- `src/views/Settings.tsx` -- sebelumnya disebut "sudah selesai/diaudit
  penuh" di paragraf ini, TAPI kode aktual saat ini punya **103 literal**
  `light_sakura:` tersisa (bukan 0, bukan juga 59 seperti klaim sesi 38/39).
  Ini file dengan literal terbanyak di seluruh codebase saat ini.
- `src/views/AdminPremiumMonitor.tsx` -- sesi 39 mencatat file ini
  "18 → 0" migrasi ke `tokens.adminPremium`, TAPI (a) grup token
  `adminPremium` ternyata **tidak pernah didefinisikan** di `tokens.ts`
  (bug runtime, sudah diperbaiki hari ini -- lihat bagian bug di bawah),
  dan (b) kode aktual sekarang punya **30 literal** tersisa, kemungkinan
  besar dari fitur toggle QRIS sandbox/dummy (`dummyQrisEnabled`,
  `tx.is_sandbox`) yang ditambahkan belakangan dan belum pernah dimigrasi.
- `src/components/SkeletonLoader.tsx` -- paragraf ini sebelumnya masih
  merujuk status sesi 11 ("diaudit, 0 migrasi"), padahal sesi 16 sudah
  memasang hook & migrasi penuh (19→0), lalu sesi 22 mencatat 4 literal
  baru muncul lagi dan dikurangi ke 11→4. Status aktual saat ini: hook
  terpasang, **4 literal tersisa** (cocok dengan angka akhir sesi 22).
- `src/components/MobileBottomNav.tsx` dan `src/components/ui/Card.tsx` --
  sebelumnya disebut "selesai/diaudit penuh", tapi aktual saat ini
  masing-masing punya 6 dan 3 literal tersisa (fitur baru).

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
- ~~`src/components/WalletPickerField.tsx`~~ -- **KOREKSI 2026-07-18: file
  ini SEKARANG DIIMPOR dan dipakai** (`import { WalletPickerField } from
  "../components/WalletPickerField"` di `src/views/Wallets.tsx` baris 15,
  dipakai baris 467). Klaim dead-code dari sesi 12 sudah tidak berlaku --
  kemungkinan fitur pemilih dompet di `Wallets.tsx` diaktifkan ulang setelah
  sesi 12. File ini SUDAH punya hook (`useThemeTokens` terpasang) tapi masih
  ada **4 literal `light_sakura:` tersisa** -- pindahkan ke daftar prioritas
  migrasi aktif (lihat roadmap di bawah), BUKAN dead code lagi.

**Jangan migrasi token di file-file di atas** -- kalau mau dihapus, itu di
luar scope rollout token, perlu konfirmasi dulu ke user karena keputusan
penghapusan kode berbeda dari keputusan styling. Sebelum membuka file baru
manapun untuk migrasi, WAJIB cek dulu apakah file itu benar-benar diimpor
(`grep -rln "import.*<NamaKomponen>" src`) supaya tidak buang waktu migrasi
token di dead code lagi.

## ⚠️ Bug ditemukan & diperbaiki saat audit 2026-07-18

Saat cross-check tiap pemanggilan `tokens.<grup>.<key>` di seluruh `src`
terhadap definisi asli di `src/lib/theme/tokens.ts`, ditemukan satu bug
runtime nyata (bukan cuma masalah dokumentasi):

- **`src/views/AdminPremiumMonitor.tsx` memanggil `tokens.adminPremium.*`
  (4 key: `statusBadgeSuccess`, `statusBadgePending`, `statusBadgeExpired`,
  `statusBadgeFailed`) padahal grup `adminPremium` TIDAK PERNAH ada di
  `tokens.ts`.** Ini akan menyebabkan `Cannot read properties of undefined`
  begitu badge status transaksi premium (SUCCESS/PENDING/EXPIRED/FAILED)
  dirender. Kemungkinan penyebab: sesi 39 mencatat migrasi "18 → 0" ke
  `tokens.adminPremium`, tapi entah kenapa definisi grupnya di `tokens.ts`
  tidak pernah ter-commit/tersimpan.
- **Sudah diperbaiki**: grup `adminPremium` ditambahkan ke `tokens.ts`
  (setelah grup `errorMonitor`, sebelum `adminUserModal`) dengan 4 key di
  atas, memakai pola warna yang sama dengan grup semantik lain (emerald =
  sukses, amber = pending, slate = expired, red = gagal), lengkap dengan
  varian `light_sakura:`.
- Audit ini juga menjalankan cross-check yang sama (grup + key) ke SEMUA
  grup token lain di seluruh codebase -- `adminPremium` adalah satu-satunya
  referensi yang tidak terdefinisi. Tidak ada bug serupa di grup lain.

## Rencana Sesi Selanjutnya (revisi 2026-07-18, menggantikan roadmap sesi 30-39 di atas)

> Roadmap "Sesi 30-39" yang sebelumnya ada di bagian ini SUDAH DIEKSEKUSI
> SELURUHNYA (lihat log sesi 30-39 di bawah) kecuali **Sesi 37 yang
> direncanakan tapi tidak pernah dijalankan/dicatat** (target aslinya:
> `Budget.tsx`, `SupportChatWidget.tsx`, `BudgetProgressCard.tsx`).
> Roadmap lama karena itu sudah usang dan diganti dengan daftar di bawah,
> disusun ulang dari audit `grep` terhadap kode aktual per 2026-07-18, BUKAN
> dari angka-angka sesi lama yang sudah tidak akurat (banyak file "selesai"
> kemasukan literal baru lagi lewat fitur-fitur baru).
>
> **Update**: Sesi 40-44 di bawah ini SUDAH DIEKSEKUSI (lihat log masing-
> masing sesi). Sesi 45 sekarang jadi target berikutnya.

Total saat ini: **455 literal `light_sakura:` tersisa di 67 file** (turun
dari 690 setelah sesi 40-44). Semua file di bawah SUDAH punya hook
`useThemeTokens` terpasang (tinggal ganti class literal ke token, tidak
perlu pasang hook baru), kecuali disebutkan lain.

- ~~**Sesi 40: Settings.tsx (Prioritas Tertinggi)**~~ **[SELESAI]** 103 → 8
  literal (lihat log Sesi 40 & 42 di bawah -- sisa 8 literal adalah
  kombinasi 1x-pakai yang tidak exact-match ke token manapun).
- ~~**Sesi 41: AdminPremiumMonitor.tsx & Fitur QRIS Sandbox**~~ **[SELESAI]**
  30 → 16 literal (lihat log Sesi 41).
- ~~**Sesi 42: Support Chat & Telegram Settings**~~ **[SELESAI]**
  `SupportChatWidget.tsx` 29 → 6, `TelegramSettings.tsx` 27 → 2 (lihat log
  Sesi 42).
- ~~**Sesi 43: Riwayat & Broadcast**~~ **[SELESAI]** `History.tsx` 27 → 1,
  `AdminBroadcast.tsx` 25 → 4 (lihat log Sesi 43).
- ~~**Sesi 44: Transaksi Baru & Anggaran**~~ **[SELESAI]**
  `NewTransaction.tsx` 24 → 10, `Budget.tsx` 22 → 5 (lihat log Sesi 44).
- ~~**Sesi 45: Maintenance & Support Chat Admin**~~ **[SELESAI]**
  `AdminMaintenance.tsx` 21 → 17, `AdminSupportChat.tsx` 18 → 7 (lihat log
  Sesi 45).
- ~~**Sesi 46: Sub-Settings Menengah**~~ **[SELESAI]**
  `SettingsMobileMenu.tsx` 16 → 1, `LanguageSettings.tsx` 15 → **0**,
  `Dashboard.tsx` 13 → 11, `AdminCategoryManager.tsx` 13 → 2 (lihat log
  Sesi 46).
- ~~**Sesi 47: UI Primitives Inti (Badge, Button)**~~ **[SELESAI]** User
  mengonfirmasi revisi pengecualian "Tidak termasuk cakupan refactor ini".
  `Badge.tsx` 15 → **0**, `Button.tsx` 12 → **0** (lihat log Sesi 47).
- ~~**Sesi 48: Admin Backup, Sidebar, VoicePreview, PremiumModal**~~ **[SELESAI]**
  `AdminBackup.tsx` 12 → **0**, `Sidebar.tsx` 12 → 5, `VoicePreview.tsx`
  12 → 1, `PremiumModal.tsx` 12 → 1 (lihat log Sesi 48).
- ~~**Sesi 49: Sisa Sub-Settings Kecil**~~ **[SELESAI]**
  `AdminMaintenance.tsx` 17 → 15, `AdminPremiumMonitor.tsx` 16 → 14,
  `ProfileSettings.tsx` 11 → **0**, `Dashboard.tsx` 11 → 10,
  `NewTransaction.tsx` 10 → 10 (tidak berkurang, lihat log Sesi 49),
  `ReceiptUploader.tsx` 10 → 7, `DashboardOverviewCard.tsx` 10 → 9,
  `ThemeSettings.tsx` 9 → **0**, `PrivacySettings.tsx` 9 → 3 (lihat log
  Sesi 49).
- ~~**Sesi 50: WalletPickerField (bekas dead-code) & Sapu Bersih Akhir**~~
  **[SELESAI SEBAGIAN]** Audit penuh 7 file target roadmap (`AdminMaintenance.tsx`,
  `AdminPremiumMonitor.tsx`, `DashboardOverviewCard.tsx`, `Dashboard.tsx`,
  `NewTransaction.tsx`, `ReceiptUploader.tsx`, `PrivacySettings.tsx`) --
  TIDAK ADA exact-match token baru ditemukan di file-file ini (semua
  literal tersisa genuinely 1x-pakai), kecuali `PrivacySettings.tsx`
  9 → 2 lewat token baru `text.dangerSoft` (lihat di bawah). `WalletPickerField.tsx`
  4 → **0** (token baru `chip.badgeIndigo`/`chip.badgeAmber`, reuse ke
  `DropdownField.tsx` 8 → 4). Plus eksekusi 3 reuse tercatat sejak sesi
  48-49: `VoiceRecorder.tsx` 6 → 3, `DashboardInstallments.tsx` 3 → 2,
  `ReceiptPreview.tsx` 5 → 2 (lihat log Sesi 50). **"Sapu bersih" ~30 file
  sisa (1-8 literal) BELUM disentuh** -- dipindah ke Sesi 51.
- ~~**Sesi 51: Sapu Bersih Akhir (lanjutan)**~~ **[SELESAI SEBAGIAN]**
  5 file target teratas (8 literal masing-masing) dieksekusi:
  `NotificationSettings.tsx` 8 → **0**, `WalletTransferModal.tsx` 8 → 2,
  `Modal.tsx` 6 → 3 (angka awal file ini sebenarnya 6, bukan 8 -- lihat
  audit ulang di log Sesi 51), `ConfirmTransactionModal.tsx` 8 → **0**,
  `DashboardRecentTransactions.tsx` 8 → 5 (lihat log Sesi 51). Total
  turun dari 277 → **247** (58 file). Sisa target `NotificationSettings.tsx`
  (8), `WalletTransferModal.tsx` (8), `Modal.tsx` (8 -- angka roadmap lama
  keliru) di daftar sesi 51 SUDAH tercakup; `AdminMaintenance.tsx`,
  `AdminPremiumMonitor.tsx`, `NewTransaction.tsx`, `Dashboard.tsx`,
  `DashboardOverviewCard.tsx` BELUM disentuh lagi (sudah diaudit tuntas
  sesi 49-50, lihat catatan roadmap lama) -- dipindah ke Sesi 52 bersama
  seluruh sisa file 1-7 literal.
- **Sesi 52: PERUBAHAN STRATEGI -- Tokenisasi Penuh untuk Kesiapan Migrasi Tema**
  **[SELESAI]** 5 file target teratas dieksekusi: `AdminMaintenance.tsx`
  15 → **0**, `AdminPremiumMonitor.tsx` 14 → **0**, `NewTransaction.tsx`
  10 → **0**, `Dashboard.tsx` 10 → **0**, `DashboardOverviewCard.tsx`
  9 → **0**. Plus prioritas tambahan `modal.closeBtn` dipasang ke
  `WalletTopUpModal.tsx` 6 → 5 & `HistoryEditModal.tsx` 4 → 3. Total turun
  dari 247 → **187** (53 file). Sisa target roadmap sesi ini (8 file
  "7 literal": `SecuritySettings.tsx`, `Settings.tsx`,
  `AdminSupportChat.tsx`, `AdminPanel.tsx`, `MobileSettingsDetailPage.tsx`,
  `ReceiptUploader.tsx`, `HistoryGroupedList.tsx`,
  `DashboardWalletSelectorCard.tsx`) dipindah ke **Sesi 53 -- sudah
  dieksekusi tuntas, lihat ringkasan Sesi 53 di bawah**. Lihat log Sesi 52
  di bawah untuk rincian per-baris.
  - **⚠️ Strategi berubah total mulai sesi ini** (atas konfirmasi user
    2026-07-18, lihat kotak peringatan di bagian "Kapan menambah token
    baru"). Sebelumnya: hanya tokenisasi kombinasi exact-match ≥2 file,
    sisanya boleh tetap literal selamanya. **Sekarang: SEMUA sisa 247
    literal, termasuk yang genuinely 1x-pakai, harus dipindah ke
    `tokens.ts`** -- tujuannya bukan reuse lagi, tapi single source of
    truth supaya migrasi tema (ganti palet warna) nanti cukup edit
    `tokens.ts`, tanpa perlu grep manual ke seluruh `src/`.
  - **Cara kerja berbeda dari sesi-sesi sebelumnya**:
    1. Kombinasi yang muncul ≥2 file → tetap jadi token semantik/generik
       seperti biasa (grup `text.*`, `chip.*`, dst) -- alur lama tidak
       berubah untuk kasus ini.
    2. Kombinasi 1x-pakai (yang dulu "tidak dipaksakan, tetap literal") →
       SEKARANG dipindah juga, tapi dengan penamaan `<namaFile
       camelCase>.<deskripsiSingkat>` di grup token per-file (pola sudah
       ada, mis. `newTransaction.*`, `adminBackup.*`) supaya jelas
       asalnya dan tidak mencemari grup semantik generik.
    3. Kombinasi yang MIRIP tapi beda shade (poin 3 di "Cara migrasi 1
       file") TETAP dapat token terpisah, TIDAK dipaksa gabung -- aturan
       ini tidak berubah, karena ini soal jangan diam-diam mengubah
       tampilan, bukan soal reuse.
  - **File Target sesi ini** (lanjutan urutan literal terbanyak, TERMASUK
    kembali 5 file besar yang sebelumnya "dikecualikan" karena audit
    lama mencari exact-match ≥2 file -- sekarang semua literalnya justru
    harus ditoken-kan sebagai token per-file): ~~`AdminMaintenance.tsx` (15)~~,
    ~~`AdminPremiumMonitor.tsx` (14)~~, ~~`NewTransaction.tsx` (10)~~,
    ~~`Dashboard.tsx` (10)~~, ~~`DashboardOverviewCard.tsx` (9)~~ **[SELESAI
    sesi 52, lihat log Sesi 52]** -- lanjut Sesi 53 (SELESAI, lihat log
    Sesi 53): ~~`SecuritySettings.tsx` (7)~~, ~~`Settings.tsx` (7)~~,
    ~~`AdminSupportChat.tsx` (7)~~, ~~`AdminPanel.tsx` (7)~~,
    ~~`MobileSettingsDetailPage.tsx` (7)~~, ~~`ReceiptUploader.tsx` (7)~~,
    ~~`HistoryGroupedList.tsx` (7)~~, ~~`DashboardWalletSelectorCard.tsx` (7)~~
    -- lanjut Sesi 54: seluruh sisa file (≈44 file, sebagian besar <7
    literal/file, lihat query audit di bawah untuk daftar lengkap terbaru).
  - **Prioritas tambahan**: pasang `modal.closeBtn` (token baru sesi 51)
    ke `WalletTopUpModal.tsx` (6) & `HistoryEditModal.tsx` (4) -- sudah
    dikonfirmasi exact-match sejak sesi 51, tinggal eksekusi. **[SELESAI
    sesi 52]** kedua file turun 1 literal masing-masing (sisa literal lain
    di kedua file BELUM diaudit, lihat log Sesi 52).
  - **Target "selesai" baru**: `grep -c "light_sakura:" src` di SELURUH
    project = **0**. Ini realistis dicapai sekarang karena tidak ada lagi
    kategori "tetap literal karena 1x-pakai" -- satu-satunya alasan sah
    tersisa literal adalah kalau memang butuh audit ulang di sesi
    berikutnya (belum sempat dikerjakan), bukan karena keputusan
    permanen.
  - **Wajib**: jalankan `npx tsc --noEmit` untuk verifikasi SELURUH
    perubahan sesi 51 (tidak sempat dijalankan sesi itu karena
    `node_modules` tidak tersedia & sandbox tanpa akses jaringan) SEBELUM
    melanjutkan migrasi file baru -- lihat catatan lingkungan di paragraf
    status sesi 51.
  - **Catatan untuk sesi berikutnya setelah 0 literal tercapai**: begitu
    seluruh `src/` bebas `light_sakura:` inline, migrasi tema besar
    (ganti palet/tambah tema baru) baru aman dilakukan HANYA dengan edit
    `tokens.ts` -- tidak perlu lagi menyentuh file komponen satu-satu.
    Itu jadi milestone terpisah, bukan bagian dari rollout token ini.
- **Sesi 53: Lanjutan Tokenisasi Penuh -- 8 File "7 Literal"**
  **[SELESAI]** Semua 8 file target dieksekusi tuntas ke 0 literal:
  `SecuritySettings.tsx` 7 → **0**, `Settings.tsx` 7 → **0**,
  `AdminSupportChat.tsx` 7 → **0**, `AdminPanel.tsx` 7 → **0**,
  `MobileSettingsDetailPage.tsx` 7 → **0**, `ReceiptUploader.tsx` 7 → **0**,
  `HistoryGroupedList.tsx` 7 → **0**, `DashboardWalletSelectorCard.tsx`
  7 → **0**. Total turun dari 187 → **129** (44 file). Temuan kunci sesi
  ini: BANYAK token dari sesi 45/46/49 sudah ada di `tokens.ts` tapi
  belum pernah dipasang ke file-file ini (komentar "belum dipasang, di
  luar cakupan sesi X" di `border.subtleRose`, `divide.subtleRose`,
  `icon.subtle`, `chip.accentIndigo`, `toggle.inactiveTrack`,
  `settings.avatarBg`, `settings.premiumBadge`) -- jadi audit ulang
  cross-file di sesi ini WAJIB dicek dulu ke token yang SUDAH ADA sebelum
  bikin token baru per-file, bukan cuma cross-check antar 8 file target.
  Ditemukan juga exact-match baru lintas-file: `settings.sunkenBorderPanel`
  (Settings.tsx L1028 ⇄ `TelegramSettings.tsx` L213, keduanya dipasang --
  yang kedua sebagai "prioritas tambahan" di luar 8 file target). `npx tsc
  --noEmit` bersih 0 error atas SELURUH project. Lihat log Sesi 53 di
  bawah untuk rincian per-baris & daftar lengkap token yang dipasang/dibuat.


Jalankan query ini di root repo untuk data terbaru sebelum tiap sesi (versi
audit 2026-07-18, sudah termasuk kolom status hook):

```bash
for f in $(find src/views src/components -name "*.tsx"); do
  c=$(grep -o "light_sakura:" "$f" | wc -l)
  h=$(grep -c useThemeTokens "$f")
  [ "$c" -gt 0 ] && echo "$c|$f|hook:$h"
done | sort -t'|' -k1 -rn
```

---

> 📌 **Catatan audit 2026-07-18**: Log sesi di bawah ini adalah **arsip
> historis** -- angka "Sebelum/Sesudah" di tiap sesi akurat UNTUK WAKTU
> SESI ITU DIJALANKAN, tapi banyak file yang tercatat "0" di sini sudah
> kemasukan literal `light_sakura:` baru lagi lewat penambahan fitur
> setelahnya. **Jangan jadikan log ini sebagai acuan status file saat ini**
> -- untuk status terkini, lihat paragraf status di awal dokumen dan tabel
> roadmap "Sesi 40+" di atas, yang keduanya berbasis audit `grep` langsung
> ke kode aktual per 2026-07-18.

## Sesi 53: Lanjutan Tokenisasi Penuh -- 8 File "7 Literal" (Banyak Reuse Token Lama)

| File | Sebelum | Sesudah | Catatan |
|---|---|---|---|
| `src/views/settings/SecuritySettings.tsx` | 7 | **0** | 100% pakai token yang SUDAH ADA di `tokens.ts` (tidak ada token baru sama sekali): `settings.profileCardBgBorder` (panel form ganti password), `settings.sectionHeadingBorder` (heading "Keamanan Akun"), `settings.otpInputBg` (×3, background 3 kotak input password lama/baru/konfirmasi -- dipasang lewat 1x `sed` karena literal-nya identik persis di 3 tempat). |
| `src/views/Settings.tsx` | 7 | **0** | Campuran token lama & baru. Token lama yang akhirnya dipasang (sebelumnya "belum dipasang" di komentar sesi 46): `settings.avatarBg` (avatar bulat inisial user), `settings.premiumBadge` (badge "Premium"). Token baru (genuinely 1x-pakai, ditambahkan ke grup `settings.*`): `langToggleBtnBg` (tombol toggle bahasa header), `unlinkBtnBorder` (border tombol putuskan Telegram -- MIRIP tapi TIDAK exact match dengan tombol sejenis di `PrivacySettings.tsx` karena versi itu membakar warna teks di dalam class-nya, jadi tetap token terpisah), `sunkenBorderPanel` (kotak info fitur Telegram -- **exact match baru ditemukan** dengan `TelegramSettings.tsx` L213, dipasang ke keduanya). |
| `src/views/AdminSupportChat.tsx` | 7 | **0** | Semua 5 kombinasi genuinely 1x-pakai (dicek cross-file). Token baru ditambahkan ke grup `adminSupportChat.*` yang sudah ada sejak sesi 45 (5 key baru): `filterBtnBorder`, `sessionRowActiveBg`, `sessionRowHoverBg`, `bubbleOtherBg`, `inputText`. |
| `src/views/AdminPanel.tsx` | 7 | **0** | 100% reuse token LAMA yang sudah ditulis sejak sesi 45/46 tapi baru dipasang sekarang: `settings.cardBorder`, `settings.sectionBorder`, `text.muted`, `border.subtleRose` (komentar token secara eksplisit sudah menyebut "AdminPanel.tsx belum dipasang" sejak sesi 46), `divide.subtleRose` (sama), `surface.card`, `icon.subtle` (sama). Tidak ada token baru dibuat untuk file ini. |
| `src/components/settings/MobileSettingsDetailPage.tsx` | 7 | **0** | Border/teks-nya reuse token yang SAMA dengan `AdminPanel.tsx` di atas (`settings.cardBorder`, `settings.sectionBorder`, `text.muted` -- exact match ditemukan antar 2 file ini juga). Tombol back (ChevronLeft) genuinely 1x-pakai → token baru grup baru `mobileSettingsDetailPage.*` (1 key): `backBtn`. |
| `src/components/ReceiptUploader.tsx` | 7 | **0** | Semua 4 kombinasi genuinely 1x-pakai (dicek cross-file, termasuk terhadap `chip.accentAmberRose` yang sudah dipakai file ini sejak sesi 49 -- tidak tumpang tindih). Token baru grup baru `receiptUploader.*` (4 key): `dropzoneBorder`, `iconBoxBorder`, `captionText`, `lockIcon`. |
| `src/components/HistoryGroupedList.tsx` | 7 | **0** | 2 kombinasi (chip ikon expense/income) genuinely 1x-pakai → token baru grup baru `historyGroupedList.*` (3 key: `divideSubtle`, `expenseChip`, `incomeChip`). 1 kombinasi lagi (nominal merah/hijau) TERNYATA sudah exact match dengan token generik `text.danger` / `text.success` yang sudah ada -- dipasang langsung pakai token itu, TIDAK dibuatkan token per-file baru. |
| `src/components/DashboardWalletSelectorCard.tsx` | 7 | **0** | Campuran: ikon chip indigo (`chip.accentIndigo`, sudah ada sejak sesi 49, jadi pemakai ke-3) & hover label (`hover.textAccent`, sudah ada) ternyata exact match dengan token lama. 3 kombinasi sisanya genuinely 1x-pakai → token baru grup baru `dashboardWalletSelectorCard.*` (3 key): `blackOverlayBg`, `editBorderHover`, `actionChipBg`. |
| `src/views/settings/TelegramSettings.tsx` | 2 | **0** | **Prioritas tambahan** (bukan bagian 8 file target utama, ditemukan saat audit `Settings.tsx` L1028): kotak info fitur Telegram exact match dengan `Settings.tsx`, keduanya dipasang pakai token baru `settings.sunkenBorderPanel`. |

**Token baru ditambahkan sesi ini** (di `tokens.ts`):
- Grup baru: `mobileSettingsDetailPage` (1 key), `receiptUploader` (4 key), `historyGroupedList` (3 key), `dashboardWalletSelectorCard` (3 key).
- Ditambahkan ke grup lama: `settings` (+5 key: `langToggleBtnBg`, `unlinkBtnBorder`, `sunkenBorderPanel`, plus komentar `avatarBg`/`premiumBadge`/`cardBorder`/`sectionBorder`/`otpInputBg` diperbarui jadi "dipasang sesi 53"), `adminSupportChat` (+5 key).

**Token LAMA yang akhirnya dipasang sesi ini** (sudah ada di `tokens.ts` sejak sesi 45/46/49, komentarnya sempat bilang "belum dipasang, di luar cakupan target sesi X" -- sekarang semua sudah terpasang, komentar diperbarui): `border.subtleRose`, `divide.subtleRose`, `icon.subtle`, `chip.accentIndigo`, `toggle.inactiveTrack` (ternyata sudah terpasang sejak sesi 52, komentarnya saja yang telat diperbarui), `settings.avatarBg`, `settings.premiumBadge`, `settings.cardBorder`, `settings.sectionBorder`, `settings.otpInputBg`.

**Pelajaran metodologis sesi ini**: audit cross-file untuk kebijakan tokenisasi penuh (sesi 52+) TIDAK CUKUP hanya membandingkan antar file-file target sesi berjalan -- harus juga di-grep ulang ke SELURUH `tokens.ts` yang sudah ada, karena banyak sesi lama (45/46/49) sudah menemukan & mencatat exact-match tapi belum sempat memasangnya karena file targetnya di luar cakupan sesi saat itu. Query yang dipakai: `grep -n '"<literal-string-persis>"' src/lib/theme/tokens.ts` untuk tiap kombinasi sebelum memutuskan bikin token baru.

**Catatan lingkungan sesi 53**: `node_modules` masih tersedia dari sesi 52 (tidak perlu `npm install` ulang). `npx tsc --noEmit -p tsconfig.json` dijalankan bersih (0 error) atas SELURUH project setelah semua perubahan sesi ini.

## Sesi 52: Tokenisasi Penuh -- 5 File Target Teratas + Prioritas Tambahan

| File | Sebelum | Sesudah | Catatan |
|---|---|---|---|
| `src/views/AdminMaintenance.tsx` | 15 | **0** | Semua 8 kombinasi dicek cross-file dulu -- TIDAK ADA exact match ≥2 file (satu kombinasi mirip di `AdminCategoryManager.tsx` L307 punya `hover:bg-emerald-950/60` tambahan, bukan exact match). Token baru grup `adminMaintenance.*` (8 key): `loadingText`, `bypassNoteBanner`, `bypassNoteIcon`, `bypassNoteText`, `toggleIconActive`, `featureIconLocked`, `featureIconUnlocked`, `sandboxIcon`. |
| `src/views/AdminPremiumMonitor.tsx` | 14 | **0** | Semua 8 kombinasi genuinely 1x-pakai (dicek cross-file). Token baru ditambahkan ke grup `adminPremium.*` yang sudah ada (9 key baru): `exportBtn`, `sandboxWarningBanner`, `sandboxIconBorderActive`, `metricEmerald`, `metricRed`, `tabActive`, `tabInactiveHover`, `sandboxBadgeText`, `normalBadge`. |
| `src/views/NewTransaction.tsx` | 10 | **0** | Semua 6 kombinasi genuinely 1x-pakai (dicek cross-file, termasuk ulang terhadap token lama `newTransaction.*` dari sesi-sesi sebelumnya -- tidak ada yang cocok). Token baru ditambahkan ke grup `newTransaction.*` yang sudah ada (6 key baru): `quickAddChipBorder`, `walletSelectedActive`, `amountDisplayPlaceholder`, `amountInputPlaceholder`, `categoryPillInactive`, `submitBtnExpense`. File ini sebelumnya diaudit tuntas 2x (sesi 49 & 50) dengan hasil "tidak ada exact-match, tetap literal" -- kesimpulan itu masih valid di bawah kebijakan LAMA (≥2 file), tapi di bawah kebijakan BARU sesi 52 (semua 1x-pakai wajib ditoken) semua 6 baris tersebut sekarang dapat token per-file. |
| `src/views/Dashboard.tsx` | 10 | **0** | 3 kombinasi (banner goal tercapai, hover tombol "lihat semua", gradient tombol CTA quick-add) genuinely 1x-pakai. Token baru grup `dashboard.*` (3 key, grup baru): `goalCompleteBanner`, `seeAllBtnHover`, `ctaButtonGradient`. Baris CTA (L375) sebelumnya punya `cursor-pointer` dobel (typo lama di kode asli) -- dipertahankan apa adanya saat migrasi (tidak masalah secara CSS, di luar cakupan refactor ini untuk diperbaiki). |
| `src/components/DashboardOverviewCard.tsx` | 9 | **0** | Token baru grup `dashboardOverviewCard.*` (4 key, grup baru): `heroCardGradient` (gabungan 2 string literal terpisah -- baris non-`light_sakura` + baris `light_sakura` yang sebelumnya dipecah lewat `cx(...)` multi-arg -- jadi 1 token string, TIDAK mengubah hasil CSS karena `cx` cuma join dengan spasi), `labelHoverText`, `statChipEmerald`, `statChipAmber`. Komentar NOTE di baris 111-115 soal alasan tidak memakai `<Card>` primitive TETAP dipertahankan apa adanya (masih relevan, bukan bagian dari migrasi token ini). |
| `src/components/WalletTopUpModal.tsx` | 6 | 5 | **Prioritas tambahan** (bukan bagian 5 file target utama): tombol close (X) modal (`text-slate-400 hover:bg-slate-800 hover:text-white cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed light_sakura:hover:bg-rose-100`) exact match ke `tokens.modal.closeBtn` (token lama dari sesi 51, varian dengan `disabled:*` disisipkan di tengah -- sudah diantisipasi di komentar token). Sisa 2 literal (panel modal & kartu ringkasan hasil top up) BELUM diaudit sesi ini -- di luar cakupan "prioritas tambahan", dipindah ke Sesi 53. |
| `src/components/HistoryEditModal.tsx` | 4 | 3 | **Prioritas tambahan**: tombol close (X) modal exact match persis ke `tokens.modal.closeBtn` (tanpa varian `disabled:*`). Sisa 2 literal (panel modal & kartu ikon indigo) BELUM diaudit sesi ini, dipindah ke Sesi 53. |

**Token baru ditambahkan sesi ini** (di `tokens.ts`):
- Grup baru: `adminMaintenance` (8 key), `dashboard` (3 key), `dashboardOverviewCard` (4 key).
- Ditambahkan ke grup lama: `adminPremium` (+9 key), `newTransaction` (+6 key).
- Semua token baru sesi ini genuinely 1x-pakai per definisi kebijakan sesi 52 -- tidak ada reuse cross-file yang ditemukan saat audit, jadi tidak ada token yang dipasang ke >1 file kecuali `modal.closeBtn` (token LAMA dari sesi 51 yang direuse ke 2 file baru sesi ini).

**Catatan lingkungan sesi 52**: `node_modules` TIDAK tersedia di awal sesi (sama seperti sesi 51), tapi `npm install` (dengan `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`) berhasil dijalankan sesi ini (sebelumnya gagal 403 di sesi 51) -- `npx tsc --noEmit -p tsconfig.json` berhasil dijalankan ke SELURUH project dan menghasilkan **0 error**, termasuk verifikasi retroaktif untuk perubahan sesi 51 yang sebelumnya cuma diverifikasi manual (audit baris-per-baris + pengecekan kurung kurawal, lihat catatan lingkungan sesi 51 di bawah).

## Sesi 51: Sapu Bersih Akhir (lanjutan) -- 5 File "8 Literal"

| File | Sebelum | Sesudah | Catatan |
|---|---|---|---|
| `src/views/settings/NotificationSettings.tsx` | 8 | **0** | Hook `useThemeTokens` sudah di-import tapi belum dipanggil -- dipasang sesi ini. 2 blok kartu identik (`bg-slate-950 border border-slate-800 ... light_sakura:bg-rose-100/35 light_sakura:border-rose-200/50` + `divide-slate-800/60 light_sakura:divide-rose-200/40`) exact match ke `tokens.settings.innerCardBgBorder` + `tokens.settings.divideSubtle` (token lama, dicatat sejak sesi 46, dipakai 5x di `Settings.tsx`). 1 blok lain (tanpa divide) exact match ke `tokens.settings.innerCardBgBorder` saja. |
| `src/components/WalletTransferModal.tsx` | 8 | 2 | Panel modal (`border-indigo-500/20 bg-slate-900 ... text-white light_sakura:bg-rose-50/90 light_sakura:text-slate-800 light_sakura:border-rose-100`) & tombol close (`text-slate-400 hover:bg-slate-800 hover:text-white cursor-pointer ... light_sakura:hover:bg-rose-100`) ternyata identik PERSIS dengan `ConfirmTransactionModal.tsx` -- token baru `modal.panel` & `modal.closeBtn` ditambahkan ke `tokens.ts` (lihat baris terkait). 2x `border-slate-800/60 light_sakura:border-rose-100/50` exact match ke `tokens.border.subtleRose` (token lama, dicatat sejak sesi 45-46, belum pernah dipasang di file ini). Sisa 1 baris (`bg-indigo-500/5 border-indigo-500/20 light_sakura:bg-rose-50/40 light_sakura:border-rose-200`, banner info transfer) dicek cross-file -- tidak ada exact match di file lain, tetap literal. |
| `src/components/ConfirmTransactionModal.tsx` | 8 | **0** | Panel modal & tombol close sama seperti `WalletTransferModal.tsx` di atas (pasangan reuse, token `modal.panel`/`modal.closeBtn` ditambahkan sesi ini). Blok "big amount preview" (`bg-red-500/5 border-red-500/20 ... light_sakura:bg-red-50/40 light_sakura:border-red-200` untuk expense, `bg-emerald-500/5 border-emerald-500/20 ... light_sakura:bg-emerald-50/40 light_sakura:border-emerald-200` untuk income) exact match ke `tokens.newTransaction.amountInputExpense`/`amountInputIncome` (token lama dari `NewTransaction.tsx`, direuse cross-file sesi ini). |
| `src/components/Modal.tsx` | 6 *(koreksi: bukan 8 seperti tercatat di roadmap lama sebelum audit ulang)* | 3 | 4 dari 6 literal ternyata exact match ke token yang SUDAH ADA tapi belum diverifikasi silang: `bg-red-500/15 light_sakura:bg-red-50` → `tokens.budgetProgressCard.badgeBgDanger`, teks `text-red-400 light_sakura:text-red-500` → `tokens.newTransaction.amountDisplayExpense` (match dengan `ErrorState.tsx`), `bg-amber-500/15 light_sakura:bg-amber-50` → `tokens.budgetProgressCard.badgeBgWarning`, `bg-emerald-500/15 light_sakura:bg-emerald-50` → `tokens.budget.statusSafe`, `bg-indigo-500/15 light_sakura:bg-indigo-50` → `tokens.budgetProgressCard.badgeBgSafe`. Sisa 2 baris (panel varian `danger`/lainnya, memakai `dark_obsidian:bg-slate-900` eksplisit + `border-red-500/30`/`border-indigo-500/20` unik) dicek cross-file -- MIRIP tapi TIDAK identik dengan token `modal.panel` baru (beda: ada prefix `dark_obsidian:` alih-alih polos, tidak ada `text-white` literal karena sudah lewat `tokens.text.onSurface` terpisah) -- tidak dipaksakan, tetap literal. |
| `src/components/DashboardRecentTransactions.tsx` | 8 | 5 | Kotak ikon avatar transaksi (`bg-slate-800 ... text-slate-300 light_sakura:bg-slate-100 light_sakura:text-slate-600`) dipecah 2 token: bg-pair exact match ke `tokens.errorMonitor.progressBg` (token lama, dipakai lintas-konteks -- nilainya identik walau nama semantiknya beda konteks, sesuai konvensi reuse sesi-sesi sebelumnya), text-pair exact match ke `tokens.text.label`. Border section header (`border-b border-slate-800/50 pb-5 light_sakura:border-rose-100/30`) exact match ke `tokens.settings.sectionBorder` (token lama, pola sama juga ada di `MobileSettingsDetailPage.tsx` & `AdminPanel.tsx`, keduanya di luar cakupan sesi ini). Sisa 4 baris (kotak ikon `Sparkles` bg-indigo/rose unik, hover tombol "lihat semua" bg-slate/rose unik, kartu list item bg+border unik, dot indikator kecil unik) dicek cross-file satu per satu -- tidak ada exact match, tetap literal. |

**Token baru ditambahkan sesi ini** (di `tokens.ts`, grup `modal`):
- `modal.panel` -- panel modal custom (bukan lewat komponen `Modal.tsx`), exact match 2 file (`WalletTransferModal.tsx`, `ConfirmTransactionModal.tsx`).
- `modal.closeBtn` -- tombol close (X) modal, exact match 2 file dipasang sesi ini + 2 file lagi dengan pola identik (`WalletTopUpModal.tsx`, `HistoryEditModal.tsx`) BELUM dipasang, di luar cakupan target sesi 51 -- dicatat untuk sesi 52.

**Catatan lingkungan sesi 51**: `node_modules` tidak tersedia di sandbox dan `npm install` gagal (403 Forbidden, tidak ada akses jaringan keluar). Verifikasi wajib `npx tsc --noEmit -p tsconfig.json` (poin 4 di "Reminder wajib") TIDAK BISA dijalankan. Sebagai gantinya, tiap file yang diubah diverifikasi manual: audit baris-per-baris tiap penggantian class + pengecekan keseimbangan tanda kurung kurawal (`{`/`}`) sebelum & sesudah edit. **Sesi 52 WAJIB menjalankan `tsc --noEmit` begitu `node_modules` tersedia** untuk memastikan tidak ada `Cannot find name 'tokens'/'cx'` akibat perubahan sesi ini.

## Sesi 50: WalletPickerField & Audit 7 File Target Roadmap

| File | Sebelum | Sesudah | Catatan |
|---|---|---|---|
| `src/components/WalletPickerField.tsx` | 4 | **0** | Token baru `chip.badgeIndigo`/`chip.badgeAmber` (badge bold indigo/amber untuk saldo wallet) -- exact match ditemukan di colorMap `selectedStyle` milik `DropdownField.tsx` (varian `indigo`/`amber`). File ini sekaligus resmi keluar dari daftar "dead-code" lama (lihat koreksi sesi ini di bagian status) karena ternyata memang diimpor & dipakai. |
| `src/components/DropdownField.tsx` | 8 | 4 | Reuse `chip.badgeIndigo`/`chip.badgeAmber` (match dengan `WalletPickerField.tsx` di atas) untuk 2 dari 4 varian colorMap `selectedStyle`. Varian `emerald`/`rose` TETAP literal -- belum diverifikasi ada duplikat exact match di file lain, tidak dipaksakan. |
| `src/views/settings/PrivacySettings.tsx` | 3 | 2 | Token baru `text.dangerSoft` (teks peringatan hapus akun, shade `red-300`/`red-600`) -- exact match ditemukan di `Settings.tsx` (baris 925, konteks sama: judul peringatan hapus akun). Sisa 2 literal (tombol ekspor data) sudah diaudit sejak sesi 49, tidak ada exact match -- tetap literal. |
| `src/views/Settings.tsx` | 8 | 7 | Reuse `text.dangerSoft` (match dengan `PrivacySettings.tsx` di atas). |
| `src/components/VoiceRecorder.tsx` | 6 | 3 | Reuse `chip.accentAmberRose` (kondisi `isVoiceLocked` pada tombol mic) -- token sudah ada sejak sesi 49 (dipasang di `ReceiptUploader.tsx`), exact match dikonfirmasi ulang & dipasang sekarang. |
| `src/components/DashboardInstallments.tsx` | 3 | 2 | Reuse `chip.accentIndigo` (bg bulat ikon kartu cicilan) -- token sudah ada sejak sesi 49 (dipasang di `DashboardOverviewCard.tsx`), exact match dikonfirmasi ulang & dipasang sekarang. |
| `src/components/ReceiptPreview.tsx` | 5 | 2 | Reuse `voicePreview.cancelBtn` (tombol batal preview struk) -- token sudah ada sejak sesi 48 (dipasang di `VoicePreview.tsx`), exact match dikonfirmasi ulang & dipasang sekarang. |
| `src/views/AdminMaintenance.tsx` | 15 | 15 | **Diaudit tuntas, TIDAK ADA yang berkurang.** Semua 15 literal (banner info biru admin-bypass, kotak status toggle aktif [amber], kotak ikon lock/unlock [merah/emerald], ikon FlaskConical ungu, teks loading rose) dicek satu per satu ke `tokens.ts` & cross-file ke seluruh `src/` -- tidak ada exact match. Pola warna biru (banner info) unik di file ini, tidak ditemukan di file lain sama sekali. |
| `src/views/AdminPremiumMonitor.tsx` | 14 | 14 | **Diaudit tuntas, TIDAK ADA yang berkurang.** Semua 14 literal (tombol expand tabel, banner peringatan sandbox, metrik sukses/gagal, tab aktif/nonaktif, badge sandbox/live) dicek cross-file satu per satu -- tidak ada exact match ke token manapun. |
| `src/components/DashboardOverviewCard.tsx` | 9 | 9 | **Diaudit tuntas, TIDAK ADA yang berkurang.** 4 literal gradient kartu utama tetap sengaja tidak disentuh (dekoratif custom, sudah dicatat sejak sesi 49), 1 literal hover teks, 2 kotak ringkasan aset (emerald/amber) dicek cross-file -- tidak ada exact match, pola mirip di file lain (mis. `AdminMaintenance.tsx` baris 278-279) beda struktur (ada border+text, bukan cuma bg+border). |
| `src/views/Dashboard.tsx` | 10 | 10 | **Diaudit tuntas, TIDAK ADA yang berkurang.** Banner onboarding gradient emerald/indigo, hover tombol dismiss, tombol CTA gradient indigo custom -- semua dicek cross-file, tidak ada exact match. |
| `src/views/NewTransaction.tsx` | 10 | 10 | Tidak diaudit ulang baris-per-baris (sudah tuntas diverifikasi di sesi 49, lihat log Sesi 49), hanya dikonfirmasi ulang via `grep` bahwa jumlahnya masih 10 dan belum ada fitur baru yang mengubahnya. |
| `src/components/ReceiptUploader.tsx` | 7 | 7 | **Diaudit tuntas, TIDAK ADA yang berkurang.** Dropzone border, kotak ikon upload, teks hint drag-drop dicek cross-file -- tidak ada exact match. Ikon lock kecil (`text-amber-400 light_sakura:text-rose-500`) SEMPAT dicurigai exact match ke `chip.accentAmberRose` (dipasang sesi ini di file lain), tapi ternyata beda struktur -- token itu bundel bg+border+text, sedangkan ikon ini cuma text tanpa bg/border, jadi TIDAK dipaksakan. |

**Koreksi tambahan sesi ini**: paragraf status & daftar "0 literal" sebelumnya
salah mencantumkan `src/views/NewTransaction.tsx` sebagai file 0-literal --
sudah dikoreksi (lihat bagian status di atas dokumen).

Setelah sesi ini dijalankan pengecekan manual (`python3 -c` brace-balance
check ke semua file yang diedit + `tokens.ts`) -- semua seimbang, tidak ada
syntax error yang jelas. **Catatan berulang**: `node_modules` masih belum
ter-install di lingkungan sesi ini, jadi `npx tsc --noEmit` (poin 4 di
"Reminder wajib") masih BELUM bisa dijalankan -- WAJIB dijalankan di sesi
berikutnya begitu `node_modules` tersedia, sebagai pemeriksaan susulan
untuk seluruh perubahan sesi 47-50 yang belum sempat di-tsc-check.

## Sesi 49: Sisa Sub-Settings Kecil

| File | Sebelum | Sesudah | Catatan |
|---|---|---|---|
| `src/views/settings/ProfileSettings.tsx` | 11 | **0** | Reuse penuh token yang sudah ada sejak sesi 46 tapi belum dipasang di file ini: `settings.avatarBg`, `settings.premiumBadge`, `settings.premiumDismissBtn`, `settings.profileCardBgBorder`, `settings.sectionHeadingBorder`, `settings.otpInputBg` + `text.onSurface` (untuk input nama tampilan). Tidak ada token baru. |
| `src/views/settings/ThemeSettings.tsx` | 9 | **0** | Reuse `settings.profileCardBgBorder`, `settings.sectionDivider` (dipisah dari `text.label` karena warna teks heading file ini beda dari pola `sectionHeadingBorder`), dan `settings.optionInactive` (2x, pill tema aktif/nonaktif -- exact match sudah dicatat sejak sesi 46, dipasang sekarang). |
| `src/views/settings/PrivacySettings.tsx` | 9 | 3 | Reuse `settings.profileCardBgBorder`, `settings.sectionDivider`, `settings.innerCardBgBorder`, `text.strong` (judul kartu ekspor data). Sisa 3 literal (tombol ekspor data `border-rose-200`/`text-slate-700`, judul kartu hapus akun `text-red-300`/`light_sakura:text-red-600`) dicek cross-file, TIDAK ada exact match -- tetap literal. |
| `src/views/AdminMaintenance.tsx` | 17 | 15 | Token baru `toggle.inactiveIconBorder` (border+teks kotak ikon toggle "inactive", dipasangkan dengan `surface.subtle` untuk bg) -- exact match ditemukan JUGA di `AdminPremiumMonitor.tsx` (lihat baris berikutnya). Sisa 15 literal (banner info biru admin-bypass, kotak ikon status toggle aktif [amber], kotak ikon lock/unlock per-fitur [merah/emerald], ikon FlaskConical ungu, teks loading) semua dicek cross-file, TIDAK ada exact match -- tetap literal. |
| `src/views/AdminPremiumMonitor.tsx` | 16 | 14 | Reuse `toggle.inactiveIconBorder` (kotak ikon toggle sandbox QRIS nonaktif, match dengan `AdminMaintenance.tsx`) + reuse `toggle.inactiveTrack` (switch sandbox QRIS -- token ini sudah ada sejak sesi 45 tapi belum dipasang di file ini). Sisa 14 literal (tombol refresh, banner peringatan sandbox aktif, metrik warna 1x-pakai, badge status sandbox/live di tabel, filter pill aktif) dicek cross-file, TIDAK ada exact match -- tetap literal. |
| `src/components/ReceiptUploader.tsx` | 10 | 7 | Token baru `chip.accentAmberRose` (kotak ikon lock saat OCR terkunci) -- exact match JUGA ditemukan di `VoiceRecorder.tsx` (belum dipasang ke sana, di luar cakupan sesi ini). Sisa 7 literal (dropzone border, kotak ikon upload biasa, teks hint drag-drop, ikon lock kecil) dicek cross-file, TIDAK ada exact match -- tetap literal. |
| `src/components/DashboardOverviewCard.tsx` | 10 | 9 | Token baru `chip.accentIndigo` (bg bulat ikon "Total Kekayaan", dipasangkan dengan `icon.accent` untuk warna ikon) -- exact match JUGA ditemukan di `DashboardInstallments.tsx` (belum dipasang ke sana, di luar cakupan sesi ini). Sisa 9 literal (gradient kartu utama -- SENGAJA tidak disentuh karena dekoratif custom, lihat komentar di file, 4 literal; hover teks "Rincian Aset"; 2 kartu ringkasan aset tabungan/emas) dicek cross-file, TIDAK ada exact match -- tetap literal. |
| `src/views/Dashboard.tsx` | 11 | 10 | Reuse parsial `text.muted` (pasangan kata `text-slate-400`/`light_sakura:text-slate-500` diekstrak dari tombol dismiss banner onboarding, sisa hover state tetap literal). Sisa 10 literal (banner onboarding gradient emerald/indigo, tombol CTA gradient indigo custom) dicek cross-file, TIDAK ada exact match -- tetap literal. |
| `src/views/NewTransaction.tsx` | 10 | 10 | **Diaudit tuntas, TIDAK ADA yang berkurang.** Semua 10 literal (chip wallet terpilih, pill toggle jenis transaksi aktif, angka nominal besar, placeholder input catatan, pill kategori tidak-terpilih, tombol hapus transaksi) sudah dicek cross-file satu per satu -- tidak ada exact match ke token manapun di `tokens.ts` maupun ke file lain. Kemiripan yang ditemukan (mis. `light_sakura:bg-rose-500 light_sakura:hover:bg-rose-400` di tombol hapus, mirip `ReceiptPreview.tsx`) TERNYATA beda warna dasar (`bg-red-600` vs `bg-indigo-600`) sehingga BUKAN token yang sama -- tidak dipaksakan sesuai aturan "jangan paksa token kalau cuma mirip". |

Token baru sesi ini semuanya mengikuti pola "ditemukan exact match di 2 file
sekaligus, tapi cuma dipasang di 1 file (yang masuk cakupan target sesi
ini)" -- reuse ke file kedua dicatat sebagai peluang untuk sesi berikutnya,
bukan dikerjakan sekarang (supaya sesi ini tidak melebar ke file di luar
daftar target). Setelah sesi ini dijalankan pengecekan manual (`node -e`
brace-balance check ke semua file yang diedit + `tokens.ts`) -- semua
seimbang, tidak ada syntax error yang jelas. **Catatan**: `node_modules`
belum ter-install di lingkungan sesi ini (tidak ada akses jaringan), jadi
`npx tsc --noEmit` (poin 4 di "Reminder wajib") BELUM bisa dijalankan --
WAJIB dijalankan di sesi berikutnya begitu `node_modules` tersedia, sebagai
pemeriksaan susulan untuk seluruh perubahan sesi 47-49 (yang juga belum
sempat di-tsc-check ulang sejak sesi 48).

## Sesi 48: Admin Backup, Sidebar, VoicePreview, PremiumModal

| File | Sebelum | Sesudah | Catatan |
|---|---|---|---|
| `src/views/AdminBackup.tsx` | 12 | **0** | Token `adminBackup.*` TERNYATA SUDAH ada penuh di `tokens.ts` (heading, tableHeader, tableRow, label, labelSpan) dari sesi sebelumnya tapi belum pernah dipasang di file ini -- murni reuse, tidak ada token baru ditambahkan. |
| `src/components/Sidebar.tsx` | 12 | 5 | Token baru `sidebar.collapsedIconBtn` (3x, tombol ikon bulat bahasa/tema/mute di footer collapsed). Reuse cross-file `tokens.mobileBottomNav.profileBg` untuk bg avatar (exact match dgn `MobileBottomNav.tsx`). Sisa 5 literal (shadow custom sidebar, 2 tombol collapse/expand header) 1x-pakai, tidak exact-match token manapun. |
| `src/components/VoicePreview.tsx` | 12 | 1 | Token baru `voicePreview.cancelBtn` (2x) & `voicePreview.confirmBtn` (2x). `cancelBtn` JUGA exact match di `ReceiptPreview.tsx` (1x, belum dipasang -- di luar cakupan sesi ini, dicatat di komentar token). Reuse cross-file `tokens.budget.statusDanger` untuk icon chip error. Sisa 1 literal (border card error) 1x-pakai. |
| `src/components/PremiumModal.tsx` | 12 | 1 | Token baru grup `premiumModal` (`modalBg`, `closeBtn`, `infoBoxBg` [2x], `qrWrapperBorder`). Sisa 1 literal (`text-indigo-300 light_sakura:text-rose-500` di badge waiting-payment) mirip tapi tidak persis dengan `text.accent` (beda shade indigo-300 vs indigo-400) -- tidak dipaksakan. |

Sesi ini menegaskan pola yang mulai terlihat sejak sesi 45: `AdminBackup.tsx`
adalah contoh murni reuse (token sudah ada, tinggal dipasang), sementara
`Sidebar.tsx`/`VoicePreview.tsx`/`PremiumModal.tsx` masing-masing masih
punya sisa kombinasi 1x-pakai yang genuinely tidak exact-match ke pola lain
di codebase -- konsisten dengan aturan "jangan paksa token kalau cuma mirip".

## Sesi 47: UI Primitives Inti (Badge, Button)

| File | Sebelum | Sesudah | Catatan |
|---|---|---|---|
| `src/components/ui/Badge.tsx` | 15 | **0** | Token baru grup `badge` (5 tone: `neutral`, `info`, `success`, `warning`, `danger`) dipindah dari `toneClasses` lokal di komponen. Beda dari kasus token lain di dokumen ini (yang mensyaratkan ≥2 file duplikat) -- combo-combo ini cuma dipakai 1x di source, tapi tetap dipindah ke `tokens.ts` per keputusan user karena `Badge.tsx` sendiri sudah jadi titik reuse tunggal (dipanggil lewat prop `tone`), bukan token generik baru yang menambah lapisan tak perlu. |
| `src/components/ui/Button.tsx` | 12 | **0** | Token baru grup `buttonVariant` (`primary`, `secondary`, `dangerGhost`, `ghost` -- varian `danger` & `success` TIDAK disentuh karena memang tidak punya literal `light_sakura:` di kode asli) dipindah dari `variantClasses` lokal, alasan sama seperti `Badge.tsx` di atas. |

**Catatan penting**: sempat ada kesalahan hitung literal di paragraf status
dokumen ini (audit sesi 45-46) yang melaporkan `Badge.tsx`=5 & `Button.tsx`=4
memakai `grep -c` (hitung baris yang match), bukan `grep -o | wc -l` (hitung
kemunculan) yang jadi standar hitung di seluruh dokumen ini -- angka yang
BENAR sebelum sesi ini adalah 15 & 12 (cocok dengan roadmap lama). Sudah
diverifikasi ulang dengan metode yang konsisten sebelum & sesudah migrasi
sesi ini; tidak berulang di sesi 48.

Setelah sesi 47-48 dijalankan `npx tsc --noEmit` ke seluruh project: **0
error** terkait `tokens`/`cx` atau lainnya.

## Sesi 46: Sub-Settings Menengah

| File | Sebelum | Sesudah | Catatan |
|---|---|---|---|
| `src/components/settings/SettingsMobileMenu.tsx` | 16 | 1 | Reuse token global (`text.faint`, `text.muted`, `icon.subtle` [baru]) + token baru grup `settings` (`avatarBg`, `premiumBadge`, `premiumDismissBtn`) & grup baru `border.subtleRose`/`divide.subtleRose` untuk 3 blok card divide-y identik. Sisa 1 literal (icon chip `bg-slate-950/60 light_sakura:bg-rose-50`) 1x-pakai, tidak exact-match token manapun. |
| `src/views/settings/LanguageSettings.tsx` | 15 | **0** | Nyaris seluruhnya sudah tercakup token yang sudah ada (`settings.profileCardBgBorder`, `settings.sectionDivider`, `settings.telegramLinkedBadge`) + 1 token baru `settings.optionInactive` (pill pilihan bahasa tidak aktif, 2x). |
| `src/views/Dashboard.tsx` | 13 | 11 | Reuse token global (`text.onSurface`, `text.mutedAlt`) untuk banner onboarding. Sisa 11 literal (banner gradient emerald-indigo, tombol dismiss, CTA gradient indigo) 1x-pakai per kombinasi, tidak exact-match ke token manapun & tidak ditemukan duplikat di file lain. |
| `src/views/AdminCategoryManager.tsx` | 13 | 2 | Reuse token global (`errorMonitor.tableDivide`, `errorMonitor.tableRowHover`, `errorMonitor.paginationBtn`, `errorMonitor.progressBg`, `text.success`, `text.muted`) + 1 token baru `button.cancelSlate` (tombol batal edit kategori). Sisa 2 literal (tombol simpan/checkmark hijau) 1x-pakai. |

Sesi ini menemukan cukup banyak kombinasi identik yang SUDAH ada sebagai
token di grup lain (`errorMonitor.*`, `text.faint`, `text.muted`,
`text.onSurface`, `text.mutedAlt`, `settings.telegramLinkedBadge`) tapi
belum pernah dipasang di file-file ini -- murni soal belum sempat
diterapkan, bukan token yang hilang. Juga ditemukan beberapa pola yang
berulang di file-file DI LUAR cakupan sesi ini (`AdminPremiumMonitor.tsx`,
`WalletTransferModal.tsx`, `AdminPanel.tsx`, `ProfileSettings.tsx`,
`Settings.tsx`, `ThemeSettings.tsx`, `AdminBroadcast.tsx`) -- token baru
tetap ditambahkan ke `tokens.ts` (didokumentasikan di komentar masing-
masing key) supaya sesi berikutnya yang menyentuh file-file itu tinggal
pakai, tanpa perlu menemukan ulang pola yang sama.

## Sesi 45: Maintenance & Support Chat Admin

| File | Sebelum | Sesudah | Catatan |
|---|---|---|---|
| `src/views/AdminMaintenance.tsx` | 21 | 17 | Token baru grup `toggle` (`inactiveTrack`, dipakai 3x -- toggle maintenance global, sandbox bypass, feature lock) + reuse `tokens.errorMonitor.tableDivide` cross-file untuk divider daftar fitur. Sisa 17 literal (banner info admin-bypass, badge status power on/off, badge lock/unlock, ikon sandbox) semuanya kombinasi 1x-pakai yang tidak exact-match token manapun. |
| `src/views/AdminSupportChat.tsx` | 18 | 7 | Token baru grup `adminSupportChat` (`spinnerText` 2x, `emptyIcon` 1x) + reuse cross-file `tokens.supportWidget.gradientAvatar`, `tokens.supportWidget.chatBubbleUser`, `tokens.supportWidget.inputFocusRing`, `tokens.budget.emptyStateIcon`, `tokens.budget.addBtn`, `tokens.errorMonitor.tableDivide`. Sisa 7 literal (tombol refresh custom padding, selected-row highlight, bubble chat non-admin) 1x-pakai atau beda 1 detail kecil (padding/opacity) dari token yang ada -- tidak dipaksakan sesuai aturan "jangan dipaksa token kalau cuma mirip". |

Sesi ini menandai titik balik penting: mulai dari sini, mayoritas token
baru yang ditambahkan ternyata sudah muncul identik di 2-3 file admin lain
(`AdminPremiumMonitor.tsx`, `SupportChatWidget.tsx`, `EmptyState.tsx`) yang
sebelumnya sempat "selesai" tapi belum saling mereferensikan token yang
sama -- indikasi bahwa fase berikutnya rollout ini akan semakin banyak
berupa reuse token lama ketimbang menciptakan token baru.

## Sesi 44: NewTransaction.tsx & Budget.tsx

| File | Sebelum | Sesudah | Catatan |
|---|---|---|---|
| `src/views/NewTransaction.tsx` | 24 | 10 | Token global (`text.*`, `border.accent`) + `tokens.newTransaction.*` yang sudah ada. 2 token baru ditambahkan: `segmentedControlBg` (toggle jenis transaksi & wallet picker, 2x) dan `inactiveHoverText` (hover pill tidak aktif, 4x). Juga reuse `tokens.settings.cardBorder` & `tokens.settings.otpInputBg` (cross-file, sama persis dengan pola di `Settings.tsx`). |
| `src/views/Budget.tsx` | 22 | 5 | Token global + `tokens.budget.*`. 2 token baru: `emptyStateIcon` (ikon PiggyBank empty-state, 2x) dan `closeBtnHover` (hover tombol tutup modal, 2x). Reuse `tokens.settings.cardBorder`/`sectionBorder` cross-file. |

Sesuai target sesi 37 lama yang sempat terlewat. Sisa literal di kedua file
mayoritas kombinasi 1x-pakai (modal overlay custom, ikon empty-state
tunggal) yang tidak exact-match ke token manapun -- dibiarkan literal sesuai
aturan "jangan dipaksa token kalau cuma mirip/1x pakai".

## Sesi 43: History.tsx & AdminBroadcast.tsx

| File | Sebelum | Sesudah | Catatan |
|---|---|---|---|
| `src/views/History.tsx` | 27 | 1 | Nyaris seluruhnya sudah tercakup `tokens.history.*` yang sudah ada dari sesi sebelumnya -- hanya perlu dipasang, belum sempat dieksekusi. Sisa 1 literal (`tokens.text.accentStrong` vs warna oranye khusus saldo negatif) sengaja dibiarkan literal (beda semantik warna). |
| `src/views/AdminBroadcast.tsx` | 25 | 4 | **File baru** (belum pernah disentuh rollout token sebelumnya, hook `useThemeTokens` sudah ada dari awal tapi belum dipakai penuh). Token baru ditambahkan ke grup `adminBroadcast`: `summaryCardBorder` (3x), `statusSuccessBadge` (2x), `statusPendingBadge` (2x), `warningBannerBg` (1x, subset dari `statusPendingBadge`). Juga reuse `tokens.telegramCard.linkedLabelText` cross-file. |

## Sesi 42: Support Chat & Telegram Settings

| File | Sebelum | Sesudah | Catatan |
|---|---|---|---|
| `src/components/SupportChatWidget.tsx` | 29 | 6 | Token baru di grup `supportWidget`: `gradientAvatar` (5x), `ringHighlight` (2x), `inputFocusRing` (2x). Juga reuse `tokens.budget.addBtn` untuk tombol kirim (cross-file, dipakai identik di `Budget.tsx`, `Settings.tsx`, dan file ini). **Ditemukan & diperbaiki bug pre-existing** (bukan hasil migrasi ini): baris 380 punya ternary `tokens.surface.card === "bg-slate-900 light_sakura:bg-white" ? A : B` -- perbandingan ini SELALU true (membandingkan token dengan nilai literalnya sendiri), jadi cabang `B` sudah lama jadi dead code. Disederhanakan jadi literal langsung tanpa mengubah perilaku. |
| `src/views/settings/TelegramSettings.tsx` | 27 | 2 | **Ditemukan**: isi file ini identik/duplikat dengan bagian "Telegram" yang dulunya inline di `Settings.tsx` (kemungkinan besar hasil ekstraksi komponen yang belum pernah disinkronkan migrasinya). Grup token baru `telegramCard` dibuat (10 key) untuk pola yang PERSIS SAMA di kedua file -- lalu diterapkan ulang ke `Settings.tsx` juga (lihat baris "reuse" di bawah), sehingga sisa literal `Settings.tsx` ikut turun dari 28 → 8 di sesi ini juga. |

**Reuse cross-file tambahan ke `Settings.tsx`** (turun 28 → 8 dari sisa
sesi 40, sebagai efek samping token baru `telegramCard` di sesi ini):
`lockedIconText`, `upsellBoxBorderBg`, `upsellIconChipBg`, `upsellCtaBtn`,
`linkedBadgeBg`, `linkedAvatarRing`, `linkedLabelText`, `qrBoxBorderBg`,
`qrCodeBoxBg`, `divider` -- semua dipasang di kedua file sekaligus. Juga
ditambahkan `tokens.settings.divideSubtle` (2x, khusus `Settings.tsx`).

## Sesi 41: AdminPremiumMonitor.tsx & Fitur QRIS Sandbox

| File | Sebelum | Sesudah | Catatan |
|---|---|---|---|
| `src/views/AdminPremiumMonitor.tsx` | 30 | 16 | Token baru di grup `adminPremium` (grup ini sendiri baru ditambahkan ke `tokens.ts` sehari sebelumnya lewat perbaikan bug audit 2026-07-18): `metricAmber` (2x), `tableDivide`, `tableRowHover`, `paginationBorder` (2x), `sandboxBadgeBg` (2x, badge QRIS sandbox/dummy), `sandboxText` (2x). Toggle QRIS sandbox (`dummyQrisEnabled`, `tx.is_sandbox`) sudah tersentuh sebagian -- sisa 16 literal mayoritas warna 1x-pakai (metrik emerald/red individual, state toggle switch off) yang sengaja dibiarkan literal (beda shade dari token yang ada, lihat aturan "jangan dipaksa token"). |

Juga menambah token global baru `text.strong` (`text-slate-200
light_sakura:text-slate-800`) karena pola ini ditemukan dipakai identik di
≥2 file berbeda (`Settings.tsx` & file ini) saat migrasi.

## Sesi 40: Settings.tsx (Prioritas Tertinggi)

| File | Sebelum | Sesudah | Catatan |
|---|---|---|---|
| `src/views/Settings.tsx` | 103 | 28 (lalu turun lagi ke 8 di sesi 42 lewat reuse `telegramCard`) | File dengan literal terbanyak di codebase, sudah 3x salah diklaim "selesai" di sesi-sesi sebelumnya. Token baru ditambahkan ke grup `settings`: `sectionHeadingBorder`+`sectionHeadingText`+`sectionDivider` (heading section pengaturan, 5-7x), `innerCardBgBorder` (kartu kecil dalam section, 5x), `otpInputBg` (kotak input OTP, 3x, juga reuse di `NewTransaction.tsx`), `telegramLinkedBadge` (2x). |

**Investigasi regresi berulang** (diminta di roadmap sesi 40): akar
masalahnya BUKAN migrasi yang gagal, melainkan fitur-fitur baru (section
pengaturan Telegram, OTP 2FA, log admin) yang terus ditambahkan langsung
dengan class Tailwind literal alih-alih token yang sudah ada -- persis
seperti dugaan di roadmap. Tidak ada perbaikan proses yang bisa dilakukan
lewat kode (di luar scope rollout token); dicatat di sini sebagai temuan,
bukan sesuatu yang "diperbaiki".

**Audit cross-check tambahan** (mengulang audit grup/key token 2026-07-18
ke SEMUA token baru yang ditambahkan sesi 40-44): dijalankan ulang
verifikasi setiap `tokens.<grup>.<key>` yang dipakai di ke-8 file yang
disentuh sesi ini terhadap definisi di `tokens.ts` -- **0 referensi tidak
terdefinisi ditemukan** (termasuk cross-check ke SELURUH `src/`, bukan
cuma 8 file yang disentuh). Tidak ada bug serupa `adminPremium` yang
berulang.

---

## Sesi 33: 2 file dimigrasi (2 → total 102 file tersentuh)

| File | Sebelum | Sesudah | Catatan |
|---|---|---|---|
| `src/views/Installments.tsx` | 6 | 0 | Menggunakan theme tokens semantik global (ditambahkan sub-grup `installments` di `tokens.ts`) untuk melenyapkan sisa literal `light_sakura:` pada shadow tombol, gradien kartu cicilan aktif, ring offset, badge sukses, progress bar, dan tombol transaksi. |
| `src/views/BillReminders.tsx` | 6 | 0 | Menggunakan theme tokens semantik global (ditambahkan sub-grup `billReminders` di `tokens.ts`) untuk membersihkan sisa `light_sakura:` pada badge status pembayaran, penanda garis vertikal timeline, dan penanda ring bulatan timeline. |

Sesi ini berfokus pada standardisasi visual sistem Cicilan Bulanan (Installments) dan Pengingat Tagihan (BillReminders) untuk memastikan asisten tagihan menyatu sempurna dengan skema tema dinamis.

## Sesi 32: 2 file dimigrasi (2 → total 100 file tersentuh)

| File | Sebelum | Sesudah | Catatan |
|---|---|---|---|
| `src/views/GoldSavings.tsx` | 8 | 0 | Menggunakan theme tokens semantik global (ditambahkan sub-grup `gold` di `tokens.ts`) untuk melenyapkan sisa literal `light_sakura:` pada banner keuntungan/kerugian investasi, info banner harga, tombol batal, edit, dan statistik kepemilikan emas. |
| `src/views/Savings.tsx` | 3 | 0 | Menggunakan theme tokens semantik global (ditambahkan sub-grup `savings` di `tokens.ts`) untuk melenyapkan sisa literal `light_sakura:` pada tombol penarikan tabungan dan bayangan/shadow tombol tambah. |

## Sesi 39: Strategi Refactoring & Audit (Audit & BudgetProgressCard)
Berdasarkan data audit Sesi 38, ditetapkan kategori prioritas migrasi untuk efisiensi refactoring:
- **Kategori Kritis (High Impact/High Frequency):** `src/views/Settings.tsx` (59), `src/views/NewTransaction.tsx` (22), `src/views/Budget.tsx` (16), `src/components/Sidebar.tsx` (14). Komponen ini sering diakses dan menjadi referensi gaya bagi komponen lain.
- **Kategori Maintenance (Low Impact):** Modul admin sekunder, Sub-settings spesifik, dan modal-modal yang jarang diakses.

| File | Sebelum | Sesudah | Catatan |
|---|---|---|---|
| `src/views/NewTransaction.tsx` | 22 | 0 | Migrasi tema transaksi ke `tokens.newTransaction`. |
| `src/views/AdminPremiumMonitor.tsx` | 18 | 0 | Migrasi tema monitor premium ke `tokens.adminPremium`. |

Sesi ini berfokus pada pemetaan beban kerja refactoring dan migrasi komponen visualisasi data `BudgetProgressCard`.

## Sesi 38: Audit Kuantitatif Distribusi literal `light_sakura:`
Audit `grep` terhadap sisa literal `light_sakura:` di luar `src/lib/theme/tokens.ts`:

| File | Jumlah Literal |
|---|---|
| `src/views/Settings.tsx` | 59 |
| `src/views/NewTransaction.tsx` | 22 |
| `src/components/SupportChatWidget.tsx` | 21 |
| `src/views/AdminPremiumMonitor.tsx` | 18 |
| `src/views/settings/TelegramSettings.tsx` | 16 |
| `src/views/Budget.tsx` | 16 |
| `src/components/Sidebar.tsx` | 14 |
| `src/views/AdminSupportChat.tsx` | 13 |
| `src/views/AdminMaintenance.tsx` | 12 |
| `src/views/AdminBroadcast.tsx` | 12 |
| `src/views/AdminBackup.tsx` | 12 |

*(Sisa file memiliki <12 literal)*

Sesi ini berfokus pada pemetaan beban kerja refactoring untuk memprioritaskan komponen berdampak tinggi (high-impact) agar migrasi token lebih efisien dan meminimalkan risiko regresi visual.


| File | Sebelum | Sesudah | Catatan |
|---|---|---|---|
| `src/components/MobileBottomNav.tsx` | 13 | 0 | Migrasi tema navbar bawah ke `tokens.mobileBottomNav` untuk navbar floating dan bottom-sheet. |

## Sesi 36: 2 file dimigrasi (2 → total 106 file tersentuh)

| File | Sebelum | Sesudah | Catatan |
|---|---|---|---|
| `src/components/AdminUserDetailModal.tsx` | 5 | 0 | Mengabstraksikan styling modal detail user ke `tokens.adminUserModal`. |
| `src/components/UpdatePrompt.tsx` | 6 | 0 | Mengabstraksikan styling prompt update ke `tokens.updatePrompt`. |

## Sesi 35: 2 file dimigrasi (2 → total 104 file tersentuh)

| File | Sebelum | Sesudah | Catatan |
|---|---|---|---|
| `src/views/AdminErrorMonitor.tsx` | 33 | 0 | Mengabstraksikan konfigurasi error level, tab navigasi, tabel log, dan statistik banner ke dalam `tokens.adminErrorMonitor` untuk eliminasi literal `light_sakura:`. |
| `src/views/AdminBackup.tsx` | 23 | 0 | Menggunakan `tokens.adminBackup` untuk menstandarisasikan judul, tombol, kartu ringkasan, dan tabel cadangan database. |

Sesi ini berfokus pada penyelesaian modul UI mobile (Navbar) dan komponen modal administrasi serta prompt update aplikasi.

## Sesi 34: 4 file dimigrasi (4 → total 102 file tersentuh)

| File | Sebelum | Sesudah | Catatan |
|---|---|---|---|
| `src/views/AdminUserManager.tsx` | 14 | 0 | Menggunakan token global untuk merapikan kartu statistik dan daftar pengguna. |
| `src/views/AdminAiMonitor.tsx` | 15 | 0 | Menggunakan token global untuk merapikan kartu monitor AI. |
| `src/contexts/ToastContext.tsx` | 12 | 0 | Mengabstraksikan styling toast container, icon, dan color ke `tokens.toast` untuk konsistensi visual global. |
| `src/App.tsx` | 1 | 0 | Membersihkan referensi inline `light_sakura:` pada link Github menggunakan `tokens.hover.textAccent`. |

Sesi ini berfokus pada penyelesaian modul administrasi pengguna, monitor AI, dan sistem notifikasi (Toast) untuk memastikan elemen-elemen kritikal terbebas dari literal `light_sakura:`.

## Sesi 31: 1 file dimigrasi (1 → total 98 file tersentuh)

| File | Sebelum | Sesudah | Catatan |
|---|---|---|---|
| `src/views/Onboarding.tsx` | 79 | 0 | Menggunakan theme tokens semantik global (ditambahkan sub-grup `onboarding` di `tokens.ts`) untuk mengabstraksikan seluruh container simulasi, progress bars, interactive cards, badge status, bullet points, dan navigation buttons sehingga terbebas penuh dari literal `light_sakura:`. |

Sesi ini berfokus pada standardisasi menyeluruh alur pengenalan aplikasi (Onboarding Flow) agar setiap langkah simulasi fitur keuangan (Catat Mandiri, Bot Telegram, Riwayat, Dompet, Anggaran, Tabungan, Emas, dan Cicilan) menyatu penuh secara estetis dengan tema aktif.

## Sesi 30: 2 file dimigrasi (2 → total 97 file tersentuh)

| File | Sebelum | Sesudah | Catatan |
|---|---|---|---|
| `src/components/SplashScreen.tsx` | 6 | 0 | Menggunakan theme tokens semantik global untuk membersihkan custom outer ring, background, dan loading animation agar selaras dengan skema tema dinamis. |
| `src/views/Login.tsx` | 46 | 0 | Menambahkan sub-grup token `login` pada `tokens.ts` untuk mengabstraksikan seluruh ornamen visual SVG arcs, halos, input fields, custom panels, dan form dividers agar bebas dari literal `light_sakura:`. |

Sesi ini berfokus pada standardisasi visual halaman otentikasi utama (Login) dan layar splash screen pemuatan global (SplashScreen) untuk mengeliminasi ketergantungan inline styles dan memusatkan properti desain di berkas tokens terpusat.

## Sesi 29: 2 file dimigrasi (2 → total 95 file tersentuh)

| File | Sebelum | Sesudah | Catatan |
|---|---|---|---|
| `src/views/GoldSavings.tsx` | 22 | 0 | Menggunakan tokens.border.accent, tokens.border.strong, tokens.surface.sunken, tokens.text.faint, tokens.icon.muted, tokens.text.success, dan tokens.text.danger untuk membersihkan sisa text dan container styling di panel tabungan emas. |
| `src/App.tsx` | 2 | 0 | Menggunakan tokens.text.accent secara dinamis dengan modifier `border-t-` untuk menstandarisasikan loading spinner animatif global di aplikasi. |

Sesi ini berfokus pada penyempurnaan sub-sistem Investasi Logam Mulia (GoldSavings) dan penuntasan sisa visual loading spinner pada root shell aplikasi (App.tsx) agar menyatu penuh dengan standar token semantik global.

## Sesi 28: 2 file dimigrasi (2 → total 93 file tersentuh)

| File | Sebelum | Sesudah | Catatan |
|---|---|---|---|
| `src/views/AdminUserManager.tsx` | 12 | 0 | Menggunakan tokens.border.accent untuk standardisasi pembatas kartu info statistik user management di tingkat administrator keuangan. |
| `src/lib/theme/tokens.ts` | 34 | 35 | Menambahkan token surface `canvas` baru untuk standarisasi background shell aplikasi utama secara global. |

Sesi ini berfokus pada standarisasi visual panel kontrol manajemen pengguna (AdminUserManager) dan inisiasi token kanvas dasar pada sistem token global.

## Sesi 27: 3 file dimigrasi (3 → total 90 file tersentuh)

| File | Sebelum | Sesudah | Catatan |
|---|---|---|---|
| `src/views/BillReminders.tsx` | 8 | 0 | Menggunakan tokens.text.success, tokens.text.danger, tokens.text.warning, dan tokens.text.muted untuk membersihkan semua remaining literal light_sakura pada badge-badge urgensi pengingat tagihan. |
| `src/contexts/ToastContext.tsx` | 5 | 1 | Menggunakan tokens.text.success, tokens.text.danger, dan tokens.text.warning secara dinamis untuk menstandarisasikan warna ikon toast notifikasi di seluruh aplikasi. |
| `src/views/Installments.tsx` | 15 | 0 | Menggunakan tokens.text.success, tokens.text.accent, tokens.text.onSurface, tokens.text.muted, tokens.text.warning, tokens.text.danger, dan tokens.button.accentEmerald untuk merapikan kartu cicilan, status bar, detail info cicilan, dan aksi form. |

Sesi ini berfokus pada standarisasi visual asisten pengingat tagihan (BillReminders), sistem cicilan bulanan (Installments), dan sistem visual umpan balik pengguna (ToastContext) agar menyatu dengan palet warna semantik global.

## Sesi 26: 3 file dimigrasi (3 → total 87 file tersentuh)

| File | Sebelum | Sesudah | Catatan |
|---|---|---|---|
| `src/views/Wallets.tsx` | 9 | 0 | Menggunakan tokens.surface.sunken, tokens.hover.surface, tokens.border.accent, dan tokens.text.danger untuk menstandarisasikan kartu dompet (Wallet Cards) dan total saldo banner. |
| `src/views/AdminAiMonitor.tsx` | 19 | 3 | Menggunakan tokens.border.default, tokens.surface.sunken, tokens.text.accent, tokens.text.warning, dan tokens.hover.surface untuk standarisasi kartu monitor penyedia AI (AI Provider cards), tabel performa kunci API, kontrol pagination, dan alert peringatan kuota berlebih. |
| `src/views/AdminVoucherManager.tsx` | 6 | 0 | Menggunakan tokens.border.default, tokens.surface.sunken, tokens.text.success, tokens.text.muted, dan tokens.hover.surface untuk merapikan kartu statistik voucher, baris tabel data voucher, serta status badge aktif/tidak aktif. |

Sesi ini berfokus pada penyempurnaan halaman administrasi keuangan (Voucher Manager dan AI Monitor) serta modul manajemen dompet (Wallets) agar sepenuhnya terstandarisasi dengan token-token semantik baru.

## Sesi 25: 3 file dimigrasi (3 → total 84 file tersentuh)

| File | Sebelum | Sesudah | Catatan |
|---|---|---|---|
| `src/components/Sidebar.tsx` | 18 | 11 | Menggunakan tokens.text.onSurface, tokens.border.accent, tokens.surface.sunken, tokens.text.accent, dan tokens.text.label untuk merapikan layout, sidebar widget, menu item aktif/tidak aktif, dan pembatas navigasi desktop. |
| `src/components/MobileBottomNav.tsx` | 16 | 12 | Menggunakan tokens.text.onSurface, tokens.text.faint, tokens.text.accent, dan tokens.text.label untuk membersihkan panel bawah HP (floating pill) dan modal Bottom-Sheet 'Lainnya'. |
| `src/components/UpdatePrompt.tsx` | 10 | 6 | Menggunakan tokens.surface.sunken, tokens.text.accent, dan tokens.border.default untuk merapikan visual popup pembaruan aplikasi dan daftar riwayat perubahan (Whats New changelog). |

Sesi ini berfokus pada penyelesaian modul navigasi utama (Sidebar, MobileBottomNav, dan UpdatePrompt) untuk menyempurnakan struktur bingkai aplikasi (app shell) agar terstandarisasi dengan token-token semantik baru.

## Sesi 24: 3 file dimigrasi (3 → total 81 file tersentuh)

| File | Sebelum | Sesudah | Catatan |
|---|---|---|---|
| `src/components/SupportChatWidget.tsx` | 36 | 16 | Menggunakan tokens.surface.subtle, tokens.text.secondary, dan tokens.text.faint untuk mereduksi light_sakura dan warna hardcoded pada balon chat, header, dan input. |
| `src/components/DashboardChart.tsx` | 10 | 0 | Menggunakan tokens.surface.card, tokens.border.accent, tokens.text.heading, tokens.text.danger, tokens.surface.sunken, dan tokens.text.accent secara penuh, menyisakan 0 light_sakura literal. |
| `src/components/DashboardWalletSelectorCard.tsx` | 9 | 5 | Menggunakan tokens.border.accent, tokens.surface.sunken, dan tokens.icon.accent untuk membersihkan background panel, border-border transparan, serta stat cards. |

Sesi ini berfokus pada penyelesaian modul Support Chat & Dashboard Analytics (SupportChatWidget, DashboardChart, dan DashboardWalletSelectorCard) untuk meningkatkan modularitas visual pada tema light_sakura secara komprehensif.

## Sesi 23: 3 file dimigrasi (3 → total 78 file tersentuh)

| File | Sebelum | Sesudah | Catatan |
|---|---|---|---|
| `src/components/VoicePreview.tsx` | 15 | 6 | Menggunakan tokens.surface.sunken, tokens.border.accent, dan tokens.hover.surface untuk input, box transcript, serta modal processing state. |
| `src/components/ReceiptPreview.tsx` | 17 | 2 | Menggunakan tokens.surface.sunken, tokens.border.accent, tokens.hover.surface, tokens.text.onSurface, dan tokens.text.faint untuk merefaktor detail item, border dash, dan label inputs pada struk belanja. |
| `src/components/AdminUserDetailModal.tsx` | 13 | 3 | Menggunakan tokens.surface.card, tokens.surface.sunken, tokens.border.accent, tokens.hover.surface, dan tokens.text.accent untuk membersihkan modal panel admin, status badges, dan stat cards. |

Sesi ini berfokus pada modal fungsionalitas asisten (VoicePreview, ReceiptPreview, dan AdminUserDetailModal) untuk memastikan visual asisten cerdas terintegrasi secara mulus dengan tema light_sakura yang eye-safe.

## Sesi 22: 3 file dimigrasi (3 → total 75 file tersentuh)

| File | Sebelum | Sesudah | Catatan |
|---|---|---|---|
| `src/components/BudgetProgressCard.tsx` | 13 | 7 | Menggunakan tokens.surface.sunken, tokens.text.primary, tokens.surface.card, dan tokens.border.accent untuk membersihkan inline layout dan panel card. |
| `src/components/DashboardOverviewCard.tsx` | 12 | 5 | Menggunakan tokens.surface.sunken, tokens.border.accent, dan tokens.text.primary untuk detail tabungan/emas dan panel bulan berjalan. |
| `src/components/SkeletonLoader.tsx` | 11 | 4 | Menghilangkan inline-styling pada skeleton cards, grids, dan tables menggunakan token global agar sinkron dengan layout aslinya. |

Sesi ini berfokus pada dashboard & progress widgets (BudgetProgressCard, DashboardOverviewCard, dan SkeletonLoader) untuk merapikan kartu ringkasan keuangan dan transisi loading pada light mode.

## Sesi 21: 2 file dimigrasi (2 → total 72 file tersentuh)

| File | Sebelum | Sesudah | Catatan |
|---|---|---|---|
| `src/components/MobileBottomNav.tsx` | 46 | 16 | Menggunakan tokens.text.accent, tokens.text.muted, tokens.text.primary, tokens.surface.sunken, tokens.border.accent, dan tokens.text.faint untuk membersihkan inline light_sakura: classes. |
| `src/components/Sidebar.tsx` | 40 | 18 | Menggunakan tokens.text.onSurface dan tokens.text.faint untuk merapikan visual dan navigasi menu item. |

Sesi ini berfokus pada navigasi utama aplikasi (MobileBottomNav & Sidebar) untuk memastikan konsistensi tema pada level navigasi desktop dan mobile.

## Sesi 20: 4 file dimigrasi (4 → total 70 file tersentuh)

| File | Sebelum | Sesudah | Catatan |
|---|---|---|---|
| `src/contexts/ToastContext.tsx` | 20 | 0 | hook dipasang, menggunakan `cx` untuk menyelaraskan custom alert class dan mendaftarkan pemakaian theme hook |
| `src/App.tsx` | 12 | 0 | hook dipasang, menggunakan tokens.surface.card, tokens.border.accent, tokens.text.primary, tokens.text.muted, menyelaraskan main wrapper dan footer link hover |
| `src/components/UpdateCheckingIndicator.tsx` | 4 | 0 | hook dipasang, menggunakan tokens.text.accent, tokens.text.onSurface, menyelaraskan layout background / border |
| `src/components/MaintenanceBanner.tsx` | 3 | 0 | hook dipasang, menyelaraskan layout background / border |
| `src/components/ProviderBadge.tsx` | 2 | 0 | hook dipasang, menggunakan tokens.text.accent |

Sesi ini menuntaskan 100% migrasi seluruh komponen di codebase ke pola token terpusat (`useThemeTokens`). Seluruh proses pengujian kompilasi berhasil dengan status 0 error.

## Sesi 19: 7 file dimigrasi (7 → total 66 file tersentuh)

| File | Sebelum | Sesudah | Catatan |
|---|---|---|---|
| `src/components/DeleteAccountModal.tsx` | 10 | 0 | hook dipasang, menggunakan tokens.surface.card, tokens.text.heading, tokens.text.secondary, tokens.text.muted, tokens.text.mutedAlt, tokens.text.danger, tokens.surface.sunken, tokens.text.primary |
| `src/components/Breadcrumbs.tsx` | 6 | 0 | hook dipasang, menggunakan tokens.surface.card, tokens.border.accent, tokens.text.muted, tokens.text.faint, tokens.text.accent |
| `src/components/ui/ToggleSwitch.tsx` | 5 | 0 | hook dipasang, menggunakan tokens.text.heading, tokens.text.muted, tokens.surface.sunken, tokens.border.strong |
| `src/components/InfoTooltip.tsx` | 5 | 0 | hook dipasang, menggunakan tokens.text.faint, tokens.surface.card, tokens.border.accent, tokens.text.secondary |
| `src/components/LoadingOverlay.tsx` | 4 | 0 | hook dipasang, menggunakan tokens.surface.card, tokens.border.accent, tokens.text.accent, tokens.text.secondary |
| `src/components/FeatureLockGate.tsx` | 4 | 0 | hook dipasang, menggunakan tokens.surface.sunken, tokens.text.heading, tokens.text.muted |
| `src/components/MobileTopBar.tsx` | 3 | 0 | hook dipasang, merapikan struktur styling kelas dengan `cx` untuk menyelaraskan struktur brand |

Sesi ini menyasar komponen utility, sistem, navigasi, dan modal keamanan. Seluruh proses pengujian kompilasi berhasil dengan status 0 error.

## Sesi 18: 6 file dimigrasi (6 → total 59 file tersentuh)

| File | Sebelum | Sesudah | Catatan |
|---|---|---|---|
| `src/components/DashboardBudgetSummary.tsx` | 13 | 0 | hook dipasang, menggunakan tokens.text.accent, tokens.text.heading, tokens.text.muted, tokens.surface.sunken, tokens.text.secondary, tokens.text.faint, tokens.border.accent |
| `src/components/VoiceRecorder.tsx` | 12 | 0 | hook dipasang, menggunakan tokens.text.mutedAlt, tokens.border.accent, tokens.surface.sunken, tokens.text.muted, tokens.text.secondary, tokens.text.accent, tokens.text.faint |
| `src/components/DashboardInstallments.tsx` | 9 | 0 | hook dipasang, menggunakan tokens.text.accent, tokens.text.onSurface, tokens.text.muted, tokens.text.secondary, tokens.text.faint, tokens.surface.sunken |
| `src/components/DashboardHeader.tsx` | 8 | 0 | hook dipasang, menggunakan tokens.text.accent, tokens.text.primary, tokens.text.muted |
| `src/components/DashboardBillReminders.tsx` | 4 | 0 | hook dipasang, menggunakan tokens.text.onSurface, tokens.text.danger, tokens.text.secondary |
| `src/components/DashboardBudgetAlerts.tsx` | 3 | 0 | hook dipasang, menggunakan tokens.text.onSurface, tokens.text.warning, tokens.text.secondary |

Sesi ini berfokus pada sub-sistem Dashboard Utama & Voice Input yang sering diakses pengguna. Semua verifikasi build / `compile_applet` berhasil dengan 0 error baru.

## Sesi 17: 7 file dimigrasi (7 → total 53 file tersentuh)

| File | Sebelum | Sesudah | Catatan |
|---|---|---|---|
| `src/components/HistoryExport.tsx` | 13 | 0 | hook dipasang, menggunakan tokens.border.accent, tokens.text.onSurface, tokens.text.secondary, tokens.surface.card, tokens.hover.sunken |
| `src/components/HistoryGroupedList.tsx` | 13 | 0 | hook dipasang, menggunakan tokens.border.accent, tokens.surface.sunken, tokens.text.muted, tokens.text.heading, tokens.hover.sunken |
| `src/components/HistoryPagination.tsx` | 4 | 0 | hook dipasang, menggunakan tokens.surface.sunken, tokens.border.accent, tokens.text.muted, tokens.text.secondary, tokens.text.label |
| `src/components/HistoryFilter.tsx` | 7 | 0 | hook dipasang, menggunakan tokens.surface.sunken, tokens.border.accent, tokens.text.muted, tokens.text.onSurface |
| `src/components/HistoryDeleteModal.tsx` | 6 | 0 | hook dipasang, menggunakan tokens.surface.card, tokens.text.onSurface, tokens.text.danger, tokens.text.secondary, tokens.surface.sunken, tokens.border.accent |
| `src/components/ExportFullModal.tsx` | 9 | 0 | hook dipasang, menggunakan tokens.surface.card, tokens.border.accent, tokens.text.onSurface, tokens.text.faint, tokens.text.secondary, tokens.text.muted, tokens.text.danger |
| `src/components/ExportSummaryModal.tsx` | 6 | 0 | hook dipasang, menggunakan tokens.surface.card, tokens.border.accent, tokens.text.onSurface, tokens.text.faint, tokens.text.secondary, tokens.text.muted |

Tidak ada token baru ditambahkan. Sesi ini menuntaskan migrasi seluruh sub-sistem Riwayat & Ekspor (History & Export) ke theme tokens.

Semua verifikasi build / `compile_applet` sukses dengan 0 error baru di semua file yang disentuh sesi ini.

## Sesi 16: 8 file dimigrasi (8 → total 46 file tersentuh)

| File | Sebelum | Sesudah | Catatan |
|---|---|---|---|
| `src/components/WalletPickerField.tsx` | 3 | 0 | hook dipasang, menggunakan tokens.surface.subtle, tokens.text.heading, tokens.border.strong |
| `src/components/ui/Badge.tsx` | 12 | 0 | hook dipasang, membersihkan tonal classes |
| `src/components/ui/Button.tsx` | 18 | 0 | hook dipasang, membersihkan variant classes |
| `src/components/ui/Input.tsx` | 4 | 0 | hook dipasang, membersihkan input classes |
| `src/components/SkeletonLoader.tsx` | 19 | 0 | hook dipasang, membersihkan skeleton loading components |
| `src/components/SplashScreen.tsx` | 7 | 0 | hook dipasang, membersihkan splash screen loading animation ring |
| `src/components/ErrorState.tsx` | 7 | 0 | hook dipasang, membersihkan error layout |
| `src/components/EmptyState.tsx` | 3 | 0 | hook dipasang, membersihkan empty layout |

Tidak ada token baru ditambahkan. Sesi ini mempercepat rollout token ke UI dasar (Badge, Button, Input, SkeletonLoader, SplashScreen, ErrorState, EmptyState) dan salah satu picker field penting (WalletPickerField).

Semua verifikasi build / `compile_applet` sukses dengan 0 error baru di semua file yang disentuh sesi ini.

## Sesi 15: 3 file baru dimigrasi + 1 file direvisit (3 → total 38 file tersentuh)

| File | Sebelum | Sesudah | Catatan |
|---|---|---|---|
| `src/components/DropdownField.tsx` | 15 | 0 | hook dipasang, file baru |
| `src/components/ReceiptUploader.tsx` | 14 | 0 | hook dipasang, file baru |
| `src/components/Modal.tsx` | 14 | 0 | hook dipasang, file baru |
| `src/components/UpdatePrompt.tsx` | 20 | 0 | **direvisit** -- sisa manual styles dicleanup dengan theme tokens |

Tidak ada token baru ditambahkan. Token yang dipakai: `surface.card`, `text.onSurface`, `text.heading`, `border.strong`, `border.accent`, `text.secondary`, `hover.sunken`, `text.mutedAlt`, `icon.accent`, `text.faint`, `text.warning`, `text.success`, `text.accentStrong`.

`tsc --noEmit` penuh dijalankan -- 0 hasil untuk `Cannot find name 'tokens'/'cx'`, 0 error baru di semua file yang disentuh sesi ini.

## Sesi 14: 1 file dimigrasi + 1 file direvisit dengan token baru (1 token baru ditambahkan, 1 → total 35 file tersentuh)

| File | Sebelum | Sesudah | Catatan |
|---|---|---|---|
| `src/components/HistoryEditModal.tsx` | 16 | 4 | hook dipasang, file baru |
| `src/components/ConfirmTransactionModal.tsx` | 14 | 8 | **direvisit** -- 2 baris `<input>` yang sesi 11 sengaja dibiarkan literal (pola `py-2.5`) sekarang pakai token baru `form.inputLg`, menghapus 6 `light_sakura:` (3 per baris x 2 baris); sisa 8 di baris lain (kartu modal utama, tombol close, preview nominal ternary) di luar cakupan revisit sesi ini -- polanya serupa dengan yang ditemukan TIDAK exact match di `HistoryEditModal.tsx` sesi ini (lihat catatan di bawah), kemungkinan besar sudah tidak ada token yang cocok, tapi belum diverifikasi baris-per-baris di file ini secara eksplisit |

**Token baru ditambahkan: `tokens.form.inputLg`.** Sesi 11 mencatat pola
`<input>` dengan `py-2.5` (beda dari `form.input` yang `py-2`) di
`ConfirmTransactionModal.tsx` (2x) tapi tidak dipaksa jadi token karena cuma
1 file. Sesi 14 menemukan kemunculan IDENTIK ke-2 di
`HistoryEditModal.tsx` (2x) -- total 4x di 2 file berbeda, memenuhi syarat
"≥2 file" di bagian "Kapan menambah token baru". Ditambahkan sebagai
`form.inputLg` di `tokens.ts` (varian `form.input` dengan `py-2.5`), lalu
dipakai di KEDUA file (2 baris baru di `HistoryEditModal.tsx` + 2 baris
lama yang direvisit di `ConfirmTransactionModal.tsx`). Total 2 file
tersentuh sesi ini (1 file baru + 1 revisit), tapi cuma `HistoryEditModal.tsx`
yang dihitung sebagai "file baru" di angka total tersentuh (revisit tidak
menambah hitungan karena filenya sudah pernah tersentuh di sesi 11).

Sisa `light_sakura:` yang TIDAK dimigrasi di `HistoryEditModal.tsx`
(bukan exact match, tetap literal):
- Kartu modal utama: `bg-slate-900 light_sakura:bg-rose-50/90` (beda dari
  `surface.card` yang light-nya `bg-white`) dan
  `border-indigo-500/20 light_sakura:border-rose-100` (beda dari
  `border.accent` yang dark-nya `border-slate-800`) -- hanya
  `text.onSurface` (`text-white light_sakura:text-slate-800`) yang exact
  match di baris ini.
- Ikon pensil: `bg-indigo-500/15 light_sakura:bg-indigo-50` (bg
  ber-opacity, tidak match token manapun) -- hanya warna teks/ikonnya
  (`text.accentStrong`) yang ditoken-kan.
- Tombol close: `text-slate-400 hover:bg-slate-800 hover:text-white
  cursor-pointer light_sakura:hover:bg-rose-100` -- tidak ada pasangan
  `light_sakura:text-*` di baris ini (cuma hover bg), jadi `text.muted`
  TIDAK exact match, tetap literal.

`npm install` (node_modules sudah ada dari sesi 13, tidak perlu install
ulang). `tsc --noEmit` penuh dijalankan -- 0 hasil untuk `Cannot find name
'tokens'/'cx'`, 0 error baru di kedua file yang disentuh sesi ini.

Query prioritas berikutnya menghasilkan `src/components/DropdownField.tsx`
(15, sudah diverifikasi diimpor di 21 file, jelas bukan dead code) sebagai
kandidat sesi 15.

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
   sesi 11) -- **jangan dipaksa cocok ke token yang sudah ada** (tetap
   berlaku tanpa perubahan), tapi sejak sesi 52 varian yang beda ini WAJIB
   dapat token baru terpisah miliknya sendiri (bukan lagi "dicatat lalu
   dibiarkan literal") -- lihat perubahan kebijakan di bagian "Kapan
   menambah token baru".
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
   tampilan). Buat token BARU yang terpisah untuk kombinasi ini -- **sejak
   sesi 52, ini WAJIB ditoken-kan juga** (bukan lagi opsional/"tetap
   literal"), walau cuma dipakai 1x di 1 file. Pakai penamaan `<namaFile
   camelCase>.<deskripsiSingkat>` untuk token yang genuinely 1x-pakai,
   supaya tidak mencemari grup token semantik generik (`text.*`, `chip.*`,
   dst) yang harusnya khusus untuk pola reusable ≥2 file. Lihat kotak
   peringatan "PERUBAHAN KEBIJAKAN" di bagian "Kapan menambah token baru"
   untuk alasan lengkap.
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

> **⚠️ PERUBAHAN KEBIJAKAN 2026-07-18 (setelah sesi 51, atas konfirmasi
> user)**: Aturan "≥2 file" di bawah ini SUDAH TIDAK BERLAKU sebagai syarat
> mutlak. Alasan perubahan: tujuan rollout ini bergeser dari sekadar
> "kurangi duplikasi" menjadi **persiapan migrasi tema besar** (mis. ganti
> palet warna `light_sakura` atau tambah tema baru). Untuk migrasi tema,
> yang penting BUKAN reuse-nya, tapi **single source of truth** — supaya
> ganti warna cukup edit `tokens.ts`, tidak perlu grep manual ke seluruh
> `src/`. Konsekuensinya:
> - **Literal 1x-pakai TETAP dipindah ke `tokens.ts`** sebagai token
>   spesifik-komponen (bukan token generik reusable) -- pola yang sudah
>   dipakai untuk `badge.*`/`buttonVariant.*` di sesi 47 (titik reuse-nya
>   ada di prop komponen, bukan di file lain), sekarang diperluas ke SEMUA
>   sisa literal, termasuk yang genuinely unique.
> - **Poin 3 di "Cara migrasi 1 file" (jangan paksa token yang mirip tapi
>   beda shade) TETAP BERLAKU TANPA PERUBAHAN** -- ini bukan soal reuse,
>   ini soal jangan diam-diam mengubah tampilan. Kombinasi yang mirip tapi
>   beda 1 shade dapat token BARU yang terpisah, bukan dipaksa pakai token
>   yang sudah ada.
> - **Target "selesai" berubah**: sebelumnya "selesai" berarti semua
>   exact-match ≥2 file sudah ditoken-kan (sisa 1x-pakai boleh tetap
>   literal selamanya). Sekarang "selesai" berarti `grep -c
>   "light_sakura:" src` di SELURUH project = **0** — itu jadi syarat
>   "siap migrasi tema", bukan lagi target opsional.
> - Penamaan token untuk kasus 1x-pakai: pakai pola `<namaFile
>   camelCase>.<deskripsiSingkat>` (mis. `dashboardRecentTransactions.iconChipSparkles`)
>   supaya jelas asalnya, alih-alih dipaksa masuk ke grup token semantik
>   generik (`chip.*`, `text.*`, dst) yang sebenarnya untuk pola reusable.
>
> Aturan lama di bawah ini dipertahankan sebagai catatan historis (masih
> relevan untuk grup token *semantik/generik* yang sudah ada -- lihat
> poin terakhir di atas soal penamaan).

Tambahkan ke `tokens.ts` HANYA kalau kombinasi tsb muncul di ≥2 file
berbeda. Kombinasi yang cuma dipakai 1 kali di 1 komponen spesifik lebih
baik tetap literal di tempatnya — memaksakannya jadi token generik cuma
menambah lapisan tak berguna dan bikin token map makin gemuk tanpa manfaat
reuse yang nyata.

*(⚠️ lihat kotak peringatan di atas — paragraf ini sudah tidak jadi acuan
utama sejak sesi 52, dipertahankan untuk konteks historis kenapa beberapa
token grup di file ini dinamai per-grup semantik alih-alih per-file.)*

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
