import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import { ChevronDown } from "lucide-react";
import { audioFeedback } from "../lib/audio";
import { useDropdownPosition } from "../hooks/useDropdownPosition";
import { useThemeTokens } from "../hooks/useThemeTokens";

export interface WalletPickerOption {
  /** Value disimpan ke form state -- boleh string kosong "" untuk opsi default/umum. */
  value: string;
  /** Label lengkap yang ditampilkan (sudah termasuk emoji ikon, nama, provider, saldo, dst -- terserah caller). */
  label: string;
}

interface WalletPickerFieldProps {
  options: WalletPickerOption[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  /** Warna aksen fokus/hover -- disesuaikan dengan tema halaman (indigo di kebanyakan form, amber di Tabungan Emas). */
  accent?: "indigo" | "amber";
  placeholder?: string;
  className?: string;
}

/**
 * Dropdown "Pos Dompet" kustom -- menggantikan elemen <select> HTML native.
 *
 * Alasan: <select> native pernah terbukti gagal dibuka/di-tap sama sekali di
 * preview iframe embedded (mis. Google AI Studio "Remix" di Chrome mobile),
 * karena menu native <select> butuh akses ke UI sistem operasi yang kadang
 * diblokir oleh sandbox iframe. Dropdown ini sepenuhnya dikontrol lewat
 * state React + elemen <button>/<div> biasa, jadi selalu bisa di-tap di
 * environment manapun.
 *
 * Panel opsi di-render lewat React Portal ke document.body (position: fixed,
 * dihitung dari getBoundingClientRect tombol trigger) supaya TIDAK PERNAH
 * terpotong oleh ancestor yang punya overflow-hidden/auto -- termasuk saat
 * field ini dipakai di dalam modal/dialog. Lihat `useDropdownPosition`.
 *
 * Dipakai di semua form yang punya field "Pos Dompet": Catat Mandiri,
 * Tagihan, Tabungan, Cicilan, dan Tabungan Emas.
 */
export const WalletPickerField: React.FC<WalletPickerFieldProps> = ({
  options,
  value,
  onChange,
  disabled = false,
  accent = "indigo",
  placeholder = "—",
  className = "",
}) => {
  const { tokens, cx } = useThemeTokens();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const position = useDropdownPosition(open, containerRef);

  useEffect(() => {
    if (!open) return;
    const handleOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      // Panel di-render lewat portal, jadi secara DOM dia bukan descendant
      // dari containerRef -- harus dicek terpisah, kalau tidak klik pada
      // opsi dropdown akan selalu dianggap "di luar" dan menutup panel
      // sebelum onClick opsi sempat jalan.
      if (
        containerRef.current?.contains(target) ||
        panelRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
        containerRef.current?.querySelector("button")?.focus();
      }
    };
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchstart", handleOutside);
    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [open]);

  const focusBorder = accent === "amber" ? "focus:border-amber-500" : "focus:border-indigo-500";
  const selectedStyle = accent === "amber"
    ? tokens.chip.badgeAmber
    : tokens.chip.badgeIndigo;

  const selected = options.find((o) => o.value === value);

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => { audioFeedback.playClick(); setOpen((v) => !v); }}
        className={cx("w-full flex items-center justify-between gap-2 px-4 py-3 rounded-2xl outline-none cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm", focusBorder, tokens.surface.subtle, tokens.text.heading, tokens.border.strong)}
      >
        <span className="truncate text-left">{selected ? selected.label : placeholder}</span>
        <ChevronDown size={14} className={`shrink-0 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              ref={panelRef}
              initial={{ opacity: 0, y: position.openUpward ? 6 : -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: position.openUpward ? 6 : -6 }}
              style={{
                position: "fixed",
                left: position.left,
                width: position.width,
                top: position.top ?? undefined,
                bottom: position.bottom ?? undefined,
                maxHeight: position.maxHeight,
              }}
              className={cx("z-[70] overflow-y-auto rounded-xl border shadow-xl p-1", tokens.surface.card, tokens.border.accent)}
              role="listbox"
            >
              {options.map((opt) => {
                const isSelected = opt.value === value;
                return (
                  <button
                    key={opt.value || "__default__"}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => { audioFeedback.playClick(); onChange(opt.value); setOpen(false); }}
                    className={cx(
                      "w-full text-left px-3 py-2.5 rounded-lg font-sans text-xs transition-colors cursor-pointer",
                      isSelected ? selectedStyle : cx(tokens.text.secondary, tokens.hover.sunken)
                    )}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
};
