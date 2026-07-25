import React from "react";
import { useThemeTokens } from "../../hooks/useThemeTokens";

export type CardPadding = "none" | "sm" | "md" | "lg";
export type CardElevation = "flat" | "xs" | "sm" | "lg" | "xl" | "ambient";
export type CardBorder = "default" | "subtle" | "neutral";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  padding?: CardPadding;
  elevation?: CardElevation;
  /**
   * "default" = border standar (token `border.default`). "subtle" = warna
   * border sama dengan background (`border-slate-900`), dipakai di beberapa
   * kartu dashboard yang sengaja nyaris tanpa garis tepi terlihat. Dibuat
   * sebagai prop eksplisit -- bukan lewat className -- karena project ini
   * tidak memakai tailwind-merge (lihat catatan di Input.tsx).
   */
  border?: CardBorder;
}

/**
 * Kartu bersama untuk seluruh app -- mengekstrak pola `rounded-3xl border
 * bg-slate-900 border-slate-800` yang berulang di puluhan tempat (dashboard
 * cards, form cards, list item cards) dengan varian bayangan/padding yang
 * konsisten.
 *
 * REFACTOR (theme tokens): warna surface/text/border sekarang diambil dari
 * `useThemeTokens()` alih-alih hardcode `light_sakura:` di sini -- supaya
 * kalau warna dasar card berubah, cukup edit lib/theme/tokens.ts, tidak
 * perlu sentuh file ini lagi. `border="subtle"` tetap hardcode karena warnanya
 * sengaja identik dengan background (bukan token semantik umum yang dipakai
 * di tempat lain).
 *
 * Tidak ada teks yang di-hardcode -- konten sepenuhnya lewat `children`.
 */
export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ padding = "md", elevation = "sm", border = "default", className = "", children, ...rest }, ref) => {
    const { tokens, cx } = useThemeTokens();

    const paddingClasses: Record<CardPadding, string> = {
      none: "",
      sm: "p-4",
      md: "p-6",
      // `lg` sengaja 3 step (bukan lompat langsung p-6 -> p-8 di md/768px) supaya
      // padding besar tidak aktif penuh sejak lebar tablet kecil -- lihat
      // audit-konsistensi §5. Titik lompat ke p-8 di `lg` (1024px) juga
      // diselaraskan dengan breakpoint "mode desktop" di Sidebar/ModalShell.
      lg: "p-6 sm:p-7 lg:p-8",
    };

    const elevationClasses: Record<CardElevation, string> = {
      flat: "shadow-none",
      xs: "shadow-xs",
      sm: "shadow-sm",
      lg: "shadow-lg",
      xl: "shadow-xl",
      ambient: cx(tokens.shadow.ambient),
    };

    // Catatan fidelitas: versi asli SELALU menambahkan light_sakura:border-rose-100
    // terlepas dari prop `border` -- jadi border="subtle" tetap "subtle" hanya di
    // dark_obsidian (border-slate-900 nyaris menyatu dgn bg), sementara di
    // light_sakura tetap kelihatan border rose-nya. Dipertahankan apa adanya di
    // sini (bukan bug yang dibenerin diam-diam lewat refactor ini).
    const borderClasses: Record<CardBorder, string> = {
      default: tokens.border.accent,
      subtle: tokens.card.borderSubtle,
      neutral: tokens.border.default,
    };

    const isAmbient = elevation === "ambient";

    return (
      <div
        ref={ref}
        className={cx(
          "rounded-3xl",
          isAmbient ? "" : "border",
          tokens.surface.card,
          isAmbient ? "" : borderClasses[border],
          tokens.text.onSurface,
          "transition-colors duration-300",
          paddingClasses[padding],
          elevationClasses[elevation],
          className
        )}
        {...rest}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = "Card";
