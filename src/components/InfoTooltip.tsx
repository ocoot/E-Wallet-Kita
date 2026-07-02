import React, { useState, useRef, useEffect } from "react";
import { Info } from "lucide-react";

interface InfoTooltipProps {
  /** Teks penjelasan yang tampil di popover (idealnya berisi rumus/kalkulasi singkat). */
  text: string;
  /** Posisi horizontal popover relatif terhadap icon. Default "center". */
  align?: "left" | "center" | "right";
  className?: string;
}

/**
 * Icon info (ⓘ) kecil yang saat di-tap menampilkan popover berisi penjelasan
 * singkat (mis. rumus perhitungan sebuah angka finansial di dashboard).
 *
 * Dipakai untuk mengurangi kebingungan user awam saat ada beberapa kartu
 * "saldo" dengan lingkup berbeda (bulan ini vs akumulasi sepanjang waktu)
 * di layar yang sama -- lihat DashboardStats & DashboardAccumulatedBalance.
 *
 * Sengaja pakai tap-to-toggle (bukan hover-only) supaya berfungsi baik di
 * mobile, dan auto-close saat tap di luar area popover.
 */
export const InfoTooltip: React.FC<InfoTooltipProps> = ({
  text,
  align = "center",
  className = "",
}) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const handleOutsideInteraction = (event: MouseEvent | TouchEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideInteraction);
    document.addEventListener("touchstart", handleOutsideInteraction);
    return () => {
      document.removeEventListener("mousedown", handleOutsideInteraction);
      document.removeEventListener("touchstart", handleOutsideInteraction);
    };
  }, [open]);

  const alignClass =
    align === "left"
      ? "left-0"
      : align === "right"
      ? "right-0"
      : "left-1/2 -translate-x-1/2";

  return (
    <div ref={containerRef} className={`relative inline-flex ${className}`}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((prev) => !prev);
        }}
        aria-label="Info"
        aria-expanded={open}
        className="w-4 h-4 rounded-full flex items-center justify-center text-slate-500 hover:text-slate-300 active:text-slate-200 light_sakura:text-slate-400 light_sakura:hover:text-slate-600 transition-colors shrink-0"
      >
        <Info size={13} />
      </button>

      {open && (
        <div
          className={`absolute z-50 top-full mt-1.5 ${alignClass} w-56 p-2.5 rounded-xl bg-slate-800 border border-slate-700 shadow-xl text-[11px] leading-relaxed font-normal normal-case tracking-normal text-slate-200 light_sakura:bg-white light_sakura:border-rose-100 light_sakura:text-slate-700`}
        >
          {text}
        </div>
      )}
    </div>
  );
};
