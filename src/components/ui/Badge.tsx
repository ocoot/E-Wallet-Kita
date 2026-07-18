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
    neutral: cx(tokens.badge.neutral),
    info: cx(tokens.badge.info),
    success: cx(tokens.badge.success),
    warning: cx(tokens.badge.warning),
    danger: cx(tokens.badge.danger),
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
