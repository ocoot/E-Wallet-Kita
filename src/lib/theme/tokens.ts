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
