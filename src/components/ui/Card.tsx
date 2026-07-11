import React from "react";

export type CardPadding = "none" | "sm" | "md" | "lg";
export type CardElevation = "flat" | "sm" | "lg" | "xl";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  padding?: CardPadding;
  elevation?: CardElevation;
}

/**
 * Kartu bersama untuk seluruh app -- mengekstrak pola `rounded-3xl border
 * bg-slate-900 border-slate-800` yang berulang di puluhan tempat (dashboard
 * cards, form cards, list item cards) dengan varian bayangan/padding yang
 * konsisten, sekaligus mendukung tema dark_obsidian & light_sakura.
 *
 * Tidak ada teks yang di-hardcode -- konten sepenuhnya lewat `children`.
 */
export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ padding = "md", elevation = "sm", className = "", children, ...rest }, ref) => {
    const paddingClasses: Record<CardPadding, string> = {
      none: "",
      sm: "p-4",
      md: "p-6",
      lg: "p-6 md:p-8",
    };

    const elevationClasses: Record<CardElevation, string> = {
      flat: "shadow-none",
      sm: "shadow-sm",
      lg: "shadow-lg",
      xl: "shadow-xl",
    };

    return (
      <div
        ref={ref}
        className={`rounded-3xl border bg-slate-900 border-slate-800 text-white light_sakura:bg-white light_sakura:border-rose-100 light_sakura:text-slate-800 transition-colors duration-300 ${paddingClasses[padding]} ${elevationClasses[elevation]} ${className}`}
        {...rest}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = "Card";
