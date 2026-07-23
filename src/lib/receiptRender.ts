import React from "react";
import { createRoot } from "react-dom/client";
import html2canvas from "html2canvas";
import { ReceiptCard, ReceiptCardData } from "../components/ReceiptCard";

const CAPTURE_WIDTH = 360; // px — cukup lebar biar tajam saat di-scale ke PDF

/**
 * Me-render `<ReceiptCard/>` di luar layar (posisi fixed, offscreen) lalu
 * "memotretnya" jadi PNG lewat html2canvas.
 *
 * Ini SATU-SATUNYA tempat yang tahu cara mengubah ReceiptCard jadi gambar.
 * `lib/receipt.ts` (generator PDF) dan `PremiumModal.tsx` (tampilan layar)
 * sama-sama memakai komponen `ReceiptCard` yang persis sama — jadi kalau
 * desain struk berubah, cukup edit `ReceiptCard.tsx` sekali dan PDF +
 * layar otomatis ikut konsisten.
 */
export async function captureReceiptCardAsPng(
  data: ReceiptCardData,
  t: (key: string, replacements?: Record<string, string | number>) => string
): Promise<{ dataUrl: string; width: number; height: number }> {
  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.top = "0";
  container.style.left = "-9999px";
  container.style.width = `${CAPTURE_WIDTH}px`;
  container.style.pointerEvents = "none";
  document.body.appendChild(container);

  const root = createRoot(container);

  try {
    await new Promise<void>((resolve) => {
      root.render(React.createElement(ReceiptCard, { data, t, forCapture: true }));
      // Tunggu 2 frame biar layout & font pasti sudah settle sebelum di-capture.
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });

    const target = container.querySelector<HTMLElement>("[data-receipt-card]");
    if (!target) {
      throw new Error("ReceiptCard node tidak ditemukan saat mencoba meng-capture struk.");
    }

    const canvas = await html2canvas(target, {
      scale: 2, // hasil retina, teks tetap tajam waktu ditempel ke PDF
      backgroundColor: null,
      useCORS: true,
    });

    return {
      dataUrl: canvas.toDataURL("image/png"),
      width: canvas.width,
      height: canvas.height,
    };
  } finally {
    root.unmount();
    container.remove();
  }
}
