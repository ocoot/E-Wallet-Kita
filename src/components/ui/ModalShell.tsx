import React, { useRef, useId } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useLockBodyScroll } from "../../hooks/useLockBodyScroll";
import { useDialogA11y } from "../../hooks/useDialogA11y";
import { useThemeTokens } from "../../hooks/useThemeTokens";

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
}) => {
  const { tokens, cx } = useThemeTokens();
  const panelRef = useRef<HTMLDivElement>(null);
  const fallbackId = useId();

  useLockBodyScroll(isOpen);
  useDialogA11y(isOpen, panelRef, backdropLocked ? undefined : onClose);

  const zLayer = elevated ? "z-[90]" : "z-50";

  const handleBackdropClick = backdropLocked ? undefined : onClose;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className={cx("fixed inset-0 flex items-center justify-center p-4 overflow-y-auto", zLayer)}>
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
            initial={{ scale: 0.95, opacity: 0, y: 15 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 15 }}
            transition={{ type: "spring", duration: 0.3 }}
            className={cx(
              "relative z-10 w-full my-auto max-h-[90vh] overflow-y-auto overflow-x-hidden rounded-2xl border shadow-2xl outline-none transition-colors duration-300",
              maxWidth,
              tokens.surface.card,
              tokens.border.default,
              tokens.text.onSurface,
              className
            )}
          >
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
