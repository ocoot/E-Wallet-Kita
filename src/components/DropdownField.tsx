import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import { ChevronDown } from "lucide-react";
import { audioFeedback } from "../lib/audio";
import { useDropdownPosition } from "../hooks/useDropdownPosition";

export interface DropdownOption {
  /** Value disimpan ke form state -- boleh string kosong "" untuk opsi default. */
  value: string;
  /** Label lengkap yang ditampilkan (emoji, nama, keterangan tambahan -- terserah caller). */
  label: string;
  /** Nonaktifkan opsi tertentu (mis. brand emas yang sedang di-edit). */
  disabled?: boolean;
}

interface DropdownFieldProps {
  options: DropdownOption[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  /** Warna aksen fokus/hover -- disesuaikan dengan tema halaman. */
  accent?: "indigo" | "amber" | "emerald" | "rose";
  placeholder?: string;
  className?: string;
  panelClassName?: string;
}

/**
 * Dropdown kustom -- menggantikan elemen <select> HTML native di seluruh app.
 *
 * Alasan: <select> native pernah terbukti gagal dibuka/di-tap sama sekali di
 * preview iframe embedded (mis. Google AI Studio "Remix" di Chrome mobile),
 * karena menu native <select> butuh akses ke UI sistem operasi yang kadang
 * diblokir oleh sandbox iframe. Dropdown ini sepenuhnya dikontrol lewat
 * state React + elemen <button>/<div> biasa, jadi selalu bisa di-tap di
 * environment manapun, dan tampilannya konsisten dengan gaya card di app ini.
 *
 * Panel opsi di-render lewat React Portal ke document.body (position: fixed,
 * dihitung dari getBoundingClientRect tombol trigger) supaya TIDAK PERNAH
 * terpotong oleh ancestor yang punya overflow-hidden/auto -- termasuk saat
 * dropdown ini dipakai di dalam modal/dialog konfirmasi. Lihat
 * `useDropdownPosition` untuk detail perhitungannya.
 */
export const DropdownField: React.FC<DropdownFieldProps> = ({
  options,
  value,
  onChange,
  disabled = false,
  accent = "indigo",
  placeholder = "—",
  className = "",
  panelClassName = "",
}) => {
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
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchstart", handleOutside);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
    };
  }, [open]);

  const focusBorder = {
    indigo: "focus:border-indigo-500",
    amber: "focus:border-amber-500",
    emerald: "focus:border-emerald-500",
    rose: "focus:border-rose-500",
  }[accent];

  const selectedStyle = {
    indigo: "bg-indigo-500/15 text-indigo-300 font-bold light_sakura:bg-rose-50 light_sakura:text-rose-600",
    amber: "bg-amber-500/15 text-amber-300 font-bold light_sakura:bg-amber-50 light_sakura:text-amber-700",
    emerald: "bg-emerald-500/15 text-emerald-300 font-bold light_sakura:bg-emerald-50 light_sakura:text-emerald-700",
    rose: "bg-rose-500/15 text-rose-300 font-bold light_sakura:bg-rose-50 light_sakura:text-rose-600",
  }[accent];

  const selected = options.find((o) => o.value === value);

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => { audioFeedback.playClick(); setOpen((v) => !v); }}
        className={`w-full flex items-center justify-between gap-2 px-4 py-3 rounded-2xl bg-slate-800 light_sakura:bg-slate-50 text-slate-100 light_sakura:text-slate-900 text-sm border border-slate-700 light_sakura:border-slate-200 outline-none ${focusBorder} cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}
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
              className={`z-[70] overflow-y-auto rounded-xl border bg-slate-900 border-slate-800 shadow-xl light_sakura:bg-white light_sakura:border-rose-100 p-1 ${panelClassName}`}
            >
              {options.map((opt) => {
                const isSelected = opt.value === value;
                return (
                  <button
                    key={opt.value || "__default__"}
                    type="button"
                    disabled={opt.disabled}
                    onClick={() => { if (opt.disabled) return; audioFeedback.playClick(); onChange(opt.value); setOpen(false); }}
                    className={`w-full text-left px-3 py-2.5 rounded-lg font-sans text-xs transition-colors ${
                      opt.disabled
                        ? "text-slate-600 cursor-not-allowed opacity-50"
                        : isSelected
                          ? `${selectedStyle} cursor-pointer`
                          : "text-slate-300 hover:bg-slate-800/60 light_sakura:text-slate-700 light_sakura:hover:bg-rose-50/60 cursor-pointer"
                    }`}
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
