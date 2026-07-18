import React, { useId } from "react";
import { useThemeTokens } from "../../hooks/useThemeTokens";

export type InputAccent = "indigo" | "amber" | "emerald" | "rose" | "danger";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Label kecil huruf besar di atas field (opsional; caller yang mengisi teksnya lewat i18n). */
  label?: React.ReactNode;
  /** Pesan error kecil di bawah field (opsional). */
  error?: React.ReactNode;
  /** Warna aksen saat fokus -- disesuaikan tema halaman (indigo default, amber untuk Tabungan Emas, dst). */
  accent?: InputAccent;
  containerClassName?: string;
  /** Ikon kiri (mis. Lock untuk password field). */
  leftIcon?: React.ReactNode;
  /** Elemen di kanan field (mis. tombol toggle show/hide password). */
  rightElement?: React.ReactNode;
}

/**
 * Input teks bersama untuk seluruh app -- mengekstrak pola
 * `px-4 py-3 rounded-2xl bg-slate-800 border border-slate-700` beserta
 * label uppercase kecil di atasnya, yang sebelumnya ditulis ulang di
 * setiap form (Budget, Savings, GoldSavings, Installments, dll).
 *
 * Tidak ada teks yang di-hardcode -- label, placeholder, dan pesan error
 * sepenuhnya lewat props yang dioper caller (biasanya dari i18n `t(...)`).
 */
export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, accent = "indigo", className = "", containerClassName = "", id, leftIcon, rightElement, ...rest }, ref) => {
    const { tokens, cx } = useThemeTokens();
    const generatedId = useId();
    const inputId = id || generatedId;

    const focusBorder: Record<InputAccent, string> = {
      indigo: "focus:border-indigo-500 light_sakura:focus:border-rose-400",
      amber: "focus:border-amber-500",
      emerald: "focus:border-emerald-500",
      rose: "focus:border-rose-400",
      danger: "focus:border-red-500",
    };

    return (
      <div className={containerClassName}>
        {label && (
          <label
            htmlFor={inputId}
            className={cx("block text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold uppercase tracking-wider mb-1.5", tokens.text.muted)}
          >
            {label}
          </label>
        )}
        <div className="relative">
          {leftIcon && (
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
              {leftIcon}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            aria-invalid={!!error}
            aria-describedby={error ? `${inputId}-error` : undefined}
            className={cx(
              "w-full px-4 py-3 rounded-2xl text-sm border outline-none placeholder:text-slate-500 transition-colors",
              tokens.surface.subtle,
              tokens.text.heading,
              tokens.border.strong,
              focusBorder[accent],
              error && "border-red-500/60",
              leftIcon && "pl-11",
              rightElement && "pr-11",
              className
            )}
            {...rest}
          />
          {rightElement && (
            <span className="absolute right-4 top-1/2 -translate-y-1/2">
              {rightElement}
            </span>
          )}
        </div>
        {error && (
          <p id={`${inputId}-error`} className={cx("mt-1.5 text-xs", tokens.text.danger)}>
            {error}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";
