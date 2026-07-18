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
    warning: "text-amber-400 light_sakura:text-amber-600",
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
  },

  hover: {
    /** Hover state untuk item list / row yang bisa diklik di atas surface.subtle. */
    surface: "hover:bg-slate-800 light_sakura:hover:bg-slate-50",
    /** Hover state untuk kartu di atas surface.sunken (mis. kartu terkait di Wallets.tsx). */
    sunken: "hover:bg-slate-800/60 light_sakura:hover:bg-rose-50/60",
  },

  icon: {
    accent: "text-indigo-400 light_sakura:text-rose-500",
    muted: "text-slate-400 light_sakura:text-slate-500",
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
    inputFocus: "focus:border-indigo-500 light_sakura:focus:border-rose-400",
    btnShadow: "shadow-lg shadow-emerald-500/20 light_sakura:shadow-rose-500/20",
    savingsProgressGlow: "bg-gradient-to-r from-emerald-500 to-teal-400 light_sakura:from-rose-500 light_sakura:to-rose-300",
    goldBadgeBg: "bg-emerald-500/10 light_sakura:bg-emerald-50/80",
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
