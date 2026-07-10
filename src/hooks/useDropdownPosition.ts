import { useLayoutEffect, useState, type RefObject } from "react";

export interface DropdownPosition {
  left: number;
  width: number;
  maxHeight: number;
  openUpward: boolean;
  /** Koordinat viewport (position: fixed). Salah satu dari top/bottom null. */
  top: number | null;
  bottom: number | null;
}

const PANEL_GAP = 6; // px -- setara mt-1.5 sebelumnya
const PANEL_MAX_HEIGHT = 224; // px -- setara max-h-56 sebelumnya
const VIEWPORT_MARGIN = 12; // px -- jarak aman minimum ke tepi layar
const MIN_PANEL_HEIGHT = 120; // px -- jangan sampai panel jadi terlalu pendek untuk discroll

const emptyPosition: DropdownPosition = {
  left: 0,
  width: 0,
  maxHeight: PANEL_MAX_HEIGHT,
  openUpward: false,
  top: 0,
  bottom: null,
};

/**
 * Menghitung posisi panel dropdown RELATIF TERHADAP VIEWPORT (bukan
 * terhadap parent DOM terdekat), supaya panel bisa di-render lewat React
 * Portal ke document.body.
 *
 * Root cause yang diperbaiki: sebelumnya panel dropdown (DropdownField /
 * WalletPickerField) di-render sebagai children `position: absolute` di
 * dalam komponen yang memicunya. Kalau trigger itu ada di dalam modal, dan
 * modal punya `overflow-hidden` / `overflow-y-auto` (dipakai untuk masking
 * sudut rounded-2xl atau supaya form panjang bisa discroll), maka panel
 * dropdown ikut kepotong oleh boundary overflow tersebut begitu dia
 * melebihi sisa ruang di dalam modal -- inilah yang menyebabkan opsi
 * dropdown "terpotong" di berbagai form.
 *
 * Dengan portal + `position: fixed` + koordinat dari getBoundingClientRect,
 * panel selalu digambar di atas seluruh layar (document.body), lepas dari
 * overflow ancestor manapun. Posisi dihitung ulang tiap kali dropdown
 * dibuka, saat window di-resize, dan saat ada scroll di ancestor manapun
 * (listener dipasang di capture-phase supaya menangkap scroll dari modal
 * yang bisa discroll sekalipun, bukan cuma scroll window).
 */
export function useDropdownPosition(
  open: boolean,
  triggerRef: RefObject<HTMLElement | null>
): DropdownPosition {
  const [position, setPosition] = useState<DropdownPosition>(emptyPosition);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;

    const updatePosition = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom - VIEWPORT_MARGIN;
      const spaceAbove = rect.top - VIEWPORT_MARGIN;
      const openUpward = spaceBelow < PANEL_MAX_HEIGHT && spaceAbove > spaceBelow;

      setPosition({
        left: rect.left,
        width: rect.width,
        openUpward,
        top: openUpward ? null : rect.bottom + PANEL_GAP,
        bottom: openUpward ? window.innerHeight - rect.top + PANEL_GAP : null,
        maxHeight: Math.max(
          MIN_PANEL_HEIGHT,
          Math.min(PANEL_MAX_HEIGHT, openUpward ? spaceAbove : spaceBelow)
        ),
      });
    };

    updatePosition();

    window.addEventListener("resize", updatePosition);
    // capture: true supaya scroll di container manapun (mis. body modal
    // yang overflow-y-auto) ikut memicu re-kalkulasi posisi, bukan cuma
    // scroll pada window.
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, triggerRef]);

  return position;
}
