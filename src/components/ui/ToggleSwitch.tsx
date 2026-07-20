import React from "react";
import { motion } from "motion/react";
import { Loader2 } from "lucide-react";
import { audioFeedback } from "../../lib/audio";
import { useThemeTokens } from "../../hooks/useThemeTokens";

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  loading?: boolean;
  label: string;
  description?: string;
  "aria-label"?: string;
  /**
   * Warna track saat aktif. Default "indigo" (token `toggleSwitch.trackActive`,
   * perilaku identik dengan sebelum prop ini ditambahkan -- caller lama seperti
   * Settings.tsx/NotificationSettings.tsx tidak perlu berubah). Tone lain
   * dipetakan ke token baru `toggleSwitch.track*` di bawah, masing-masing
   * SUDAH punya varian `light_sakura` -- berbeda dari versi hardcode
   * (`bg-amber-600`/`bg-violet-600`/`bg-red-600`) yang digantikannya di
   * `AdminMaintenance.tsx`, yang sebelumnya sama sekali tidak bereaksi
   * terhadap tema terang.
   */
  tone?: "indigo" | "amber" | "violet" | "danger";
  /**
   * Ukuran fisik track. "md" (bawaan, w-11 h-6) dipakai Settings &
   * NotificationSettings -- tidak berubah. "lg" (w-14 h-7) untuk toggle
   * level-halaman yang butuh bobot visual lebih besar (mis. mode
   * maintenance global / lock fitur di `AdminMaintenance.tsx`).
   */
  size?: "md" | "lg";
  /**
   * Sembunyikan blok label/description bawaan beserta padding vertikalnya,
   * dan render switch-nya saja -- dipakai saat komponen ini menggantikan
   * tombol toggle inline yang labelnya sudah direpresentasikan di luar
   * (mis. ikon + tooltip di baris tabel `AdminMaintenance.tsx`). `label`
   * tetap wajib diisi karena masih dipakai untuk `aria-label`.
   */
  hideLabel?: boolean;
}

/**
 * Switch pill kecil untuk baris pengaturan on/off (dipakai di section
 * Notifikasi pada Settings.tsx). Bukan komponen generik dari shadcn/ui --
 * dibuat khusus mengikuti token warna project ini (indigo di dark_obsidian,
 * rose di light_sakura) supaya konsisten dengan tombol lain di Settings.
 *
 * Prop `tone`/`size`/`hideLabel` ditambahkan untuk menyerap 3 toggle manual
 * berbeda ukuran & warna di `AdminMaintenance.tsx` (lihat audit-konsistensi-komponen.md
 * temuan #6) tanpa mengubah perilaku 2 caller lama sama sekali.
 */
export const ToggleSwitch: React.FC<ToggleSwitchProps> = ({
  checked,
  onChange,
  disabled = false,
  loading = false,
  label,
  description,
  "aria-label": ariaLabel,
  tone = "indigo",
  size = "md",
  hideLabel = false,
}) => {
  const { tokens, cx } = useThemeTokens();
  const isInteractive = !disabled && !loading;

  const trackToneActive: Record<NonNullable<ToggleSwitchProps["tone"]>, string> = {
    indigo: tokens.toggleSwitch.trackActive,
    amber: tokens.toggleSwitch.trackAmber,
    violet: tokens.toggleSwitch.trackViolet,
    danger: tokens.toggleSwitch.trackDanger,
  };

  const switchButton = (
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
      className={cx(
        "btn-exact relative shrink-0 rounded-full border transition-colors duration-200 cursor-pointer disabled:cursor-not-allowed",
        size === "lg" ? "w-14 h-7" : "w-11 h-6",
        checked
          ? trackToneActive[tone]
          : cx(tokens.surface.sunken, tokens.border.strong)
      )}
    >
      {loading ? (
        <Loader2
          size={12}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-spin text-white/80"
        />
      ) : size === "lg" ? (
        // Ukuran "lg" pakai transition CSS biasa (bukan motion.span layout) --
        // persis pola yang tadinya ditulis manual di AdminMaintenance.tsx,
        // dipertahankan apa adanya supaya animasi thumb-nya identik.
        <span
          className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-7" : "translate-x-0"}`}
        />
      ) : (
        <motion.span
          layout
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm ${checked ? "left-[22px]" : "left-0.5"}`}
        />
      )}
    </button>
  );

  if (hideLabel) {
    return switchButton;
  }

  return (
    <div className={cx("flex items-center justify-between gap-3 py-2.5", disabled && "opacity-50")}>
      <div className="min-w-0">
        <p className={cx("font-sans text-xs font-semibold", tokens.text.heading)}>
          {label}
        </p>
        {description && (
          <p className={cx("font-sans text-[clamp(0.5625rem,2.6vw,0.625rem)] leading-relaxed mt-0.5", tokens.text.muted)}>
            {description}
          </p>
        )}
      </div>
      {switchButton}
    </div>
  );
};
