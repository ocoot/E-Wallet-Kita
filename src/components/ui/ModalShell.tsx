import React, { useRef, useId } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import { useLockBodyScroll } from "../../hooks/useLockBodyScroll";
import { useDialogA11y } from "../../hooks/useDialogA11y";
import { useThemeTokens } from "../../hooks/useThemeTokens";
import { useIsDesktopViewport } from "../../hooks/useIsDesktopViewport";
import { springPresets } from "../../hooks/useSpringAnimation";

interface ModalShellProps {
  isOpen: boolean;
  onClose?: () => void;
  children: React.ReactNode;
  /**
   * Label aksesibilitas untuk elemen dialog. Jika tidak diset,
   * gunakan prop `labelledBy` untuk mereferensikan id heading di dalam children.
   */
  ariaLabel?: string;
  labelledBy?: string;
  /**
   * Lebar maksimum panel konten. Default: "max-w-lg".
   */
  maxWidth?: string;
  /**
   * Kelas tambahan untuk panel konten (bukan backdrop).
   */
  className?: string;
  /**
   * Gunakan z-index tinggi untuk modal level toast/update-prompt.
   * Default false → z-50. True → z-[90].
   */
  elevated?: boolean;
  /**
   * Jika true, klik backdrop tidak menutup modal (mis. saat proses sedang berjalan).
   */
  backdropLocked?: boolean;
  /**
   * Override kelas bg+border panel (mis. `tokens.modal.panelDanger`).
   * Kalau di-set, INI MENGGANTIKAN default `tokens.surface.card` +
   * `tokens.border.default` sepenuhnya (bukan digabung lewat `className`),
   * supaya tidak terjadi konflik kelas Tailwind yang sama-sama menata
   * `bg-*`/`border-*` di properti sama. Pakai ini untuk varian panel
   * bertema (mis. `Modal.tsx` yang punya panel danger/normal berbeda),
   * bukan `className`, yang tetap dipakai untuk kelas non-konflik
   * (padding, dst).
   */
  panelTone?: string;
}

/**
 * Shell backdrop + container bersama untuk semua modal konten kustom di app ini.
 *
 * Menggantikan pola duplikasi 13 file yang menulis ulang markup
 * `fixed inset-0 z-50 ... backdrop-blur-xs` secara manual.
 *
 * Standar nilai yang distandardisasi:
 * - Backdrop opacity : bg-black/60
 * - Backdrop blur    : backdrop-blur-xs
 * - Z-index base     : z-50
 * - Z-index elevated : z-[90] (khusus UpdatePrompt / toast-level)
 *
 * Hook reusable sudah terintegrasi:
 * - useLockBodyScroll — dikunci selama isOpen = true
 * - useDialogA11y    — focus trap + Escape + return focus
 *
 * BUG FIX PENTING: seluruh markup di-render lewat `createPortal` ke
 * `document.body`. Tanpa ini, `fixed inset-0` di sini akan menempel ke
 * ancestor `motion.div` transisi halaman di App.tsx -- yang walau "diam"
 * di `x: 0` tetap punya inline CSS `transform` (begitu cara kerja
 * Framer Motion), yang menurut spek CSS otomatis jadi containing block
 * baru untuk descendant `position: fixed`. Efeknya: backdrop tetap
 * kelihatan menutupi layar (karena terbentang di seluruh box halaman
 * yang tinggi/scrollable), tapi PANEL modal (`mt-auto`) mendarat di
 * paling bawah seluruh konten halaman alih-alih di viewport yang
 * kelihatan -- tampak "blank"/kosong padahal cuma salah posisi. Lihat
 * penjelasan lebih lengkap di `BottomSheet.tsx` (bug yang sama, gejala
 * yang sama, ditemukan pertama kali di alur Filter Riwayat Transaksi).
 */
export const ModalShell: React.FC<ModalShellProps> = ({
  isOpen,
  onClose,
  children,
  ariaLabel,
  labelledBy,
  maxWidth = "max-w-lg",
  className = "",
  elevated = false,
  backdropLocked = false,
  panelTone,
}) => {
  const { tokens, cx } = useThemeTokens();
  const panelRef = useRef<HTMLDivElement>(null);
  const fallbackId = useId();
  // P4 4.3: di layar mobile, seluruh modal yang lewat shell ini muncul
  // sebagai bottom sheet (slide dari bawah, nempel di tepi bawah, sudut
  // rounded cuma di atas) -- bukan kotak dialog di tengah ala web lagi.
  // Desktop (>=768px) tetap perilaku lama (kotak tengah + scale/fade).
  const isDesktop = useIsDesktopViewport();

  useLockBodyScroll(isOpen);
  useDialogA11y(isOpen, panelRef, backdropLocked ? undefined : onClose);

  const zLayer = elevated ? "z-[90]" : "z-50";

  const handleBackdropClick = backdropLocked ? undefined : onClose;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className={cx("fixed inset-0 flex items-end md:items-center justify-center p-0 md:p-4 overflow-y-auto", zLayer)}>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={handleBackdropClick}
            className="fixed inset-0 bg-black/60 backdrop-blur-xs"
          />

          {/* Panel konten */}
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={ariaLabel}
            aria-labelledby={!ariaLabel ? (labelledBy ?? fallbackId) : undefined}
            tabIndex={-1}
            variants={isDesktop ? springPresets.variants.modal : springPresets.variants.sheet}
            initial="hidden"
            animate="visible"
            exit="exit"
            className={cx(
              "relative z-10 w-full mt-auto md:my-auto max-h-[90vh] overflow-y-auto overflow-x-hidden border shadow-2xl outline-none transition-colors duration-300",
              "rounded-t-3xl md:rounded-2xl",
              maxWidth,
              panelTone ?? cx(tokens.surface.card, tokens.border.default),
              tokens.text.onSurface,
              className
            )}
          >
            {/* Grip handle -- cuma tampil sebagai afordance bottom sheet di mobile */}
            <div className="flex md:hidden justify-center pt-3 pb-1">
              <div className={cx("w-10 h-1.5 rounded-full", tokens.mobileBottomNav.sheetGrip)} />
            </div>
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
};
