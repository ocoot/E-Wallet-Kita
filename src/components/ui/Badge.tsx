import React from "react";
import { useThemeTokens } from "../../hooks/useThemeTokens";

export type BadgeTone = "neutral" | "info" | "success" | "warning" | "danger";

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  icon?: React.ReactNode;
}

/**
 * Badge/pill bersama untuk seluruh app -- mengekstrak pola
 * `bg-{tone}-500/15 text-{tone}-400 border border-{tone}-500/30` yang
 * dipakai untuk status (aktif/nonaktif, safe/warning/danger budget, dsb)
 * di berbagai halaman (AdminPanel, Settings, BudgetProgressCard),
 * mendukung dark_obsidian & light_sakura sekaligus.
 *
 * Tidak ada teks yang di-hardcode -- label badge sepenuhnya lewat
 * `children` yang dioper caller.
 */
export const Badge: React.FC<BadgeProps> = ({ tone = "neutral", icon, className = "", children, ...rest }) => {
  const { tokens, cx } = useThemeTokens();

  const toneClasses: Record<BadgeTone, string> = {
    neutral: cx(
      "bg-slate-800 text-slate-300 border-slate-700 light_sakura:bg-slate-100 light_sakura:text-slate-600 light_sakura:border-slate-200"
    ),
    info: cx(
      "bg-indigo-500/15 text-indigo-400 border-indigo-500/30 light_sakura:bg-indigo-50 light_sakura:text-indigo-600 light_sakura:border-indigo-100"
    ),
    success: cx(
      "bg-emerald-500/15 text-emerald-400 border-emerald-500/30 light_sakura:bg-emerald-50 light_sakura:text-emerald-700 light_sakura:border-emerald-100"
    ),
    warning: cx(
      "bg-amber-500/15 text-amber-400 border-amber-500/30 light_sakura:bg-amber-50 light_sakura:text-amber-700 light_sakura:border-amber-100"
    ),
    danger: cx(
      "bg-red-500/15 text-red-400 border-red-500/30 light_sakura:bg-red-50 light_sakura:text-red-600 light_sakura:border-red-100"
    ),
  };

  return (
    <span
      className={cx("inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[clamp(0.5625rem,2.4vw,0.625rem)] font-extrabold uppercase tracking-wider", toneClasses[tone], className)}
      {...rest}
    >
      {icon}
      {children}
    </span>
  );
};
