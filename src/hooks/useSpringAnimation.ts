import type { Transition, Variants } from "motion/react";

/**
 * Preset spring animation yang konsisten di seluruh app.
 *
 * Sebelumnya tiap komponen (ModalShell, Modal, MobileBottomNav) menulis
 * config spring sendiri-sendiri dengan nilai yang mirip tapi tidak identik
 * (ModalShell: `type: "spring", duration: 0.3`, MobileBottomNav:
 * `type: "spring", damping: 28, stiffness: 260`). Ini menyulitkan
 * penyesuaian global kalau suatu saat karakter animasi ingin diubah.
 *
 * Caller cukup panggil preset yang sesuai dan (opsional) override property
 * yang butuh disesuaikan per kasus:
 *
 *   import { springPresets } from "../hooks/useSpringAnimation";
 *   <motion.div transition={{ ...springPresets.snappy, delay: 0.1 }}>
 *
 * Atau pakai variants untuk enter/exit:
 *
 *   const { sheet } = springPresets.variants;
 *   <motion.div variants={sheet} initial="hidden" animate="visible" exit="exit">
 */
export const springPresets = {
  /**
   * Ringan & cepat — untuk elemen kecil (ikon, badge, tooltip).
   * cocok: micro-interactions, hover-to-expand.
   */
  micro: {
    type: "spring" as const,
    stiffness: 400,
    damping: 22,
    mass: 0.5,
  } satisfies Transition,

  /**
   * Responsif & lincah — untuk sheet, panel, kartu.
   * cocok: BottomSheet, modal panel, expandable card.
   * (sama dengan config yang sudah dipakai MobileBottomNav selama ini)
   */
  snappy: {
    type: "spring" as const,
    stiffness: 260,
    damping: 28,
    mass: 1,
  } satisfies Transition,

  /**
   * Lebih lembut & lambat — untuk elemen yang butuh kesan premium.
   * cocok: overlay backdrop, notifikasi masuk, halaman transisi.
   * (mirip ModalShell yang pakai `duration: 0.3`)
   */
  gentle: {
    type: "spring" as const,
    stiffness: 180,
    damping: 22,
    mass: 1,
  } satisfies Transition,

  /**
   * Sangat ringan — hampir tanpa hambatan, untuk elemen yang harus
   * langsung merespon tanpa terasa berat.
   * cocok: drag handle, follow pointer, parallax.
   */
  fluid: {
    type: "spring" as const,
    stiffness: 600,
    damping: 38,
    mass: 0.8,
  } satisfies Transition,

  /**
   * Overlay fade — prefer opacity-only, bukan spring.
   * Tetap di sini supaya semua referensi transisi dari satu sumber.
   */
  fade: {
    duration: 0.2,
    ease: "easeOut",
  } satisfies Transition,

  /** Variants siap-pakai untuk komponen yang butuh animate/exit. */
  variants: {
    /** Bottom sheet: masuk dari bawah, spring snappy. */
    sheet: {
      hidden: { y: "100%" },
      visible: { y: 0, transition: { type: "spring", stiffness: 260, damping: 28, mass: 1 } },
      exit: { y: "100%", transition: { duration: 0.15, ease: "easeIn" } },
    } satisfies Variants,

    /** Modal: scale+fade masuk, spring gentle. */
    modal: {
      hidden: { scale: 0.95, opacity: 0, y: 15 },
      visible: { scale: 1, opacity: 1, y: 0, transition: { type: "spring", stiffness: 180, damping: 22, mass: 1 } },
      exit: { scale: 0.95, opacity: 0, y: 15, transition: { duration: 0.12, ease: "easeIn" } },
    } satisfies Variants,

    /** Overlay backdrop: fade saja. */
    backdrop: {
      hidden: { opacity: 0 },
      visible: { opacity: 1, transition: { duration: 0.2 } },
      exit: { opacity: 0, transition: { duration: 0.15 } },
    } satisfies Variants,

    /** Fade-up untuk list item masuk. */
    fadeUp: {
      hidden: { opacity: 0, y: 8 },
      visible: (i = 0) => ({
        opacity: 1,
        y: 0,
        transition: { delay: i * 0.04, type: "spring", stiffness: 260, damping: 28 },
      }),
    } satisfies Variants,

    /** Stagger container — parent spread delay ke children. */
    stagger: {
      hidden: {},
      visible: { transition: { staggerChildren: 0.04 } },
    } satisfies Variants,
  } as const,
};
