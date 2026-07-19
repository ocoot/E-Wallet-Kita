import React, { useId } from "react";
import { motion } from "motion/react";
import { audioFeedback } from "../../lib/audio";
import { useThemeTokens } from "../../hooks/useThemeTokens";
import { springPresets } from "../../hooks/useSpringAnimation";

export interface SegmentedControlOption {
  value: string;
  label: string;
}

interface SegmentedControlProps {
  options: SegmentedControlOption[];
  value: string;
  onChange: (value: string) => void;
  /** Label aksesibilitas untuk grup kontrol (mis. "Ukuran halaman"). */
  ariaLabel?: string;
  className?: string;
}

/**
 * Pill filter bergaya iOS -- pengganti `DropdownField` untuk pilihan yang
 * jumlahnya sedikit & tetap (bounded), dengan indikator aktif yang
 * "meluncur" ke posisi baru lewat `layoutId` + spring, bukan langsung
 * berpindah tempat (P3 item 3.2).
 *
 * Catatan desain: HANYA cocok untuk opsi berjumlah sedikit & tidak
 * dinamis (mis. ukuran halaman 5/10/15/20/50/Semua). Filter bulan &
 * kategori di `HistoryFilter.tsx` TETAP pakai `DropdownField` karena
 * jumlah opsinya tidak terbatas/dinamis (bulan riwayat transaksi &
 * daftar kategori bisa bertambah banyak) -- segmented control dengan
 * banyak opsi akan pecah baris / tidak terbaca di layar HP, jadi
 * bertentangan dengan tujuan "terasa native" itu sendiri.
 */
export const SegmentedControl: React.FC<SegmentedControlProps> = ({
  options,
  value,
  onChange,
  ariaLabel,
  className = "",
}) => {
  const { tokens, cx } = useThemeTokens();
  const layoutId = useId();

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cx(
        "inline-flex w-full items-center gap-0.5 p-1 rounded-xl border select-none",
        tokens.segmentedControl.track,
        className
      )}
    >
      {options.map((opt) => {
        const isActive = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => {
              if (isActive) return;
              audioFeedback.playClick();
              onChange(opt.value);
            }}
            className="relative flex-1 min-w-0 px-2 py-1.5 rounded-lg text-center cursor-pointer active:scale-[0.97] transition-transform"
          >
            {isActive && (
              <motion.span
                layoutId={`segmented-thumb-${layoutId}`}
                transition={springPresets.fluid}
                className={cx("absolute inset-0 rounded-lg", tokens.segmentedControl.thumb)}
              />
            )}
            <span
              className={cx(
                "relative z-10 font-sans text-xs font-bold truncate block",
                isActive ? tokens.segmentedControl.textActive : tokens.segmentedControl.textInactive
              )}
            >
              {opt.label}
            </span>
          </button>
        );
      })}
    </div>
  );
};
