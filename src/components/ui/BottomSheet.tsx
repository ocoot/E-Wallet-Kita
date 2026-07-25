import React, { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import { X } from "lucide-react";
import { useLockBodyScroll } from "../../hooks/useLockBodyScroll";
import { useDialogA11y } from "../../hooks/useDialogA11y";
import { useBackGestureTrap } from "../../hooks/useBackGestureTrap";
import { useThemeTokens } from "../../hooks/useThemeTokens";
import { springPresets } from "../../hooks/useSpringAnimation";
import { BlurOverlay } from "./BlurOverlay";
import { SafeArea } from "./SafeArea";

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /**
   * Judul yang tampil di header sheet. Jika tidak diset, header tidak
   * ditampilkan.
   */
  title?: string;
  /**
   * Label aksesibilitas untuk dialog. Default: "Bottom sheet".
   */
  ariaLabel?: string;
  /**
   * Tinggi maksimum sheet (dalam viewport height). Default: "85vh".
   */
  maxHeight?: string;
  /**
   * Kelas tambahan untuk panel sheet.
   */
  className?: string;
  /**
   * Sembunyikan tombol close (X) di header. Berguna kalau title tidak
   * diset dan sheet punya cara tutup lain (mis. tombol aksi di dalam
   * children). Default: false.
   */
  hideCloseButton?: boolean;
}

/**
 * Bottom sheet reusable yang konsisten di seluruh app.
 *
 * Sebelumnya pola bottom sheet dengan spring animation + backdrop blur
 * hanya ada di MobileBottomNav.tsx. Komponen ini mengekstrak pola tersebut
 * jadi komponen mandiri yang bisa dipakai oleh halaman/fitur lain tanpa
 * menulis ulang markup, animasi, dan aksesibilitas yang sama.
 *
 * Sudah terintegrasi:
 * - useLockBodyScroll — scroll body terkunci selama sheet terbuka
 * - useDialogA11y — focus trap + Escape + return focus
 * - useBackGestureTrap — swipe-back/tombol-back HP menutup sheet
 * - Spring animation dari springPresets.sheet
 * - Safe area bottom padding otomatis
 * - Grip handle di bagian atas
 * - BlurOverlay sebagai backdrop
 *
 * BUG FIX PENTING: seluruh markup di-render lewat `createPortal` ke
 * `document.body`, BUKAN inline di tempat komponen ini dipanggil. Setiap
 * halaman route di App.tsx dibungkus `motion.div` (animasi transisi
 * slide antar halaman) yang -- walau sudah "diam" di `x: 0` -- tetap
 * punya inline CSS `transform` terus-menerus (begitu cara kerja Framer
 * Motion). Elemen manapun yang punya `transform` aktif otomatis jadi
 * "containing block" baru untuk descendant `position: fixed` (bagian
 * dari spek CSS, bukan bug Framer Motion) -- akibatnya `fixed inset-0`
 * di sheet ini akan menempel ke box halaman (yang jauh lebih tinggi
 * dari viewport karena berisi konten yang bisa di-scroll), BUKAN ke
 * viewport asli. Backdrop blur/gelap masih terlihat menutupi layar
 * (karena dia terbentang di seluruh box halaman yang tinggi, dan
 * viewport saat ini kebetulan menampilkan sebagian dari box itu), tapi
 * panel sheet (`mt-auto`, nempel ke BAWAH box tsb) malah mendarat di
 * paling bawah seluruh konten halaman -- jauh di luar layar yang
 * kelihatan, alias terlihat "blank"/kosong padahal sebenarnya cuma
 * salah posisi. Portal ke `document.body` (elemen yang TIDAK pernah di
 * dalam ancestor ber-transform) menghilangkan masalah ini sepenuhnya --
 * pola yang sama seperti yang sudah dipakai `DropdownField.tsx`.
 *
 * Contoh:
 *   <BottomSheet isOpen={isOpen} onClose={() => setIsOpen(false)} title="Pilih Aksi">
 *     <div className="p-4">...</div>
 *   </BottomSheet>
 */
export const BottomSheet: React.FC<BottomSheetProps> = ({
  isOpen,
  onClose,
  children,
  title,
  ariaLabel = "Bottom sheet",
  maxHeight = "85vh",
  className = "",
  hideCloseButton = false,
}) => {
  const { tokens, cx } = useThemeTokens();
  const sheetRef = useRef<HTMLDivElement>(null);
  const [showBackdrop, setShowBackdrop] = useState(false);

  // Gunakan useBackGestureTrap yang sama dengan MobileBottomNav
  const { close: closeSheet } = useBackGestureTrap(isOpen, onClose);
  useLockBodyScroll(isOpen);
  useDialogA11y(isOpen, sheetRef, closeSheet);

  const handleClose = () => {
    closeSheet();
  };

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <BlurOverlay onClick={handleClose} />

          <motion.div
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-label={ariaLabel}
            tabIndex={-1}
            variants={springPresets.variants.sheet}
            initial="hidden"
            animate="visible"
            exit="exit"
            className={cx(
              "relative flex flex-col w-full mt-auto rounded-t-3xl outline-none",
              tokens.mobileBottomNav.sheetContainer,
              tokens.text.onSurface
            )}
            style={{ maxHeight }}
          >
            {/* Grip handle */}
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className={cx("w-10 h-1.5 rounded-full", tokens.mobileBottomNav.sheetGrip)} />
            </div>

            {/* Header opsional */}
            {title && (
              <div className={cx("flex items-center justify-between px-6 py-3 shrink-0 border-b", tokens.border.accent)}>
                <span className={cx("font-sans font-bold text-base tracking-tight", tokens.text.primary)}>
                  {title}
                </span>
                {!hideCloseButton && (
                  <button
                    onClick={handleClose}
                    className={cx(
                      "p-1 rounded-lg cursor-pointer transition-colors",
                      "hover:bg-white/10",
                      tokens.mobileBottomNav.closeBtn,
                      tokens.text.primary
                    )}
                  >
                    <X size={20} />
                  </button>
                )}
              </div>
            )}

            {/* Konten scrollable */}
            <SafeArea inset="bottom" basePadding={20}>
              <div className="flex-1 overflow-y-auto overscroll-contain px-6 py-5">
                {children}
              </div>
            </SafeArea>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
};
