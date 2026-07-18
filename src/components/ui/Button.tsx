import React from "react";
import { Loader2 } from "lucide-react";
import { useThemeTokens } from "../../hooks/useThemeTokens";

export type ButtonVariant = "primary" | "secondary" | "danger" | "danger-ghost" | "success" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  /** Menampilkan spinner dan menonaktifkan tombol, tanpa mengubah teksnya (caller tetap yang menentukan label). */
  isLoading?: boolean;
  /** Ikon opsional di kiri label (mis. dari lucide-react). */
  icon?: React.ReactNode;
}

/**
 * Tombol bersama untuk seluruh app -- mengekstrak pola yang paling sering
 * dipakai di codebase (bg-indigo-600/rose-500 untuk primary, bg-slate-800
 * berbingkai untuk secondary, bg-red-600 untuk danger) supaya radius,
 * padding, dan warna tombol tidak lagi ditulis ulang berbeda-beda di
 * setiap halaman.
 *
 * Tidak ada teks yang di-hardcode di sini -- semua label datang dari
 * `children` yang dioper oleh caller (biasanya dari i18n `t(...)`), dan
 * semua warna memakai token yang sudah mendukung tema dark_obsidian
 * (default) maupun light_sakura sekaligus.
 */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      fullWidth = false,
      isLoading = false,
      icon,
      disabled,
      className = "",
      children,
      ...rest
    },
    ref
  ) => {
    const { tokens, cx } = useThemeTokens();

    const sizeClasses: Record<ButtonSize, string> = {
      sm: "px-3.5 py-2 text-xs gap-1.5 rounded-xl",
      md: "px-5 py-2.5 text-sm gap-2 rounded-2xl",
      lg: "px-6 py-3.5 text-sm gap-2 rounded-2xl",
    };

    const variantClasses: Record<ButtonVariant, string> = {
      primary: cx(tokens.buttonVariant.primary),
      secondary: cx(tokens.buttonVariant.secondary),
      danger: cx(
        "bg-red-600 hover:bg-red-500 text-white font-bold shadow-lg shadow-red-600/10"
      ),
      "danger-ghost": cx(tokens.buttonVariant.dangerGhost),
      success: cx(
        "bg-emerald-600 hover:bg-emerald-500 text-white font-semibold shadow-lg shadow-emerald-600/20"
      ),
      ghost: cx(tokens.buttonVariant.ghost),
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cx("inline-flex items-center justify-center transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none", sizeClasses[size], variantClasses[variant], fullWidth && "w-full", className)}
        {...rest}
      >
        {isLoading ? (
          <Loader2 className="animate-spin" size={size === "sm" ? 14 : 16} />
        ) : (
          icon
        )}
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";
