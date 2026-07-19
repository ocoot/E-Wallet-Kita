import React, { useEffect, useRef, useState } from "react";
import { useMotionValue, animate } from "motion/react";

interface AnimatedNumberProps {
  /** Nilai numerik saat ini (mis. saldo dalam Rupiah, bisa desimal). */
  value: number;
  /** Fungsi format tampilan (mis. formatIDR) -- tetap dikontrol caller
   *  supaya gaya "Rp" + pemisah ribuan konsisten dengan tempat lain. */
  format: (n: number) => string;
  className?: string;
  /** Durasi animasi dalam detik. Default 0.6. */
  duration?: number;
}

/**
 * Menampilkan angka dengan animasi "menghitung" naik/turun (rolling number)
 * saat value berubah, alih-alih langsung snap ke angka baru -- ciri khas
 * app fintech native (Jenius, GoPay, Robinhood). Item P4 4.5.
 *
 * Render awal (mount) TIDAK ikut ter-animasi dari 0 -- motion value
 * langsung diinisialisasi ke `value` supaya angka pertama kali tampil
 * apa adanya, animasi cuma jalan saat `value` berubah di render berikutnya
 * (mis. setelah transaksi baru tersimpan).
 */
export const AnimatedNumber: React.FC<AnimatedNumberProps> = ({
  value,
  format,
  className,
  duration = 0.6,
}) => {
  const motionValue = useMotionValue(value);
  const isFirstRender = useRef(true);
  const [display, setDisplay] = useState(() => format(value));

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const controls = animate(motionValue, value, {
      duration,
      ease: "easeOut",
      onUpdate: (latest) => setDisplay(format(latest)),
    });
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return <span className={className}>{display}</span>;
};
