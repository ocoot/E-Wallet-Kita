import React from "react";
import { motion } from "motion/react";
import { Loader2 } from "lucide-react";
import { audioFeedback } from "../../lib/audio";

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  loading?: boolean;
  label: string;
  description?: string;
  "aria-label"?: string;
}

/**
 * Switch pill kecil untuk baris pengaturan on/off (dipakai di section
 * Notifikasi pada Settings.tsx). Bukan komponen generik dari shadcn/ui --
 * dibuat khusus mengikuti token warna project ini (indigo di dark_obsidian,
 * rose di light_sakura) supaya konsisten dengan tombol lain di Settings.
 */
export const ToggleSwitch: React.FC<ToggleSwitchProps> = ({
  checked,
  onChange,
  disabled = false,
  loading = false,
  label,
  description,
  "aria-label": ariaLabel,
}) => {
  const isInteractive = !disabled && !loading;

  return (
    <div className={`flex items-center justify-between gap-3 py-2.5 ${disabled ? "opacity-50" : ""}`}>
      <div className="min-w-0">
        <p className="font-sans text-xs font-semibold text-slate-200 light_sakura:text-slate-800">
          {label}
        </p>
        {description && (
          <p className="font-sans text-[clamp(0.5625rem,2.6vw,0.625rem)] text-slate-500 leading-relaxed mt-0.5">
            {description}
          </p>
        )}
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={ariaLabel || label}
        disabled={!isInteractive}
        onClick={() => {
          if (!isInteractive) return;
          audioFeedback.playClick();
          onChange(!checked);
        }}
        className={`relative shrink-0 w-11 h-6 rounded-full border transition-colors duration-200 cursor-pointer disabled:cursor-not-allowed
          ${checked
            ? "bg-indigo-600 border-indigo-500 light_sakura:bg-rose-500 light_sakura:border-rose-400"
            : "bg-slate-800 border-slate-700 light_sakura:bg-rose-100 light_sakura:border-rose-200"
          }`}
      >
        {loading ? (
          <Loader2
            size={12}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-spin text-white/80"
          />
        ) : (
          <motion.span
            layout
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm ${checked ? "left-[22px]" : "left-0.5"}`}
          />
        )}
      </button>
    </div>
  );
};
