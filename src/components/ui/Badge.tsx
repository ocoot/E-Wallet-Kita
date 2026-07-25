import React from "react";
import { useThemeTokens } from "../../hooks/useThemeTokens";

export type BadgeTone = "neutral" | "info" | "success" | "warning" | "danger";
export type BadgeSize = "xs" | "sm";

/**
 * Satu-satunya sumber kebenaran untuk padding pill/badge di seluruh app.
 * Dipakai oleh <Badge> di bawah, dan oleh pill manual (yang tidak bisa
 * memakai <Badge> langsung karena butuh warna/tipografi khusus, mis.
 * status pill finansial dengan font-mono) supaya tidak ada lagi file
 * yang menulis angka padding sendiri (lihat audit-konsistensi §3).
 *
 * - xs: pill kompak berisi ikon + label sangat singkat (mis. badge tamu,
 *   chip untung/rugi inline di kartu).
 * - sm: pill standar untuk status/label (mis. status transaksi, tipe
 *   kategori, provider) — ini juga default <Badge>.
 */
export const BADGE_SIZE_CLASSES: Record<BadgeSize, string> = {
  xs: "px-2 py-0.5",
  sm: "px-2 py-1",
};

/**
 * Padding vertikal saja, dipisah dari BADGE_SIZE_CLASSES untuk pill/chip
 * interaktif yang butuh padding horizontal lebih lega (mis. target sentuh
 * tombol filter di mobile) tapi tetap harus mengikuti tinggi resmi yang
 * sama dengan pill lain supaya sebaris terlihat sebanding.
 */
export const BADGE_SIZE_PY: Record<BadgeSize, string> = {
  xs: "py-0.5",
  sm: "py-1",
};

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  icon?: React.ReactNode;
  size?: BadgeSize;
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
export const Badge: React.FC<BadgeProps> = ({ tone = "neutral", icon, size = "sm", className = "", children, ...rest }) => {
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
      className={cx("inline-flex items-center gap-1 rounded-lg border text-[clamp(0.5625rem,2.4vw,0.625rem)] font-extrabold uppercase tracking-wider", BADGE_SIZE_CLASSES[size], toneClasses[tone], className)}
      {...rest}
    >
      {icon}
      {children}
    </span>
  );
};
