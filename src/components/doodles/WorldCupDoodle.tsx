import React, { useMemo } from "react";
import { motion } from "motion/react";

/**
 * Doodle Piala Dunia -- ilustrasi bola sepak yang memantul + berputar,
 * murni SVG + motion/react (tidak fetch aset eksternal, tidak butuh
 * lisensi pihak ketiga, ringan dan offline-safe).
 *
 * Ini proof-of-concept dari konsep "Google Doodle" untuk EWK: alih-alih
 * hanya partikel dekoratif di background (lihat EventOverlay.tsx), doodle
 * ini adalah ilustrasi kecil yang aktif merepresentasikan event yang
 * sedang berlangsung -- ditempatkan di sebelah judul dashboard.
 *
 * Kalau pola ini disetujui, event lain (Valentine, Natal, dll) tinggal
 * dibuatkan file serupa di folder ini lalu didaftarkan di EventDoodle.tsx.
 */

interface WorldCupDoodleProps {
  size?: number;
  className?: string;
}

export const WorldCupDoodle: React.FC<WorldCupDoodleProps> = ({ size = 44, className }) => {
  const prefersReducedMotion = useMemo(
    () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
    []
  );

  return (
    <div
      className={`relative inline-block ${className ?? ""}`}
      style={{ width: size, height: size * 1.15 }}
      aria-hidden="true"
    >
      {/* Bayangan -- squash & stretch mengikuti ritme pantulan bola */}
      <motion.div
        className="absolute left-1/2 rounded-full bg-black/25 blur-[1px]"
        style={{ bottom: 0, width: size * 0.55, height: size * 0.12, x: "-50%" }}
        animate={
          prefersReducedMotion
            ? undefined
            : {
                scaleX: [1, 0.6, 1],
                opacity: [0.35, 0.15, 0.35],
              }
        }
        transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Bola -- memantul naik-turun sambil berputar */}
      <motion.svg
        viewBox="0 0 100 100"
        width={size}
        height={size}
        className="absolute left-1/2"
        style={{ x: "-50%", bottom: size * 0.1 }}
        animate={
          prefersReducedMotion
            ? undefined
            : {
                y: [0, -size * 0.7, 0],
                rotate: [0, 180, 360],
              }
        }
        transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }}
      >
        <circle cx="50" cy="50" r="46" fill="#f8fafc" stroke="#1e293b" strokeWidth="3" />
        {/* Pola pentagon klasik bola sepak, disederhanakan */}
        <polygon points="50,20 62,29 57,44 43,44 38,29" fill="#1e293b" />
        <polygon points="50,20 62,29 74,24 68,10 56,10" fill="none" stroke="#1e293b" strokeWidth="3" />
        <polygon points="50,20 38,29 26,24 32,10 44,10" fill="none" stroke="#1e293b" strokeWidth="3" />
        <polygon points="62,29 57,44 70,52 80,42 74,24" fill="none" stroke="#1e293b" strokeWidth="3" />
        <polygon points="38,29 26,24 20,42 30,52 43,44" fill="none" stroke="#1e293b" strokeWidth="3" />
        <polygon points="43,44 57,44 63,58 50,68 37,58" fill="none" stroke="#1e293b" strokeWidth="3" />
        <polygon points="30,52 37,58 32,74 18,72 15,58" fill="none" stroke="#1e293b" strokeWidth="3" />
        <polygon points="70,52 80,42 85,58 82,72 68,74" fill="none" stroke="#1e293b" strokeWidth="3" />
        <polygon points="37,58 50,68 63,58 68,74 32,74" fill="none" stroke="#1e293b" strokeWidth="3" />
      </motion.svg>
    </div>
  );
};
