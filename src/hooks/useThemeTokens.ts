import { useTheme } from "../contexts/ThemeContext";
import { themeTokens, cx } from "../lib/theme/tokens";

/**
 * Hook reusable untuk styling ber-tema. Menggabungkan:
 *   - `tokens`  : peta className semantik yang sudah mendukung dark_obsidian
 *                 & light_sakura sekaligus (lihat lib/theme/tokens.ts untuk
 *                 daftar lengkap & alasan desainnya).
 *   - `cx`      : helper penggabung className (filter falsy value).
 *   - `theme`   : nilai tema aktif saat ini ("dark_obsidian" | "light_sakura"),
 *                 hanya perlu dipakai kalau ada logika NON-Tailwind yang
 *                 butuh tahu tema (mis. pilih ikon/Lottie berbeda per tema --
 *                 lihat WeatherLottie.tsx). Untuk styling murni, JANGAN
 *                 pakai `theme` untuk percabangan className -- cukup pasang
 *                 kedua varian lewat `tokens`, switching terjadi otomatis
 *                 di CSS lewat class root (lihat ThemeContext.tsx).
 *   - `isSakura`: shortcut boolean dari `theme`, untuk kondisi non-styling.
 *
 * Contoh migrasi dari class manual ke token:
 *   Sebelum:
 *     className="text-slate-400 light_sakura:text-slate-500"
 *   Sesudah:
 *     const { tokens } = useThemeTokens();
 *     className={tokens.text.muted}
 */
export function useThemeTokens() {
  const { theme } = useTheme();
  return {
    tokens: themeTokens,
    cx,
    theme,
    isSakura: theme === "light_sakura",
  } as const;
}
