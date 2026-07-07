import React, { useState, useRef, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { Info } from "lucide-react";

interface InfoTooltipProps {
  /** Teks penjelasan yang tampil di popover (idealnya berisi rumus/kalkulasi singkat). */
  text: string;
  /** Posisi horizontal IDEAL popover relatif terhadap icon -- akan otomatis
   * disesuaikan/di-clamp kalau ternyata bakal keluar tepi layar. Default "center". */
  align?: "left" | "center" | "right";
  className?: string;
}

const VIEWPORT_MARGIN = 16;

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
 *
 * Posisi popover dihitung ULANG setiap kali dibuka (bukan cuma CSS statis
 * left-0/right-0/center) berdasarkan posisi asli ikon di viewport, lalu
 * di-clamp supaya selalu ada jarak aman dari tepi layar manapun. Di-render
 * lewat createPortal ke <body> dengan position:fixed, supaya tidak ikut
 * terpotong kalau ikonnya kebetulan ada di dalam container yang overflow-
 * hidden (mis. kartu yang bisa di-flip).
 */
export const InfoTooltip: React.FC<InfoTooltipProps> = ({
  text,
  align = "center",
  className = "",
}) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLSpanElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!open) return;

    const handleOutsideInteraction = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;
      const insideTrigger = containerRef.current?.contains(target);
      const insidePopover = popoverRef.current?.contains(target);
      if (!insideTrigger && !insidePopover) {
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

  // Hitung ulang posisi tiap kali popover dibuka, dan setiap resize/scroll
  // (termasuk scroll di dalam <main> yang overflow-y-auto, ditangkap lewat
  // listener capture-phase di window). useLayoutEffect supaya posisi sudah
  // benar SEBELUM browser paint -- tidak ada kedipan "lompat" ke tempat lain.
  useLayoutEffect(() => {
    if (!open) return;

    const updatePosition = () => {
      const trigger = containerRef.current;
      const popover = popoverRef.current;
      if (!trigger || !popover) return;

      const triggerRect = trigger.getBoundingClientRect();
      const popoverWidth = popover.offsetWidth;

      let left: number;
      if (align === "left") left = triggerRect.left;
      else if (align === "right") left = triggerRect.right - popoverWidth;
      else left = triggerRect.left + triggerRect.width / 2 - popoverWidth / 2;

      const maxLeft = Math.max(window.innerWidth - popoverWidth - VIEWPORT_MARGIN, VIEWPORT_MARGIN);
      left = Math.min(Math.max(left, VIEWPORT_MARGIN), maxLeft);

      setCoords({ top: triggerRect.bottom + 6, left });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, align]);

  return (
    <span ref={containerRef} className={`relative inline-flex ${className}`}>
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

      {open &&
        createPortal(
          <div
            ref={popoverRef}
            style={{
              position: "fixed",
              top: coords?.top ?? -9999,
              left: coords?.left ?? -9999,
              visibility: coords ? "visible" : "hidden",
            }}
            className="z-[999] w-56 max-w-[calc(100vw-2rem)] p-2.5 rounded-xl bg-slate-800 border border-slate-700 shadow-xl text-[11px] leading-relaxed font-normal normal-case tracking-normal text-slate-200 light_sakura:bg-white light_sakura:border-rose-100 light_sakura:text-slate-700"
          >
            {text}
          </div>,
          document.body
        )}
    </span>
  );
};
