import React from "react";
import { motion, type HTMLMotionProps } from "motion/react";
import { springPresets } from "../../hooks/useSpringAnimation";

interface BlurOverlayProps extends HTMLMotionProps<"div"> {
  /**
   * Jika true, overlay bisa diklik untuk menutup (panggil onClick).
   * Default true untuk mempertahankan perilaku yang sudah ada di
   * ModalShell dan MobileBottomNav.
   */
  isDismissable?: boolean;
  /**
   * Intensitas blur. Default "xs" (backdrop-blur-xs).
   * "none" untuk no blur (sama dengan bg-black/60 polos).
   */
  blur?: "none" | "xs" | "sm" | "md" | "lg";
}

/**
 * Backdrop blur overlay yang konsisten di seluruh app.
 *
 * Sebelumnya pola `fixed inset-0 bg-black/60 backdrop-blur-xs` ditulis
 * ulang di 3 file berbeda (ModalShell.tsx, Modal.tsx, MobileBottomNav.tsx).
 * Komponen ini mengekstrak pola tersebut jadi satu sumber.
 *
 * Animasi: fade in/out (bukan spring -- overlay cukup pakai opacity).
 *
 * Contoh:
 *   <BlurOverlay onClick={onClose} />
 *   <BlurOverlay blur="sm" isDismissable={false} />
 */
export const BlurOverlay: React.FC<BlurOverlayProps> = ({
  isDismissable = true,
  blur = "xs",
  onClick,
  className = "",
  ...rest
}) => {
  const blurClass = blur === "none" ? "" : `backdrop-blur-${blur}`;

  return (
    <motion.div
      variants={springPresets.variants.backdrop}
      initial="hidden"
      animate="visible"
      exit="exit"
      onClick={isDismissable ? onClick : undefined}
      className={`fixed inset-0 bg-black/60 ${blurClass} ${className}`}
      {...rest}
    />
  );
};
