/**
 * Token warna semantik untuk 2 tema app: dark_obsidian (default) & light_sakura.
 *
 * KENAPA INI PERLU:
 * Sebelumnya, pasangan class Tailwind seperti
 *   "text-slate-400 light_sakura:text-slate-500"
 * ditulis ulang manual di 60+ komponen (2000+ kemunculan `light_sakura:` di
 * codebase per audit 2026-07-15). Kalau warna "muted text" mau diganti,
 * harus grep+replace di puluhan file berbeda -- rawan miss & inkonsisten.
 *
 * CARA KERJA:
 * Karena `light_sakura` didefinisikan sebagai custom Tailwind variant
 * (`@variant light_sakura (.light_sakura &)` di src/index.css) yang aktif
 * berdasarkan class di <html> (lihat ThemeContext.tsx), KEDUA varian class
 * (dark & light_sakura:) harus selalu hadir bersamaan di JSX -- switching
 * terjadi di level CSS, bukan JS. Karena itu token di file ini adalah
 * STRING STATIS (bukan hasil kondisional theme === "..."), supaya SSR-safe
 * dan tidak flicker saat toggle tema.
 *
 * CARA PAKAI:
 *   import { useThemeTokens } from "../hooks/useThemeTokens";
 *   const { tokens, cx } = useThemeTokens();
 *   <p className={tokens.text.muted}>...</p>
 *   <div className={cx(tokens.surface.card, tokens.border.default, "p-4")}>
 *
 * ATURAN PENAMBAHAN TOKEN BARU:
 * Sebelum menulis pasangan "warna-dark light_sakura:warna-light" baru
 * langsung di komponen, cek dulu apakah polanya sudah ada di sini. Kalau
 * belum ada DAN dipakai >1 tempat, tambahkan sebagai token baru di sini
 * alih-alih hardcode lagi. Token di bawah sudah mencakup ~80% pasangan yang
 * paling sering dipakai di codebase (diambil dari analisis frekuensi).
 */

export const themeTokens = {
  text: {
    /** Judul besar / angka utama. Dipakai di heading kartu, nominal saldo. */
    primary: "text-white light_sakura:text-slate-900",
    /** Teks putih di atas surface.card untuk body/konten umum (bukan heading besar). */
    onSurface: "text-white light_sakura:text-slate-800",
    /** Sub-heading, label kartu yang agak menonjol. */
    heading: "text-slate-100 light_sakura:text-slate-900",
    /** Body text sekunder -- deskripsi, paragraf pendukung. */
    secondary: "text-slate-300 light_sakura:text-slate-700",
    /** Label pendek di atas surface gelap (nama item kartu, judul baris list). */
    label: "text-slate-300 light_sakura:text-slate-600",
    /** Teks kecil/caption yang paling umum -- label uppercase, timestamp, helper text. */
    muted: "text-slate-400 light_sakura:text-slate-500",
    /** Varian muted yang sedikit lebih gelap di light mode (dipakai beberapa caption). */
    mutedAlt: "text-slate-400 light_sakura:text-slate-600",
    /** Placeholder / teks paling pudar. */
    faint: "text-slate-500 light_sakura:text-slate-400",
    /** Warna aksen brand (indigo di dark, rose di light) -- link, ikon aktif, highlight. */
    accent: "text-indigo-400 light_sakura:text-rose-500",
    accentStrong: "text-indigo-400 light_sakura:text-indigo-600",
    success: "text-emerald-400 light_sakura:text-emerald-600",
    successStrong: "text-emerald-500 light_sakura:text-rose-500",
    danger: "text-red-400 light_sakura:text-red-600",
    /**
     * Sesi 50: varian danger dengan shade red-300 (bukan red-400) di dark
     * mode -- BEDA dari `danger` di atas. Exact match diverifikasi di 2
     * file: `Settings.tsx` & `PrivacySettings.tsx` (masing-masing 1x,
     * teks peringatan hapus akun).
     */
    dangerSoft: "text-red-300 light_sakura:text-red-600",
    warning: "text-amber-400 light_sakura:text-amber-600",
    /**
     * Sesi 54: warna angka "net" negatif ringan / due-soon. Exact match
     * di 2 file: `History.tsx` & `DashboardBillReminders.tsx` (keduanya
     * dipasang sesi ini).
     */
    warningOrange: "text-orange-400 light_sakura:text-orange-600",
    /** Teks agak menonjol di atas surface gelap -- dipakai di Settings.tsx (2x) & AdminPremiumMonitor.tsx. */
    strong: "text-slate-200 light_sakura:text-slate-800",
  },

  surface: {
    /** Background utama aplikasi (canvas dasar). */
    canvas: "bg-slate-950 light_sakura:bg-rose-50/20",
    /** Background kartu/panel utama. Sama dengan yang dipakai ui/Card.tsx. */
    card: "bg-slate-900 light_sakura:bg-white",
    /** Background sekunder (nested box di dalam card, input, dsb). */
    subtle: "bg-slate-800 light_sakura:bg-slate-50",
    /** Background "tenggelam" -- kartu kecil di dalam Card, chip non-interaktif. */
    sunken: "bg-slate-950/40 light_sakura:bg-rose-50/30",
  },

  border: {
    /** Border standar untuk card/panel. */
    default: "border-slate-800 light_sakura:border-slate-100",
    /** Border lebih tegas (dipakai di input, divider yang perlu kontras lebih). */
    strong: "border-slate-700 light_sakura:border-slate-200",
    /** Border bertema aksen (dipakai Card.tsx untuk border rose di light mode). */
    accent: "border-slate-800 light_sakura:border-rose-100",
    /**
     * Border kartu redup (rose sangat tipis di light mode) -- exact match
     * diverifikasi di 3 file: SettingsMobileMenu.tsx (3x, dipasang sesi
     * ini) & WalletTransferModal.tsx (2x, belum dipasang) & AdminPanel.tsx
     * (1x, dipasang sesi 53).
     */
    subtleRose: "border-slate-800/60 light_sakura:border-rose-100/50",
  },

  divide: {
    /**
     * Divider redup pasangan dari `border.subtleRose` -- exact match sama
     * di SettingsMobileMenu.tsx (3x) & AdminPanel.tsx (1x, dipasang
     * sesi 53).
     */
    subtleRose: "divide-slate-800/60 light_sakura:divide-rose-100/60",
  },

  hover: {
    /** Hover state untuk item list / row yang bisa diklik di atas surface.subtle. */
    surface: "hover:bg-slate-800 light_sakura:hover:bg-slate-50",
    /** Hover state untuk kartu di atas surface.sunken (mis. kartu terkait di Wallets.tsx). */
    sunken: "hover:bg-slate-800/60 light_sakura:hover:bg-rose-50/60",
    textAccent: "hover:text-indigo-400 light_sakura:hover:text-rose-500",
    /**
     * Sesi 54: hover teks jadi putih (dark) / slate-900 (light) -- dipakai
     * untuk ikon close/dismiss yang basis warnanya beda-beda per pemanggil
     * (jadi cuma bagian hover-nya yang ditokenkan terpisah). Exact match
     * di 3 file: `SupportChatWidget.tsx`, `ExportSummaryModal.tsx`,
     * `ExportFullModal.tsx` (semua dipasang sesi ini).
     */
    textInverse: "hover:text-white light_sakura:hover:text-slate-900",
  },

  icon: {
    accent: "text-indigo-400 light_sakura:text-rose-500",
    muted: "text-slate-400 light_sakura:text-slate-500",
    /**
     * Warna ikon paling redup (mis. ChevronRight navigasi list). Exact
     * match di SettingsMobileMenu.tsx (1x) & AdminPanel.tsx (1x, dipasang
     * sesi 53).
     */
    subtle: "text-slate-600 light_sakura:text-slate-300",
  },

  /**
   * Kombinasi bg+text (bukan cuma text) -- dipakai untuk "chip" bulat/rounded
   * di belakang ikon fitur (bg lembut + warna ikon senada di atasnya).
   */
  chip: {
    /**
     * Ikon fitur/step dengan aksen emerald (dark) / rose (light) -- BEDA
     * dari `icon.accent` (indigo/rose) di atas. Dipakai utuh identik di
     * Onboarding.tsx (11x) & Dashboard.tsx -- exact match terverifikasi
     * sebelum ditambahkan ke sini.
     */
    accentEmerald:
      "bg-emerald-500/10 text-emerald-500 light_sakura:bg-rose-500/10 light_sakura:text-rose-500",
    /**
     * Sesi 49: kotak ikon warning amber (dark) / rose (light) -- dipakai
     * saat state "terkunci"/lock. Exact match diverifikasi di 2 file:
     * ReceiptUploader.tsx (dipasang sesi ini) & VoiceRecorder.tsx (belum
     * dipasang, di luar cakupan target sesi 49).
     */
    accentAmberRose:
      "bg-amber-500/10 border border-amber-500/20 text-amber-500 light_sakura:bg-rose-500/10 light_sakura:border-rose-500/20 light_sakura:text-rose-500",
    /**
     * Sesi 49: background bulat ikon indigo (dark) / rose (light), TANPA
     * warna teks (dipasangkan dengan `icon.accent`/`text.accent` terpisah).
     * Exact match diverifikasi di 3 file: DashboardOverviewCard.tsx
     * (dipasang sesi 49), DashboardInstallments.tsx (dipasang), &
     * DashboardWalletSelectorCard.tsx (dipasang sesi 53).
     */
    accentIndigo: "bg-indigo-500/15 light_sakura:bg-rose-500/15",
    /**
     * Sesi 50: badge bold indigo/amber (bg+text, dengan font-bold) --
     * BEDA dari `accentIndigo` di atas (yang tanpa warna teks & tanpa
     * font-bold). Exact match diverifikasi di 2 file: `DropdownField.tsx`
     * (varian `indigo`/`amber` dari colorMap `selectedStyle`, varian
     * `emerald`/`rose` di file yang sama TETAP literal karena belum
     * diverifikasi ada duplikat di file lain) & `WalletPickerField.tsx`.
     */
    badgeIndigo: "bg-indigo-500/15 text-indigo-300 font-bold light_sakura:bg-rose-50 light_sakura:text-rose-600",
    badgeAmber: "bg-amber-500/15 text-amber-300 font-bold light_sakura:bg-amber-50 light_sakura:text-amber-700",
    /**
     * Sesi 54 (kebijakan tokenisasi penuh): melengkapi varian `colorMap`
     * `DropdownField.tsx` yang tadinya dibiarkan literal (`emerald`/`rose`,
     * genuinely 1x-pakai, dicek cross-file tidak ada duplikat).
     */
    badgeEmerald: "bg-emerald-500/15 text-emerald-300 font-bold light_sakura:bg-emerald-50 light_sakura:text-emerald-700",
    badgeRose: "bg-rose-500/15 text-rose-300 font-bold light_sakura:bg-rose-50 light_sakura:text-rose-600",
  },

  /**
   * Sesi 47: warna per-tone untuk `ui/Badge.tsx`. Beda dari kasus token lain
   * di file ini (yang butuh ≥2 file duplikat sebelum ditambahkan) -- 5 combo
   * di bawah masing-masing HANYA dipakai 1x di source (`ui/Badge.tsx`), tapi
   * dipindah ke sini tetap sesuai keputusan user karena `Badge.tsx` sendiri
   * SUDAH jadi titik reuse tunggal (dipanggil lewat prop `tone` dari banyak
   * halaman) -- bukan token generik baru, cuma memindahkan definisi warna
   * yang sudah tersentralisasi supaya seluruh literal `light_sakura:` di app
   * (termasuk primitif UI) tetap satu sumber di `tokens.ts`.
   */
  badge: {
    neutral: "bg-slate-800 text-slate-300 border-slate-700 light_sakura:bg-slate-100 light_sakura:text-slate-600 light_sakura:border-slate-200",
    info: "bg-indigo-500/15 text-indigo-400 border-indigo-500/30 light_sakura:bg-indigo-50 light_sakura:text-indigo-600 light_sakura:border-indigo-100",
    success: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30 light_sakura:bg-emerald-50 light_sakura:text-emerald-700 light_sakura:border-emerald-100",
    warning: "bg-amber-500/15 text-amber-400 border-amber-500/30 light_sakura:bg-amber-50 light_sakura:text-amber-700 light_sakura:border-amber-100",
    danger: "bg-red-500/15 text-red-400 border-red-500/30 light_sakura:bg-red-50 light_sakura:text-red-600 light_sakura:border-red-100",
  },

  button: {
    /**
     * Tombol CTA solid emerald (dark) / rose (light) dengan teks putih di
     * kedua tema -- dipakai di luar `ui/Button.tsx` (tombol custom inline,
     * bukan lewat komponen Button). Exact match diverifikasi di 3 file:
     * Onboarding.tsx (3x), BillReminders.tsx, Dashboard.tsx. Shadow/ukuran/
     * radius TIDAK termasuk token ini karena bervariasi per pemakaian --
     * tetap ditulis literal di pemanggil (mis. "shadow-lg shadow-emerald-
     * 500/20 light_sakura:shadow-rose-500/20").
     */
    accentEmerald:
      "bg-emerald-500 hover:bg-emerald-400 text-white light_sakura:bg-rose-500 light_sakura:hover:bg-rose-400",
    /**
     * Tombol slate netral (batal/hapus/edit sekunder) dengan hover lebih
     * terang. Exact match di AdminCategoryManager.tsx (1x, dipasang sesi
     * ini) & AdminBroadcast.tsx (1x, kelas sama tapi diselingi `border` --
     * belum dipasang, di luar cakupan target sesi 46).
     */
    cancelSlate: "bg-slate-800 light_sakura:bg-slate-100 hover:bg-slate-700 light_sakura:hover:bg-slate-200",
  },

  /**
   * Sesi 47: varian warna `ui/Button.tsx`. Sama seperti `badge` di atas --
   * masing-masing combo cuma dipakai 1x di source, dipindah ke sini karena
   * `Button.tsx` sendiri sudah jadi titik reuse tunggal lewat prop `variant`.
   * Beberapa file lain (Wallets.tsx, Settings.tsx, VoicePreview.tsx, dst)
   * punya kelas MIRIP untuk tombol custom inline (bukan lewat komponen
   * Button) tapi tidak exact-match (beda padding/shadow/font-weight) --
   * TIDAK dipaksakan pakai token ini, tetap literal di tempatnya (lihat
   * aturan sesi 11 poin 3).
   */
  buttonVariant: {
    primary: "bg-indigo-600 hover:bg-indigo-500 text-white font-semibold shadow-lg shadow-indigo-600/20 light_sakura:bg-rose-500 light_sakura:hover:bg-rose-400 light_sakura:shadow-rose-500/20",
    secondary: "bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold border border-slate-700 light_sakura:bg-white light_sakura:hover:bg-slate-50 light_sakura:text-slate-600 light_sakura:border-slate-200",
    dangerGhost: "bg-red-500/10 hover:bg-red-500/20 text-red-400 font-semibold light_sakura:bg-red-50 light_sakura:hover:bg-red-100 light_sakura:text-red-500",
    ghost: "bg-transparent hover:bg-slate-800 text-slate-300 font-semibold light_sakura:hover:bg-rose-50 light_sakura:text-slate-600",
  },

  toggle: {
    /**
     * Track background untuk switch/toggle kondisi "off"/inactive.
     * Exact match diverifikasi di 2 file: AdminMaintenance.tsx (3x --
     * toggle maintenance global, sandbox bypass, feature lock) &
     * AdminPremiumMonitor.tsx (1x, toggle sandbox QRIS -- keduanya sudah
     * terpasang sejak sesi 52).
     */
    inactiveTrack: "bg-slate-700 light_sakura:bg-slate-200",
    /**
     * Sesi 49: border+teks kotak ikon "inactive" (dipasangkan dengan
     * `surface.subtle` untuk bg-nya). Exact match diverifikasi di 2 file:
     * AdminMaintenance.tsx (toggle global) & AdminPremiumMonitor.tsx
     * (toggle sandbox QRIS).
     */
    inactiveIconBorder: "border-slate-700 light_sakura:border-slate-100 text-slate-500",
  },

  form: {
    /**
     * Styling standar <input> teks/angka di form (nama pos, saldo awal,
     * kontak, dst). Ditemukan berulang VERBATIM 5x hanya di Wallets.tsx
     * saja -- indikasi kuat pola ini juga muncul di form-form lain
     * (NewTransaction, Savings, Installments, dll). Kalau app ini nanti
     * pindah ke `ui/Input.tsx` sepenuhnya untuk semua field, token ini bisa
     * dipensiunkan; sampai saat itu, dipakai untuk <input> polos yang belum
     * migrasi ke komponen `Input`.
     */
    input:
      "w-full px-3 py-2 rounded-xl text-sm bg-slate-800 border border-slate-700 text-slate-200 focus:outline-none focus:border-indigo-500 light_sakura:bg-white light_sakura:border-rose-200 light_sakura:text-slate-700",
    /**
     * Varian `input` dengan `py-2.5` (bukan `py-2`) -- awalnya dicatat di
     * sesi 11 sebagai "mirip tapi tidak persis" (1 kemunculan di
     * `ConfirmTransactionModal.tsx`, tidak dipaksa jadi token). Sesi 13
     * menemukan kemunculan identik ke-2 di `HistoryEditModal.tsx` (2x),
     * total 4x di 2 file berbeda -- memenuhi syarat "≥2 file" untuk token
     * baru, jadi ditambahkan di sini.
     */
    inputLg:
      "w-full px-3 py-2.5 rounded-xl text-sm bg-slate-800 border border-slate-700 text-slate-200 focus:outline-none focus:border-indigo-500 light_sakura:bg-white light_sakura:border-rose-200 light_sakura:text-slate-700",
  },

  login: {
    arc1: "stroke-[rgba(99,102,241,0.18)] light_sakura:stroke-[rgba(251,113,133,0.18)]",
    arc2: "stroke-[rgba(99,102,241,0.12)] light_sakura:stroke-[rgba(251,113,133,0.12)]",
    arc3: "stroke-[rgba(45,212,191,0.14)] light_sakura:stroke-[rgba(244,63,94,0.10)]",
    arc4: "stroke-[rgba(45,212,191,0.10)] light_sakura:stroke-[rgba(244,63,94,0.07)]",
    line: "stroke-[rgba(255,255,255,0.04)] light_sakura:stroke-[rgba(0,0,0,0.04)]",
    glow: "bg-indigo-500/10 light_sakura:bg-rose-300/20",
    ring1: "border-white/8 light_sakura:border-rose-200/20",
    ring2: "border-white/5 light_sakura:border-rose-200/15",
    logoGlow: "drop-shadow-[0_0_32px_rgba(99,102,241,0.5)] light_sakura:drop-shadow-[0_0_32px_rgba(244,63,94,0.35)]",
    statChip: "bg-white/10 border-white/15 light_sakura:bg-rose-900/10 light_sakura:border-rose-200/30",
    statChipVal: "text-indigo-300 light_sakura:text-rose-400",
    statChipLbl: "text-white/60 light_sakura:text-rose-900/60",
    brandPanelBg: "bg-gradient-to-br from-indigo-950 via-slate-900 to-slate-950 light_sakura:from-rose-400 light_sakura:via-rose-300 light_sakura:to-rose-400",
    tabBg: "bg-white/10 border-white/15 light_sakura:bg-rose-900/10 light_sakura:border-rose-200/30",
    tabBtnActive: "bg-white text-indigo-700 shadow-sm light_sakura:bg-white light_sakura:text-rose-600",
    tabBtnInactive: "text-white/70 hover:text-white light_sakura:text-rose-50/90",
    inputFieldFocus: "focus:border-indigo-500 focus:shadow-[0_0_0_3px_rgba(99,102,241,0.15)] light_sakura:focus:border-rose-400 light_sakura:focus:shadow-[0_0_0_3px_rgba(244,63,94,0.12)]",
    inputFieldBgBorder: "bg-slate-800/60 border-slate-700/60 placeholder:text-slate-500 light_sakura:bg-slate-100/80 light_sakura:border-rose-200 light_sakura:placeholder:text-slate-400 light_sakura:focus:bg-white",
    disclaimerBgBorder: "bg-amber-500/5 border border-amber-500/15 light_sakura:bg-rose-50 light_sakura:border-rose-200/60",
    disclaimerIcon: "text-amber-400 light_sakura:text-rose-400",
    googleBtn: "border border-slate-700/80 bg-slate-800/40 hover:bg-slate-800 text-slate-200 light_sakura:border-rose-200 light_sakura:bg-rose-50/50 light_sakura:text-slate-700 light_sakura:hover:bg-rose-100/60",
    guestBtn: "border border-dashed border-indigo-500/30 bg-indigo-500/5 hover:bg-indigo-500/10 text-indigo-400 light_sakura:border-rose-300/60 light_sakura:bg-rose-50/40 light_sakura:text-rose-600 light_sakura:hover:bg-rose-100/50",
    iconBg: "bg-indigo-600/10 light_sakura:bg-rose-100",
    ctaBtn: "bg-indigo-600 hover:bg-indigo-500 shadow-[0_4px_24px_rgba(99,102,241,0.30)] light_sakura:bg-rose-500 light_sakura:hover:bg-rose-400 light_sakura:shadow-[0_4px_24px_rgba(244,63,94,0.25)]",
    eyeBtn: "text-slate-500 hover:text-slate-300 light_sakura:hover:text-slate-700",
    formDivider: "bg-slate-800 light_sakura:bg-rose-100",
    footerLink: "hover:text-emerald-500 light_sakura:hover:text-rose-500",
    spinnerRing1: "border-indigo-600/20 light_sakura:border-rose-400/20",
    spinnerRing2: "border-t-indigo-500 light_sakura:border-t-rose-500",
    ambientGlow1: "bg-indigo-600/8 blur-[100px] light_sakura:bg-rose-300/20",
    ambientGlow2: "bg-indigo-600/8 blur-[80px] light_sakura:bg-pink-300/15",
    cardShadow: "shadow-[0_32px_80px_rgba(0,0,0,0.55)] light_sakura:shadow-[0_32px_80px_rgba(200,50,80,0.12)]",
    divider: "bg-white/10 light_sakura:bg-rose-200/30",
  },
  onboarding: {
    soundToggleBtn: "hover:bg-slate-800 text-slate-300 light_sakura:hover:bg-rose-50/50 light_sakura:text-rose-600",
    mainCardBgBorder: "bg-slate-900/50 border border-slate-800/80 light_sakura:bg-white light_sakura:border-rose-100/80",
    ambientGlow: "bg-gradient-to-r from-transparent via-emerald-500 to-transparent light_sakura:via-rose-400",
    stepPillActive: "bg-emerald-500 text-white light_sakura:bg-rose-500",
    stepPillInactive: "bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-300 light_sakura:bg-white light_sakura:border-rose-100 light_sakura:text-slate-600",
    interactiveFormBgBorder: "bg-slate-950/60 border border-slate-800/80 light_sakura:bg-rose-50/20 light_sakura:border-rose-100",
    bulletFeatureItem: "p-3 rounded-xl bg-slate-950/40 border border-slate-800/40 light_sakura:bg-rose-50/10 light_sakura:border-rose-100",
    actionBtnSecondary: "border-slate-800 hover:border-slate-700 text-slate-300 light_sakura:border-rose-200 light_sakura:text-rose-600 light_sakura:hover:bg-rose-50",
    backBtn: "border border-slate-800 hover:bg-slate-800 text-slate-300 light_sakura:border-rose-200 light_sakura:text-rose-600 light_sakura:hover:bg-rose-50/50",
    skipBtn: "text-slate-500 hover:text-slate-400 light_sakura:text-slate-500 light_sakura:hover:text-slate-700",
    practiceSuccessBgBorder: "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 light_sakura:bg-rose-500/10 light_sakura:border-rose-500/20 light_sakura:text-rose-600",
    practiceWarningBgBorder: "bg-rose-500/10 border border-rose-500/20 text-rose-400 light_sakura:bg-rose-50 light_sakura:text-rose-600",
    iconCircularBg: "bg-slate-800 text-slate-400 light_sakura:bg-rose-50 light_sakura:text-rose-500",
    tableHeaderBgText: "bg-slate-900/80 text-slate-400 light_sakura:bg-rose-100/30 light_sakura:text-slate-600",
    tableDivider: "divide-slate-800/60 light_sakura:divide-rose-50",
    goldGoldCard: "bg-gradient-to-br from-amber-500/10 to-slate-900 border border-amber-500/20 light_sakura:from-amber-50 light_sakura:to-white light_sakura:border-amber-200",
    badgeDueSoon: "bg-rose-500/20 text-rose-400 light_sakura:bg-rose-50 light_sakura:text-rose-600",
    conclusionCardBgBorder: "bg-gradient-to-br from-slate-950 to-slate-900 border border-slate-800/80 light_sakura:from-rose-50/40 light_sakura:to-rose-50/10 light_sakura:border-rose-100",
    conclusionTipText: "text-emerald-400 light_sakura:text-rose-600",
    /** Sesi 54: exact match juga di `ui/Input.tsx` (colorMap accent="indigo", dipasang sesi ini). */
    inputFocus: "focus:border-indigo-500 light_sakura:focus:border-rose-400",
    btnShadow: "shadow-lg shadow-emerald-500/20 light_sakura:shadow-rose-500/20",
    savingsProgressGlow: "bg-gradient-to-r from-emerald-500 to-teal-400 light_sakura:from-rose-500 light_sakura:to-rose-300",
    goldBadgeBg: "bg-emerald-500/10 light_sakura:bg-emerald-50/80",
  },
  gold: {
    gainBgBorder: "bg-emerald-500/8 border-emerald-500/15 light_sakura:bg-emerald-50/60 light_sakura:border-emerald-100",
    lossBgBorder: "bg-red-500/8 border-red-500/15 light_sakura:bg-red-50/60 light_sakura:border-red-100",
    infoBannerBgBorder: "border-indigo-500/15 bg-indigo-500/5 light_sakura:bg-indigo-50/40 light_sakura:border-indigo-100",
    cancelBtn: "bg-slate-800 light_sakura:bg-slate-100 hover:bg-slate-700",
    actionBtnBg: "bg-indigo-500/15 hover:bg-indigo-500/25 light_sakura:bg-rose-50",
    editBtnBg: "bg-slate-700/40 hover:bg-slate-700/60 light_sakura:bg-slate-100",
    deleteBtnBg: "bg-red-500/10 hover:bg-red-500/20 light_sakura:bg-red-50",
    statGramsBgBorder: "bg-amber-500/8 border border-amber-500/15 light_sakura:bg-amber-50/60 light_sakura:border-amber-100",
    statValBgBorder: "bg-indigo-500/8 border border-indigo-500/15 light_sakura:bg-indigo-50/60 light_sakura:border-indigo-100",
  },
  savings: {
    actionBtnBg: "bg-indigo-500/15 hover:bg-indigo-500/25 light_sakura:bg-rose-50",
    btnShadow: "shadow-indigo-600/20 light_sakura:shadow-rose-500/20",
  },
  installments: {
    btnShadow: "shadow-indigo-600/20 light_sakura:shadow-rose-500/20",
    gradientCardActive: "bg-gradient-to-br from-indigo-600 to-violet-800 text-white light_sakura:from-rose-500 light_sakura:to-rose-700",
    ringOffset: "ring-2 ring-offset-2 ring-offset-slate-900 ring-white/70 light_sakura:ring-offset-white",
    badgeSuccessBg: "bg-emerald-500/15 light_sakura:bg-emerald-500/10",
    progressGlow: "bg-gradient-to-r from-indigo-500 to-violet-500 light_sakura:from-rose-500 light_sakura:to-rose-400",
    actionBtnBg: "bg-indigo-500/15 hover:bg-indigo-500/25 light_sakura:bg-rose-500/10",
  },
  billReminders: {
    badgePaid: "bg-emerald-500/15 light_sakura:bg-emerald-500/10",
    badgeOverdue: "bg-red-500/15 light_sakura:bg-red-500/10",
    badgeDueSoon: "bg-amber-500/15 light_sakura:bg-amber-500/10",
    badgeUpcoming: "bg-slate-700/50 light_sakura:bg-slate-50",
    timelineLine: "before:bg-slate-800 light_sakura:before:bg-slate-100",
    timelineRing: "ring-slate-950 light_sakura:ring-white",
  },
  admin: {
    metricsAdminBgBorder: "border-indigo-500/20 bg-indigo-500/5 light_sakura:bg-rose-500/5 light_sakura:border-rose-500/20",
    metricsSuspendedBgBorder: "border-red-500/20 bg-red-500/5 light_sakura:bg-red-500/5 light_sakura:border-red-500/20",
    bulkActionBgBorder: "border-indigo-500/20 bg-indigo-500/5 light_sakura:bg-rose-500/5 light_sakura:border-rose-500/20",
    bulkActionBtnGrant: "text-amber-400 border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 light_sakura:bg-amber-500/10",
    tableCheckboxAccent: "accent-teal-500 light_sakura:accent-rose-500",
    tableDivide: "divide-slate-800 light_sakura:divide-slate-200/40",
    roleOwner: "bg-red-500/10 border-red-500/20 light_sakura:bg-red-50 light_sakura:border-red-100",
    roleAdmin: "bg-indigo-500/10 border-indigo-500/20 light_sakura:bg-rose-50 light_sakura:border-rose-100",
    statusSuspended: "bg-red-500/15 border border-red-500/35 light_sakura:bg-red-50 light_sakura:border-red-100",
    statusActive: "bg-emerald-500/15 border border-emerald-500/35 light_sakura:bg-emerald-50 light_sakura:border-emerald-100",
    aiMonitorPeriodHover: "hover:text-indigo-400 light_sakura:hover:text-rose-500",
    aiMonitorSuccessProgress: "bg-indigo-500 light_sakura:bg-rose-500",
  },
  toast: {
    successContainer: "bg-emerald-950/95 border-emerald-500/25 text-emerald-50 light_sakura:bg-emerald-50 light_sakura:border-emerald-200 light_sakura:text-emerald-800",
    successIconChip: "bg-emerald-500/15 light_sakura:bg-emerald-500/10",
    successIconColor: "text-emerald-400 light_sakura:text-emerald-600",
    errorContainer: "bg-red-950/95 border-red-500/25 text-red-50 light_sakura:bg-red-50 light_sakura:border-red-200 light_sakura:text-red-800",
    errorIconChip: "bg-red-500/15 light_sakura:bg-red-500/10",
    errorIconColor: "text-red-400 light_sakura:text-red-600",
    warningContainer: "bg-amber-950/95 border-amber-500/25 text-amber-50 light_sakura:bg-amber-50 light_sakura:border-amber-200 light_sakura:text-amber-800",
    warningIconChip: "bg-amber-500/15 light_sakura:bg-amber-500/10",
    warningIconColor: "text-amber-400 light_sakura:text-amber-600",
    infoContainer: "bg-slate-900/95 border-indigo-500/25 text-indigo-50 light_sakura:bg-indigo-50 light_sakura:border-indigo-200 light_sakura:text-indigo-800",
    infoIconChip: "bg-indigo-500/15 light_sakura:bg-indigo-500/10",
    infoIconColor: "text-indigo-400 light_sakura:text-indigo-600",
  },
  errorMonitor: {
    levelErrorColor: "text-red-400 light_sakura:text-red-600",
    levelWarningColor: "text-amber-400 light_sakura:text-amber-600",
    levelInfoColor: "text-sky-400 light_sakura:text-sky-600",
    levelErrorBg: "bg-red-500/10 border-red-500/30 light_sakura:bg-red-50 light_sakura:border-red-200",
    levelWarningBg: "bg-amber-500/10 border-amber-500/30 light_sakura:bg-amber-50 light_sakura:border-amber-200",
    levelInfoBg: "bg-sky-500/10 border-sky-500/30 light_sakura:bg-sky-50 light_sakura:border-sky-200",
    tabBorder: "border-slate-800 light_sakura:border-slate-200",
    tabActive: "bg-slate-700 light_sakura:bg-white text-indigo-400 light_sakura:text-indigo-600 shadow-sm",
    tabInactive: "text-slate-400 light_sakura:text-slate-500 hover:text-slate-200 light_sakura:hover:text-slate-700",
    btnRefresh: "border-slate-800 light_sakura:border-slate-200 bg-slate-800 light_sakura:bg-white hover:bg-slate-700 light_sakura:hover:bg-slate-50",
    statLabelTotal: "text-slate-200 light_sakura:text-slate-800",
    statCardBg: "bg-slate-950/40 light_sakura:bg-white",
    allClearBanner: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400 light_sakura:bg-emerald-50 light_sakura:border-emerald-200 light_sakura:text-emerald-700",
    progressBg: "bg-slate-800 light_sakura:bg-slate-100",
    tableDivide: "divide-slate-800 light_sakura:divide-slate-100",
    tableRowHover: "hover:bg-slate-800/50 light_sakura:hover:bg-slate-50/50",
    tableRowExpanded: "bg-slate-950/40 light_sakura:bg-slate-50",
    rowMessage: "text-slate-200 light_sakura:text-slate-800",
    paginationBtn: "border-slate-800 light_sakura:border-slate-200",
  },
  adminBackup: {
    heading: "text-slate-100 light_sakura:text-slate-800",
    btnSecondary: "px-3 py-2 text-xs font-bold rounded-xl border border-slate-800 hover:bg-slate-800 transition-colors cursor-pointer light_sakura:border-rose-200 light_sakura:hover:bg-rose-100",
    cardBgBorder: "rounded-2xl border border-slate-800 bg-slate-950/40 p-4 space-y-1.5 light_sakura:bg-rose-100/10 light_sakura:border-rose-200",
    cardText: "text-xs font-bold text-slate-200 light_sakura:text-slate-700",
    tableHeader: "text-left text-[10px] uppercase font-black tracking-wider border-b border-slate-800 light_sakura:border-slate-200",
    tableRow: "border-b border-slate-800/50 light_sakura:border-slate-100 last:border-0",
    label: "flex items-start gap-2 p-3 rounded-xl border border-slate-800 light_sakura:border-slate-200 cursor-pointer",
    labelSpan: "block text-xs font-bold text-slate-200 light_sakura:text-slate-800",
  },
  /**
   * Sesi 52: token per-file untuk `AdminMaintenance.tsx`. Semua kombinasi di
   * bawah ini genuinely 1x-pakai (sudah dicek cross-file, tidak ada exact
   * match di file lain) -- dipindah ke sini sesuai kebijakan baru sesi 52
   * (persiapan migrasi tema: single source of truth, bukan lagi soal reuse).
   */
  adminMaintenance: {
    loadingText: "text-slate-500 text-sm light_sakura:text-rose-500",
    bypassNoteBanner: "bg-blue-950/30 border border-blue-800/40 light_sakura:bg-blue-50 light_sakura:border-blue-100",
    bypassNoteIcon: "text-blue-400 light_sakura:text-blue-500",
    bypassNoteText: "text-blue-300 light_sakura:text-blue-600",
    toggleIconActive: "bg-amber-900/20 light_sakura:bg-amber-50 border-amber-800/50 light_sakura:border-amber-100 text-amber-500 light_sakura:text-amber-600",
    featureIconLocked: "bg-red-950/40 light_sakura:bg-red-50 border-red-900/50 light_sakura:border-red-100 text-red-400 light_sakura:text-red-600",
    featureIconUnlocked: "bg-emerald-950/40 light_sakura:bg-emerald-50 border-emerald-900/50 light_sakura:border-emerald-100 text-emerald-400 light_sakura:text-emerald-600",
    sandboxIcon: "text-violet-400 light_sakura:text-violet-500",
  },
  adminPremium: {
    statusBadgeSuccess: "bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 light_sakura:bg-emerald-50 light_sakura:border-emerald-200 light_sakura:text-emerald-700",
    statusBadgePending: "bg-amber-500/10 border border-amber-500/30 text-amber-400 light_sakura:bg-amber-50 light_sakura:border-amber-200 light_sakura:text-amber-700",
    statusBadgeExpired: "bg-slate-700/40 border border-slate-600/40 text-slate-400 light_sakura:bg-slate-100 light_sakura:border-slate-200 light_sakura:text-slate-600",
    statusBadgeFailed: "bg-red-500/10 border border-red-500/30 text-red-400 light_sakura:bg-red-50 light_sakura:border-red-200 light_sakura:text-red-700",
    /** Warna metrik amber (total revenue & status pending) -- dipakai 2x di kartu ringkasan. */
    metricAmber: "text-amber-500 light_sakura:text-amber-600",
    /** Divider baris tabel transaksi premium. */
    tableDivide: "divide-slate-800 light_sakura:divide-slate-100",
    /** Hover baris tabel transaksi premium. */
    tableRowHover: "hover:bg-slate-800/50 light_sakura:hover:bg-slate-50/50",
    /** Border tombol pagination (prev/next) -- dipakai 2x. */
    paginationBorder: "border-slate-800 light_sakura:border-slate-200",
    /** Background badge/kartu sandbox QRIS (ungu) -- dipakai 2x (kartu ringkasan & badge baris tabel). */
    sandboxBadgeBg: "bg-purple-900/20 light_sakura:bg-purple-50",
    /** Warna teks sandbox QRIS -- dipakai 2x. */
    sandboxText: "text-purple-400 light_sakura:text-purple-600",
    /**
     * Sesi 52 (kebijakan tokenisasi penuh): kombinasi berikut genuinely
     * 1x-pakai di `AdminPremiumMonitor.tsx` (dicek cross-file, tidak ada
     * exact match), tetap dikelompokkan di grup `adminPremium` karena
     * sudah ada namespace file ini alih-alih bikin grup per-file baru.
     */
    exportBtn: "bg-slate-800 light_sakura:bg-white border hover:bg-slate-700 light_sakura:hover:bg-slate-50",
    sandboxWarningBanner: "border-amber-500/40 bg-amber-500/10 text-amber-300 light_sakura:bg-amber-50 light_sakura:border-amber-200 light_sakura:text-amber-700",
    sandboxIconBorderActive: "border-purple-800/50 light_sakura:border-purple-100",
    metricEmerald: "text-emerald-500 light_sakura:text-emerald-600",
    metricRed: "text-red-500 light_sakura:text-red-600",
    tabActive: "bg-slate-700 light_sakura:bg-white text-white light_sakura:text-indigo-600",
    tabInactiveHover: "hover:text-slate-200 light_sakura:hover:text-slate-700",
    sandboxBadgeText: "text-purple-300 light_sakura:text-purple-600",
    normalBadge: "bg-indigo-900/20 light_sakura:bg-indigo-50 text-indigo-300 light_sakura:text-indigo-600",
  },
  adminSupportChat: {
    /** Warna spinner loading (list sesi & thread pesan) -- dipakai 2x. */
    spinnerText: "text-indigo-400 light_sakura:text-rose-400",
    /**
     * Ikon ilustrasi empty-state (MessagesSquare, daftar sesi kosong).
     * Exact match sama persis dengan ikon default di EmptyState.tsx --
     * sesi 54 sudah memasangnya di sana juga.
     */
    emptyIcon: "text-slate-700 light_sakura:text-rose-200",
    /**
     * Sesi 53 (kebijakan tokenisasi penuh): sisa kombinasi 1x-pakai di
     * `AdminSupportChat.tsx` (dicek cross-file, tidak ada exact match).
     */
    filterBtnBorder: "border border-slate-800 hover:bg-slate-800 transition-colors cursor-pointer light_sakura:border-rose-200 light_sakura:hover:bg-rose-100",
    sessionRowActiveBg: "bg-indigo-500/10 light_sakura:bg-rose-100/60",
    sessionRowHoverBg: "hover:bg-slate-800/50 light_sakura:hover:bg-slate-50",
    bubbleOtherBg: "bg-slate-800 text-slate-100 light_sakura:bg-slate-100 light_sakura:text-slate-700",
    inputText: "text-slate-100 light_sakura:text-slate-800",
  },
  adminUserModal: {
    avatarContainer: "bg-indigo-500/10 border-indigo-500/20 light_sakura:bg-rose-200/50 light_sakura:border-rose-300",
    roleAdmin: "bg-indigo-500/10 border-indigo-500/20 text-indigo-400 light_sakura:bg-rose-200/40 light_sakura:border-rose-300 light_sakura:text-rose-600",
    roleUser: "bg-slate-800 border-slate-700 text-slate-400 light_sakura:bg-slate-200 light_sakura:border-slate-300 light_sakura:text-slate-600",
  },
  updatePrompt: {
    cardBorder: "border-indigo-500/30 light_sakura:border-rose-300/50",
    closeBtn: "light_sakura:hover:text-slate-700 light_sakura:hover:bg-black/5",
    iconContainer: "bg-indigo-500/15 light_sakura:bg-rose-500/10",
    badge: "bg-indigo-500 text-white light_sakura:bg-rose-500",
    btnCancel: "light_sakura:bg-black/5 light_sakura:hover:bg-black/10",
    btnConfirm: "light_sakura:bg-rose-500 light_sakura:hover:bg-rose-400",
  },
  mobileBottomNav: {
    navContainer: "bg-slate-950/70 backdrop-blur-2xl backdrop-saturate-150 border border-white/10 shadow-[0_12px_32px_rgba(0,0,0,0.45)] rounded-full light_sakura:bg-white/85 light_sakura:backdrop-saturate-100 light_sakura:border-white/60 light_sakura:shadow-[0_12px_32px_rgba(244,63,94,0.18)]",
    sheetContainer: "bg-slate-900/70 backdrop-blur-2xl backdrop-saturate-150 border-t border-white/10 shadow-[0_-8px_40px_rgba(0,0,0,0.4)] light_sakura:bg-rose-50/85 light_sakura:backdrop-saturate-100 light_sakura:border-white/70",
    sheetGrip: "bg-slate-700 light_sakura:bg-rose-200",
    closeBtn: "hover:bg-white/10 light_sakura:hover:bg-slate-200",
    profileBg: "bg-slate-900 light_sakura:bg-rose-200",
    navLinkActive: "bg-indigo-600 text-white shadow-lg shadow-indigo-600/10 light_sakura:bg-rose-500",
    navLinkInactive: "hover:bg-slate-800 light_sakura:hover:bg-rose-100",
    footerBtn: "border-slate-800 hover:bg-slate-800 light_sakura:border-rose-200 light_sakura:hover:bg-rose-100/50",
    logoutBtn: "bg-slate-950/40 border-red-500/20 text-red-400 hover:bg-red-500/10 light_sakura:bg-red-50 light_sakura:border-red-200 light_sakura:text-red-600 light_sakura:hover:bg-red-100",
  },
  budgetProgressCard: {
    /**
     * Sesi 54: selain jadi badge status budget, warna ini exact match
     * (dengan "rounded-full p-2.5" + `tokens.text.accentStrong`) untuk
     * ikon chip di modal -- ditemukan identik di 4 file: `Budget.tsx`,
     * `HistoryEditModal.tsx`, `ExportSummaryModal.tsx`,
     * `ExportFullModal.tsx` (semua dipasang sesi ini).
     */
    badgeBgSafe: "bg-indigo-500/15 light_sakura:bg-indigo-50",
    badgeTextSafe: "text-indigo-400 light_sakura:text-indigo-600",
    badgeBgWarning: "bg-amber-500/15 light_sakura:bg-amber-50",
    badgeTextWarning: "text-amber-400 light_sakura:text-amber-600",
    badgeBgDanger: "bg-red-500/15 light_sakura:bg-red-50",
    badgeTextDanger: "text-red-400 light_sakura:text-red-600",
    deleteBtn: "text-red-400/70 hover:text-red-500 light_sakura:text-red-500/80 light_sakura:hover:text-red-600",
  },
  newTransaction: {
    headerStripeExpense: "bg-red-500 light_sakura:bg-rose-400",
    headerStripeIncome: "bg-emerald-500",
    typeToggleActiveExpense: "bg-red-500/15 border border-red-500/60 text-red-400 light_sakura:bg-red-50 light_sakura:border-red-300 light_sakura:text-red-600",
    typeToggleActiveIncome: "bg-emerald-500/15 border border-emerald-500/60 text-emerald-400 light_sakura:bg-emerald-50 light_sakura:border-emerald-300 light_sakura:text-emerald-600",
    amountInputExpense: "bg-red-500/5 border-red-500/20 light_sakura:bg-red-50/40 light_sakura:border-red-200",
    amountInputIncome: "bg-emerald-500/5 border-emerald-500/20 light_sakura:bg-emerald-50/40 light_sakura:border-emerald-200",
    amountDisplayExpense: "text-red-400 light_sakura:text-red-500",
    amountDisplayIncome: "text-emerald-400 light_sakura:text-emerald-600",
    categoryPillSelectedExpense: "bg-red-500/15 border-red-500/50 text-red-300 light_sakura:bg-rose-100 light_sakura:border-rose-400 light_sakura:text-rose-700",
    categoryPillSelectedIncome: "bg-emerald-500/15 border-emerald-500/50 text-emerald-300 light_sakura:bg-emerald-100 light_sakura:border-emerald-400 light_sakura:text-emerald-700",
    /** Background segmented control (toggle jenis transaksi & wallet picker) -- dipakai 2x. */
    segmentedControlBg: "bg-slate-950/60 border border-slate-800/50 light_sakura:bg-rose-50/30 light_sakura:border-rose-100",
    /** Hover text tombol/pill tidak aktif -- dipakai 4x. */
    inactiveHoverText: "hover:text-slate-300 light_sakura:hover:text-slate-600",
    /**
     * Sesi 52 (kebijakan tokenisasi penuh): sisa kombinasi 1x-pakai di
     * `NewTransaction.tsx` (dicek cross-file, tidak ada exact match).
     */
    quickAddChipBorder: "bg-slate-800/60 border border-slate-700/50 light_sakura:bg-slate-50 light_sakura:border-rose-100",
    walletSelectedActive: "bg-indigo-600 text-white shadow-sm light_sakura:bg-rose-500",
    amountDisplayPlaceholder: "text-slate-700 light_sakura:text-slate-300",
    amountInputPlaceholder: "placeholder:text-slate-600 light_sakura:placeholder:text-slate-400",
    categoryPillInactive: "bg-slate-800/50 border-slate-700/50 hover:border-slate-600 hover:text-slate-300 light_sakura:bg-slate-50 light_sakura:border-rose-100 light_sakura:hover:bg-rose-50",
    submitBtnExpense: "bg-red-600 hover:bg-red-500 shadow-lg shadow-red-900/20 light_sakura:bg-rose-500 light_sakura:hover:bg-rose-400",
  },
  supportWidget: {
    fabButton: "bg-indigo-600 hover:bg-indigo-500 shadow-indigo-900/40 light_sakura:bg-rose-500 light_sakura:hover:bg-rose-400 light_sakura:shadow-rose-900/20",
    chatBubbleUser: "bg-indigo-600 text-white light_sakura:bg-rose-500",
    closeBtn: "text-slate-400 hover:text-white light_sakura:text-slate-500 light_sakura:hover:text-slate-900",
    /** Gradient avatar bot/agent -- dipakai 5x (header, bubble chat, avatar list, dsb). */
    gradientAvatar: "bg-gradient-to-br from-indigo-600 to-indigo-400 light_sakura:from-rose-500 light_sakura:to-rose-300",
    /** Ring highlight seleksi kategori/opsi -- dipakai 2x. */
    ringHighlight: "ring-indigo-500/40 light_sakura:ring-rose-300/60",
    /** Ring fokus input pesan -- dipakai 2x. */
    inputFocusRing: "focus:ring-indigo-500 light_sakura:focus:ring-rose-400",
    /**
     * Sesi 54 (kebijakan tokenisasi penuh): sisa kombinasi 1x-pakai di
     * `SupportChatWidget.tsx` (dicek cross-file, tidak ada exact match).
     */
    scrollFadeGradient: "pointer-events-none absolute right-0 top-0 bottom-1 w-8 bg-gradient-to-l from-slate-900 light_sakura:from-white to-transparent",
    categoryHoverBorder: "hover:border-indigo-500/40 light_sakura:border-rose-200",
  },
  sidebar: {
    brandBg: "bg-slate-950/55 backdrop-blur-2xl backdrop-saturate-150 border-white/10 light_sakura:bg-white/70 light_sakura:backdrop-saturate-100 light_sakura:border-white/70",
    profileWidget: "backdrop-blur-sm bg-slate-900/40 border-slate-800/60 light_sakura:bg-rose-50/40 light_sakura:border-rose-100/50",
    menuItemActive: "bg-indigo-600 text-white shadow-lg shadow-indigo-600/10 light_sakura:bg-rose-500",
    menuItemInactive: "hover:bg-slate-900 light_sakura:hover:bg-rose-100/70",
    footerAction: "border-slate-900 hover:bg-slate-900 light_sakura:border-rose-200 light_sakura:hover:bg-rose-100/50",
    logoutBtn: "bg-slate-950/40 border-red-500/20 text-red-400 hover:bg-red-500/10 light_sakura:bg-red-50 light_sakura:border-red-200 light_sakura:hover:bg-red-100/70",
    /**
     * Sesi 48: tombol ikon bulat collapsed-state (bahasa/tema/mute) di
     * footer sidebar. Exact match diverifikasi 3x dalam file yang sama
     * (Sidebar.tsx) -- belum ditemukan duplikat di file lain.
     */
    collapsedIconBtn: "p-2 rounded-xl border border-slate-900 hover:bg-slate-900 cursor-pointer light_sakura:border-rose-200 light_sakura:hover:bg-rose-100/50",
    /**
     * Sesi 54 (kebijakan tokenisasi penuh): sisa kombinasi 1x-pakai di
     * `Sidebar.tsx` (dicek cross-file, tidak ada exact match).
     */
    outerShadow: "shadow-[8px_0_32px_rgba(0,0,0,0.35)] light_sakura:shadow-[8px_0_32px_rgba(244,63,94,0.08)]",
    collapseBtnHover: "p-1 rounded-lg hover:bg-white/5 light_sakura:hover:bg-slate-200 cursor-pointer hidden md:block hover:text-white light_sakura:hover:text-slate-800 transition-all duration-205",
    expandBtnBg: "bg-slate-950 border-slate-800 hover:text-white light_sakura:bg-slate-100 light_sakura:border-slate-200",
  },
  budget: {
    statusDanger: "bg-red-500/15 light_sakura:bg-red-50",
    statusWarning: "bg-amber-500/15 light_sakura:bg-amber-50",
    statusSafe: "bg-emerald-500/15 light_sakura:bg-emerald-50",
    addBtn: "bg-indigo-600 hover:bg-indigo-500 light_sakura:bg-rose-500 light_sakura:hover:bg-rose-400",
    /** Ikon ilustrasi empty-state (mis. PiggyBank) -- dipakai 2x. */
    emptyStateIcon: "text-slate-600 light_sakura:text-slate-400",
    /** Hover tombol close/tutup modal -- dipakai 2x. */
    closeBtnHover: "hover:bg-slate-800 hover:text-white light_sakura:hover:bg-rose-100",
    /**
     * Sesi 54 (kebijakan tokenisasi penuh): sisa kombinasi 1x-pakai di
     * `Budget.tsx` (dicek cross-file, tidak ada exact match).
     */
    iconChipIndigoSoft: "w-11 h-11 rounded-2xl bg-indigo-500/10 flex items-center justify-center light_sakura:bg-rose-500/10 shrink-0",
    /** Warna teks tombol batal di light mode saja (dark mode pakai warna default/inherited). */
    cancelBtnTextLight: "light_sakura:text-slate-600",
  },
  history: {
    statExpense: "bg-red-500/8 border-red-500/15 light_sakura:bg-red-50/60 light_sakura:border-red-100",
    statIncome: "bg-emerald-500/8 border-emerald-500/15 light_sakura:bg-emerald-50/60 light_sakura:border-emerald-100",
    statBalancePositive: "bg-indigo-500/8 border-indigo-500/15 light_sakura:bg-indigo-50/60 light_sakura:border-indigo-100",
    statBalanceNegative: "bg-orange-500/8 border-orange-500/15 light_sakura:bg-orange-50/60 light_sakura:border-orange-100",
    typeFilterActiveExpense: "bg-red-500/15 border-red-500/50 text-red-400 light_sakura:bg-red-50 light_sakura:border-red-300 light_sakura:text-red-600",
    typeFilterActiveIncome: "bg-emerald-500/15 border-emerald-500/50 text-emerald-400 light_sakura:bg-emerald-50 light_sakura:border-emerald-300 light_sakura:text-emerald-600",
    typeFilterActiveAll: "bg-indigo-500/15 border-indigo-500/50 text-indigo-400 light_sakura:bg-indigo-50 light_sakura:border-indigo-300 light_sakura:text-indigo-600",
    typeFilterInactive: "bg-slate-800/40 border-slate-700/40 text-slate-500 light_sakura:bg-slate-50 light_sakura:border-rose-100 light_sakura:text-slate-400 light_sakura:hover:text-slate-600",
    walletFilter: "bg-indigo-500/10 border-indigo-500/30 text-indigo-300 light_sakura:bg-rose-50 light_sakura:border-rose-200 light_sakura:text-rose-600",
    loadingOverlay: "bg-slate-950/85",
  },

  /**
   * Pola UI kartu Telegram (upsell terkunci, badge terhubung, kartu kode QR).
   * Sama persis antara sisa literal lama di Settings.tsx dan komponen baru
   * TelegramSettings.tsx (hasil ekstraksi) -- ditambahkan setelah kemunculan
   * ke-2 di file berbeda ditemukan (sesi 42).
   */
  adminBroadcast: {
    /** Border kartu ringkasan target broadcast (jumlah penerima) -- dipakai 3x. */
    summaryCardBorder: "border-slate-700 light_sakura:border-slate-100",
    /** Badge status kirim sukses (riwayat broadcast). */
    statusSuccessBadge: "bg-emerald-900/20 light_sakura:bg-emerald-50 border-emerald-800/50 light_sakura:border-emerald-100 text-emerald-300 light_sakura:text-emerald-700",
    /** Badge status kirim pending/gagal (riwayat broadcast). */
    statusPendingBadge: "bg-amber-900/20 light_sakura:bg-amber-50 border-amber-800/50 light_sakura:border-amber-100 text-amber-300 light_sakura:text-amber-700",
    /** Banner peringatan (mis. broadcast tidak bisa dibatalkan). */
    warningBannerBg: "bg-amber-900/20 light_sakura:bg-amber-50 border-amber-800/50 light_sakura:border-amber-100",
    /**
     * Sesi 54 (kebijakan tokenisasi penuh): sisa kombinasi 1x-pakai
     * (dicek cross-file, tidak ada exact match).
     */
    warningTextAmber: "text-amber-200 light_sakura:text-amber-700",
  },

  telegramCard: {
    lockedIconText: "text-amber-500 light_sakura:text-rose-500",
    upsellBoxBorderBg: "border-amber-500/25 bg-amber-500/5 light_sakura:border-rose-300/30 light_sakura:bg-rose-50/50",
    upsellIconChipBg: "bg-amber-500/10 text-amber-500 light_sakura:bg-rose-500/10 light_sakura:text-rose-500",
    upsellCtaBtn: "bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/10 light_sakura:bg-rose-500 light_sakura:hover:bg-rose-400 light_sakura:text-white",
    linkedBadgeBg: "border-emerald-500/20 bg-emerald-500/5 light_sakura:border-emerald-250 light_sakura:bg-emerald-50/20 shadow-xs",
    linkedAvatarRing: "border-slate-900 light_sakura:border-white",
    linkedLabelText: "text-slate-200 light_sakura:text-slate-700",
    qrBoxBorderBg: "border-indigo-500/30 bg-indigo-500/5 light_sakura:border-rose-200 light_sakura:bg-rose-50/40",
    qrCodeBoxBg: "bg-slate-950 light_sakura:bg-white border-slate-800 light_sakura:border-rose-150",
    divider: "bg-slate-800/50 light_sakura:bg-rose-100",
  },

  voicePreview: {
    /**
     * Tombol batal/tutup (slate netral) di modal preview suara -- dipakai
     * 2x di file ini (state error & state konfirmasi). Exact match JUGA
     * ditemukan di `ReceiptPreview.tsx` (1x) -- belum dipasang ke sana
     * karena di luar cakupan target sesi 48, dicatat untuk sesi berikutnya.
     */
    cancelBtn: "bg-slate-800 hover:bg-slate-700/80 border-slate-800 light_sakura:bg-slate-100 light_sakura:hover:bg-slate-200/80 light_sakura:border-transparent",
    /**
     * Tombol konfirmasi/coba lagi (indigo/rose) -- dipakai 2x di file ini.
     * Sesi 54: exact match juga di `ReceiptPreview.tsx` (tombol simpan,
     * dipasang sesi ini).
     */
    confirmBtn: "bg-indigo-600 hover:bg-indigo-500 shadow-indigo-600/15 light_sakura:bg-rose-500 light_sakura:hover:bg-rose-400",
  },
  premiumModal: {
    modalBg: "bg-slate-900 light_sakura:bg-rose-50/90",
    closeBtn: "text-slate-500 hover:text-white light_sakura:hover:text-slate-800 light_sakura:hover:bg-rose-100",
    /** Kotak info (metode bayar / detail) di dalam modal -- dipakai 2x. */
    infoBoxBg: "bg-slate-800/50 light_sakura:bg-white light_sakura:border light_sakura:border-rose-100",
    qrWrapperBorder: "light_sakura:border light_sakura:border-rose-100",
    /**
     * Sesi 54: teks catatan kaki (dicek cross-file, tidak ada exact
     * match).
     */
    footerNoteText: "text-indigo-300 light_sakura:text-rose-500",
  },
  /**
   * Sesi 51: kelas panel modal generik (border+bg+text) untuk modal custom
   * yang TIDAK memakai komponen `Modal.tsx` (mis. modal transfer/konfirmasi
   * transaksi punya animasi/layout sendiri). Exact match diverifikasi di 2
   * file: `WalletTransferModal.tsx` & `ConfirmTransactionModal.tsx`
   * (masing-masing 1x, string identik penuh termasuk urutan class).
   */
  modal: {
    panel:
      "border border-indigo-500/20 bg-slate-900 text-white light_sakura:bg-rose-50/90 light_sakura:text-slate-800 light_sakura:border-rose-100",
    /**
     * Tombol close (X) modal -- exact match ditemukan di 4 file:
     * `WalletTransferModal.tsx`, `ConfirmTransactionModal.tsx` (dipasang
     * sesi 51), `WalletTopUpModal.tsx` & `HistoryEditModal.tsx` (dipasang
     * sesi 52, "prioritas tambahan" -- pola sama persis, termasuk varian
     * dengan `disabled:opacity-40 disabled:cursor-not-allowed` disisipkan
     * di `WalletTopUpModal.tsx`). Semua 4 pemakai sudah terpasang; urutan
     * class tidak mempengaruhi hasil CSS karena token ini cuma kumpulan
     * class lewat `cx()`.
     */
    closeBtn: "text-slate-400 hover:bg-slate-800 hover:text-white cursor-pointer light_sakura:hover:bg-rose-100",
    /**
     * Sesi 54: varian panel `Modal.tsx` (komponen generik dengan prop
     * `variant`) -- BEDA dari `panel` di atas (yang khusus modal custom
     * non-komponen). Genuinely 1x-pakai per varian (dicek cross-file).
     */
    panelDanger: "border-red-500/30 dark_obsidian:bg-slate-900 light_sakura:border-red-200",
    panelNormal: "border-indigo-500/20 dark_obsidian:bg-slate-900 light_sakura:bg-rose-50/90 light_sakura:border-rose-100",
    /**
     * Sesi 54: border merah tipis untuk modal konfirmasi hapus. Exact
     * match di 2 file: `DeleteAccountModal.tsx` & `HistoryDeleteModal.tsx`
     * (keduanya dipasang sesi ini).
     */
    dangerBorder: "border-red-500/30 light_sakura:border-red-200",
  },
  settings: {
    /**
     * Sesi 53: exact match juga di `AdminPanel.tsx` &
     * `MobileSettingsDetailPage.tsx` (dipasang sesi ini).
     */
    cardBorder: "border-slate-800/60 light_sakura:border-rose-100/40",
    /**
     * Sesi 53: exact match juga di `AdminPanel.tsx` &
     * `MobileSettingsDetailPage.tsx` (dipasang sesi ini).
     */
    sectionBorder: "border-slate-800/50 light_sakura:border-rose-100/30",
    profileCardBgBorder: "bg-slate-950/40 border border-slate-800/60 light_sakura:bg-rose-50/20 light_sakura:border-rose-100/50",
    /** Heading "h3" section pengaturan (mis. "Nama Tampilan", "Keamanan Akun") -- dipakai 5x di Settings.tsx. */
    sectionHeadingBorder:
      "text-slate-200 border-b border-slate-800/10 pb-2.5 light_sakura:text-slate-800 light_sakura:border-rose-100",
    /** Varian tanpa border, dipakai saat border dipindah ke wrapper div terpisah. */
    sectionHeadingText: "text-slate-200 light_sakura:text-slate-800",
    /** Divider bawah tanpa warna teks (border-nya saja), dipakai saat heading & border ada di elemen berbeda. */
    sectionDivider: "border-b border-slate-800/10 pb-2.5 light_sakura:border-rose-100",
    /** Kartu kecil di dalam section (mis. daftar sesi login, log admin) -- dipakai 5x di Settings.tsx. */
    innerCardBgBorder:
      "bg-slate-950 border border-slate-800 light_sakura:bg-rose-100/35 light_sakura:border-rose-200/50",
    /**
     * Background kotak input OTP 6-digit -- dipakai 3x di Settings.tsx.
     * Sesi 53: exact match (bagian bg-nya saja) juga di
     * `SecuritySettings.tsx` (3x, dipasang sesi ini -- dipakai untuk 3
     * kotak `<PinCodeInput>` password lama/baru/konfirmasi).
     */
    otpInputBg: "bg-slate-950 light_sakura:bg-slate-50",
    /** Badge status "Telegram Terhubung" -- dipakai 2x (state aktif & preview) di Settings.tsx. */
    telegramLinkedBadge:
      "bg-indigo-600/10 border-indigo-500 text-indigo-400 light_sakura:bg-rose-500/10 light_sakura:border-rose-550 light_sakura:text-rose-600",
    /** Divider antar baris di dalam innerCardBgBorder -- dipakai 2x (log admin). */
    divideSubtle: "divide-slate-800/60 light_sakura:divide-rose-200/40",
    /**
     * Background avatar bulat inisial user. Exact match di 3 file:
     * SettingsMobileMenu.tsx, ProfileSettings.tsx (dipasang sesi 46),
     * Settings.tsx (dipasang sesi 53).
     */
    avatarBg: "bg-indigo-600 light_sakura:bg-rose-500",
    /**
     * Badge kecil "Premium" di sebelah nama user. Exact match di 3 file
     * yang sama dengan `avatarBg` di atas. Settings.tsx dipasang sesi 53.
     */
    premiumBadge: "bg-amber-500/15 text-amber-400 light_sakura:bg-rose-100 light_sakura:text-rose-600",
    /**
     * Tombol kecil dismiss/aksi sekunder di sebelah badge premium. Exact
     * match di SettingsMobileMenu.tsx & ProfileSettings.tsx.
     */
    premiumDismissBtn: "bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors light_sakura:bg-slate-100 light_sakura:text-slate-500",
    /**
     * Pill pilihan opsi (bahasa/tema) kondisi tidak dipilih. Exact match
     * di LanguageSettings.tsx (2x, dipasang sesi ini) & ThemeSettings.tsx
     * (2x, belum dipasang -- di luar cakupan target sesi 46).
     */
    optionInactive: "bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-900 light_sakura:bg-rose-50/20 light_sakura:border-rose-100 light_sakura:text-slate-500",
    /**
     * Sesi 53: tombol toggle bahasa kecil di header Settings.tsx --
     * genuinely 1x-pakai (mirip `premiumDismissBtn` di atas tapi TANPA
     * warna teks slate-400/500 baked in -- warna teks dipasang terpisah
     * lewat `tokens.text.muted` di pemanggil, jadi bukan exact match).
     */
    langToggleBtnBg: "bg-slate-800 hover:text-slate-200 transition-colors light_sakura:bg-slate-100",
    /**
     * Sesi 53: border tombol "putuskan tautan Telegram" di Settings.tsx.
     * MIRIP tapi TIDAK exact match dengan tombol sejenis di
     * `PrivacySettings.tsx` (yang membakar warna teks slate-200/700 di
     * dalam class-nya) -- tetap token terpisah, tidak dipaksa gabung.
     */
    unlinkBtnBorder: "border border-slate-700 hover:bg-slate-800 light_sakura:border-rose-200",
    /**
     * Sesi 53: kotak info fitur Telegram (bg sunken + border tipis).
     * BEDA dari `profileCardBgBorder` di atas (border-slate-800/60,
     * bukan /50). Exact match di 2 file: `Settings.tsx` &
     * `TelegramSettings.tsx` (keduanya dipasang sesi ini).
     */
    sunkenBorderPanel: "bg-slate-950/40 border border-slate-800/50 light_sakura:bg-rose-50/20 light_sakura:border-rose-100/50",
  },
  /**
   * Sesi 52: token per-file untuk `Dashboard.tsx`. Genuinely 1x-pakai
   * (dicek cross-file), dipindah ke sini sesuai kebijakan tokenisasi
   * penuh sesi 52.
   */
  dashboard: {
    goalCompleteBanner: "bg-gradient-to-r from-emerald-500/10 to-indigo-500/10 border border-emerald-500/20 shadow-xl shadow-emerald-900/5 light_sakura:from-rose-500/10 light_sakura:to-indigo-500/10 light_sakura:border-rose-300/30",
    seeAllBtnHover: "hover:text-slate-300 hover:bg-slate-800/50 light_sakura:hover:text-slate-700 light_sakura:hover:bg-rose-50",
    ctaButtonGradient: "bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 border border-indigo-500/30 light_sakura:from-rose-500 light_sakura:to-rose-600 light_sakura:hover:from-rose-600 light_sakura:hover:to-rose-700 light_sakura:border-rose-300",
  },
  /**
   * Sesi 52: token per-file untuk `DashboardOverviewCard.tsx`. Genuinely
   * 1x-pakai (dicek cross-file). `heroCardGradient` menggabungkan 2 string
   * literal terpisah (baris non-light_sakura + baris light_sakura) yang
   * sebelumnya dipecah lewat `cx(...)` multi-arg menjadi 1 token string.
   */
  dashboardOverviewCard: {
    heroCardGradient: "border-indigo-500/20 bg-gradient-to-br from-indigo-500/10 via-slate-900 to-slate-900 shadow-indigo-900/10 light_sakura:from-rose-100/60 light_sakura:via-white light_sakura:to-white light_sakura:border-rose-200/50",
    labelHoverText: "group-hover:text-slate-300 light_sakura:group-hover:text-slate-700",
    statChipEmerald: "border border-emerald-500/15 bg-emerald-500/5 light_sakura:bg-emerald-50/40 light_sakura:border-emerald-100",
    statChipAmber: "border border-amber-500/15 bg-amber-500/5 light_sakura:bg-amber-50/40 light_sakura:border-amber-100",
  },
  /**
   * Sesi 53: token per-file untuk `MobileSettingsDetailPage.tsx`.
   * Genuinely 1x-pakai (dicek cross-file).
   */
  mobileSettingsDetailPage: {
    backBtn: "bg-slate-950/60 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer light_sakura:bg-rose-50 light_sakura:border-rose-100 light_sakura:text-slate-600 light_sakura:hover:bg-rose-100",
  },
  /**
   * Sesi 53: token per-file untuk `ReceiptUploader.tsx`. Genuinely
   * 1x-pakai (dicek cross-file, termasuk terhadap `chip.accentAmberRose`
   * yang sudah dipakai file ini sejak sesi 49 -- tidak ada tumpang tindih).
   */
  receiptUploader: {
    dropzoneBorder: "border-slate-800 bg-slate-900/60 hover:border-slate-700 light_sakura:border-rose-200 light_sakura:bg-rose-50/10 light_sakura:hover:border-rose-400",
    iconBoxBorder: "bg-indigo-500/5 border border-indigo-500/10 light_sakura:bg-rose-100/30 light_sakura:border-rose-100/50",
    captionText: "text-slate-200 light_sakura:text-slate-700",
    lockIcon: "text-amber-400 light_sakura:text-rose-500",
  },
  /**
   * Sesi 53: token per-file untuk `HistoryGroupedList.tsx`. Genuinely
   * 1x-pakai (dicek cross-file). Baris `text-red-400 light_sakura:
   * text-red-600` / `text-emerald-400 light_sakura:text-emerald-600` di
   * file ini TIDAK dipindah ke sini karena sudah exact match dengan
   * token generik `text.danger` / `text.success` yang sudah ada --
   * dipasang langsung pakai token itu, bukan token per-file baru.
   */
  historyGroupedList: {
    divideSubtle: "divide-slate-800/50 light_sakura:divide-rose-100/40",
    expenseChip: "bg-red-500/10 text-red-400 light_sakura:bg-red-50 light_sakura:text-red-500",
    incomeChip: "bg-emerald-500/10 text-emerald-400 light_sakura:bg-emerald-50 light_sakura:text-emerald-500",
  },
  /**
   * Sesi 53: token per-file untuk `DashboardWalletSelectorCard.tsx`.
   * Genuinely 1x-pakai (dicek cross-file). Baris `bg-indigo-500/15 ...
   * light_sakura:bg-rose-500/15` (ikon chip) & `hover:text-indigo-400
   * light_sakura:hover:text-rose-500` (hover label) di file ini TIDAK
   * dipindah ke sini karena sudah exact match dengan token generik
   * `chip.accentIndigo` / `hover.textAccent` yang sudah ada -- dipasang
   * langsung pakai token itu.
   */
  dashboardWalletSelectorCard: {
    blackOverlayBg: "bg-black/10 hover:bg-black/15 light_sakura:bg-white/40 light_sakura:hover:bg-white/60",
    editBorderHover: "border hover:border-indigo-400/50 light_sakura:hover:border-rose-300",
    actionChipBg: "bg-indigo-500/15 hover:bg-indigo-500/25 light_sakura:bg-rose-500/15 light_sakura:hover:bg-rose-500/25",
  },
  /**
   * Sesi 54: token per-file untuk `ResetPasswordModal.tsx`. Genuinely
   * 1x-pakai (dicek cross-file, tidak ada exact match).
   */
  resetPasswordModal: {
    modalShadow: "light_sakura:shadow-rose-150/10",
    closeBtnHover: "hover:text-white rounded-full bg-slate-950/20 hover:bg-slate-800 transition-colors cursor-pointer light_sakura:hover:text-slate-800 light_sakura:hover:bg-rose-50",
    iconChipBg: "p-3 w-14 h-14 bg-indigo-600/10 rounded-2xl flex items-center justify-center mb-4 shadow-inner light_sakura:bg-rose-500/10",
  },
  /**
   * Sesi 54: token per-file untuk `WalletTopUpModal.tsx`. Genuinely
   * 1x-pakai (dicek cross-file, tidak ada exact match -- varian emerald
   * dari `modal.panel` yang aksennya indigo, sengaja tidak dipaksa gabung).
   */
  walletTopUpModal: {
    panelEmerald: "border border-emerald-500/20 bg-slate-900 text-white light_sakura:bg-rose-50/90 light_sakura:text-slate-800 light_sakura:border-rose-100",
  },
  /**
   * Sesi 54: token per-file untuk `ErrorState.tsx`. Genuinely 1x-pakai
   * (dicek cross-file, tidak ada exact match).
   */
  errorState: {
    iconCircleBg: "bg-red-500/10 light_sakura:bg-red-50",
    retryBtn: "bg-red-500/10 hover:bg-red-500/20 text-red-300 light_sakura:bg-red-50 light_sakura:hover:bg-red-100 light_sakura:text-red-600",
  },
  /**
   * Sesi 54: token per-file untuk `DashboardRecentTransactions.tsx`.
   * Genuinely 1x-pakai (dicek cross-file, tidak ada exact match).
   */
  dashboardRecentTransactions: {
    aiWebIconChip: "bg-indigo-500/15 p-2 rounded-xl light_sakura:bg-rose-50 flex items-center justify-center",
    showAllBtnHover: "cursor-pointer px-3.5 py-2 hover:bg-slate-800 rounded-xl text-[clamp(0.6188rem,2.86vw,0.6875rem)] font-bold light_sakura:hover:bg-rose-50 flex items-center gap-1.5 transition-colors",
    rowCardBg: "flex items-center justify-between p-4 rounded-2xl bg-slate-950/40 hover:bg-slate-950/60 border border-slate-800/40 hover:border-slate-700 transition-all duration-200 light_sakura:bg-rose-50/20 light_sakura:border-rose-100/10",
    dotSeparator: "w-1 h-1 rounded-full bg-slate-700 light_sakura:bg-rose-100",
  },
  /**
   * Sesi 54: background pulse skeleton loading. Exact match VERBATIM 4x
   * dalam file yang sama (`SkeletonLoader.tsx`) -- token generik karena
   * nama filenya sendiri sudah generik/reusable (dipanggil dari banyak
   * halaman lain).
   */
  skeleton: {
    pulseBg: "bg-slate-800/60 light_sakura:bg-rose-200/60",
  },
  /**
   * Sesi 54: token per-file untuk `HistoryExport.tsx`. Genuinely 1x-pakai
   * per varian (dicek cross-file, tidak ada exact match).
   */
  historyExport: {
    optionActive: "border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/15 text-amber-400 light_sakura:text-rose-600 light_sakura:border-rose-300/30 light_sakura:bg-rose-50/50",
    optionInactive: "border-indigo-500/20 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 light_sakura:text-indigo-600",
  },
  /**
   * Sesi 54: token per-file untuk `DashboardHeader.tsx`. Exact match
   * VERBATIM 2x dalam file yang sama.
   */
  dashboardHeader: {
    weatherBadge: "flex items-center gap-1.5 px-2.5 py-1 bg-white/10 backdrop-blur-sm border border-white/10 rounded-full text-xs font-medium shrink-0 whitespace-nowrap light_sakura:bg-rose-50 light_sakura:border-rose-100/50 transition-colors duration-300",
  },
  /**
   * Sesi 54: token untuk `ui/Card.tsx`. `borderSubtle` genuinely 1x-pakai
   * (dicek cross-file, tidak ada exact match) -- sengaja BEDA dari
   * `border.accent` (lihat komentar di Card.tsx: border="subtle" tetap
   * menampilkan border rose di light_sakura meski nyaris menyatu dengan
   * bg di dark_obsidian, ini bukan bug).
   */
  card: {
    borderSubtle: "border-slate-900 light_sakura:border-rose-100",
  },
  /**
   * Sesi 54: token per-file untuk `VoiceRecorder.tsx`. Genuinely 1x-pakai
   * (dicek cross-file, tidak ada exact match).
   */
  voiceRecorder: {
    micBtnActive: "bg-indigo-500/10 border-indigo-500/20 text-indigo-400 hover:bg-indigo-500/20 light_sakura:bg-rose-500/10 light_sakura:border-rose-500/20 light_sakura:text-rose-500",
  },
  /**
   * Sesi 54: token per-file untuk `MobileTopBar.tsx`. Genuinely 1x-pakai
   * (dicek cross-file, tidak ada exact match).
   */
  mobileTopBar: {
    headerBg: "bg-slate-950/90 text-white dark_obsidian:bg-slate-950/90 light_sakura:bg-rose-500/90 light_sakura:text-white",
    accentGradientLine: "bg-gradient-to-r from-transparent via-indigo-400/70 to-transparent light_sakura:via-rose-200",
  },
  /**
   * Sesi 54: token untuk `MaintenanceBanner.tsx`. Genuinely 1x-pakai
   * (dicek cross-file, tidak ada exact match).
   */
  maintenanceBanner: {
    bannerBg: "bg-amber-500/15 border-amber-500/40 text-amber-300 light_sakura:bg-amber-100 light_sakura:text-amber-700 light_sakura:border-amber-300",
  },
  /**
   * Sesi 54: token per-file untuk `DashboardBudgetSummary.tsx`. Genuinely
   * 1x-pakai (dicek cross-file, tidak ada exact match).
   */
  dashboardBudgetSummary: {
    iconChipBg: "w-10 h-10 rounded-2xl bg-indigo-500/10 flex items-center justify-center shrink-0 light_sakura:bg-rose-500/10",
    chevronBtnHover: "hover:text-white light_sakura:hover:text-rose-600",
  },
  /**
   * Sesi 54: token untuk `AdminBackBar.tsx`. Genuinely 1x-pakai (dicek
   * cross-file, tidak ada exact match).
   */
  adminBackBar: {
    btnBg: "bg-slate-900/60 border-slate-800 hover:bg-slate-800 hover:text-white light_sakura:bg-white light_sakura:border-rose-200 light_sakura:hover:bg-rose-100",
  },
  /**
   * Sesi 54: token per-file untuk `PrivacySettings.tsx`. Genuinely
   * 1x-pakai (dicek cross-file, tidak ada exact match).
   */
  privacySettings: {
    exportBtn: "w-full cursor-pointer border border-slate-700 hover:bg-slate-800 py-2.5 rounded-xl font-sans text-xs font-semibold text-slate-200 tracking-tight transition-all disabled:opacity-50 flex items-center justify-center gap-2 light_sakura:border-rose-200 light_sakura:text-slate-700",
  },
  /**
   * Sesi 54: token untuk `ui/ToggleSwitch.tsx`. Sama seperti `badge` &
   * `buttonVariant` -- komponen ini sendiri jadi titik reuse tunggal
   * (dipanggil dari banyak halaman), jadi warnanya dipindah ke sini
   * meski cuma 1x dipakai di source.
   */
  toggleSwitch: {
    trackActive: "bg-indigo-600 border-indigo-500 light_sakura:bg-rose-500 light_sakura:border-rose-400",
  },
  /**
   * Sesi 54: token per-file untuk `WalletTransferModal.tsx`. Genuinely
   * 1x-pakai (dicek cross-file, tidak ada exact match -- varian indigo
   * dari `newTransaction.amountInputExpense`/`amountInputIncome`, warna
   * beda jadi tidak dipaksa gabung).
   */
  walletTransferModal: {
    summaryCardBg: "bg-indigo-500/5 border-indigo-500/20 light_sakura:bg-rose-50/40 light_sakura:border-rose-200",
  },
  /**
   * Sesi 54: token untuk `UpdateCheckingIndicator.tsx`. Genuinely 1x-pakai
   * (dicek cross-file, tidak ada exact match).
   */
  updateCheckingIndicator: {
    panelBg: "bg-slate-900/95 light_sakura:bg-white/95 border-indigo-500/30 light_sakura:border-rose-300/50",
  },
  /**
   * Sesi 54: token per-file untuk `AdminCategoryManager.tsx` (sisa dari
   * sesi 46). Genuinely 1x-pakai (dicek cross-file, tidak ada exact
   * match).
   */
  adminCategoryManager: {
    saveBtn: "bg-emerald-950/40 light_sakura:bg-emerald-50 hover:bg-emerald-950/60 light_sakura:hover:bg-emerald-100 cursor-pointer",
  },
  /**
   * Sesi 54: token untuk `DashboardWalletCarousel.tsx`. Genuinely 1x-pakai
   * (dicek cross-file, tidak ada exact match).
   */
  dashboardWalletCarousel: {
    dotActive: "w-3.5 bg-indigo-400 light_sakura:bg-rose-400",
  },
  /**
   * Sesi 54: token tambahan untuk `SettingsMobileMenu.tsx` (sisa dari
   * sesi 46). Genuinely 1x-pakai (dicek cross-file, tidak ada exact
   * match).
   */
  settingsMobileMenuExtra: {
    iconChipBg: "bg-slate-950/60 light_sakura:bg-rose-50",
  },
  /**
   * Sesi 54: token untuk `ProviderBadge.tsx`. Genuinely 1x-pakai (dicek
   * cross-file, tidak ada exact match).
   */
  providerBadge: {
    iconChipBg: "bg-slate-700/60 light_sakura:bg-rose-100",
  },
  /**
   * Sesi 54: token untuk `FeatureLockGate.tsx`. Genuinely 1x-pakai (dicek
   * cross-file, tidak ada exact match).
   */
  featureLockGate: {
    panelBorder: "border-amber-500/20 light_sakura:border-amber-200",
  },
  /**
   * Sesi 54: token untuk `Breadcrumbs.tsx`. Genuinely 1x-pakai (dicek
   * cross-file, tidak ada exact match).
   */
  breadcrumbs: {
    linkHover: "hover:text-slate-200 light_sakura:hover:text-slate-800",
  },
} as const;

export type ThemeTokens = typeof themeTokens;

/**
 * Helper penggabung className kecil (project ini sengaja tidak memakai
 * clsx/tailwind-merge -- lihat catatan di ui/Input.tsx). Menyaring falsy
 * value supaya aman dipakai dengan kondisional: cx(base, isActive && "...").
 */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
