import React, { useId, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { AlertCircle, HelpCircle, Trash2, CheckCircle } from "lucide-react";
import { useLockBodyScroll } from "../hooks/useLockBodyScroll";
import { useDialogA11y } from "../hooks/useDialogA11y";
import { Button } from "./ui/Button";
import { useThemeTokens } from "../hooks/useThemeTokens";
import { useIsDesktopViewport } from "../hooks/useIsDesktopViewport";
import { springPresets } from "../hooks/useSpringAnimation";

interface ModalProps {
  isOpen: boolean;
  title: string;
  description: string;
  type?: "danger" | "warning" | "info" | "success";
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  confirmDisabled?: boolean;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  title,
  description,
  type = "info",
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  confirmDisabled = false
}) => {
  const { tokens, cx } = useThemeTokens();
  useLockBodyScroll(isOpen);
  const panelRef = useRef<HTMLDivElement>(null);
  useDialogA11y(isOpen, panelRef, onCancel);
  const titleId = useId();
  const descId = useId();
  // P4 4.3: bottom sheet di mobile, kotak dialog tetap di desktop.
  const isDesktop = useIsDesktopViewport();

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4 overflow-y-auto">
          {/* Overlay background */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onCancel}
            className="fixed inset-0 bg-black/60 backdrop-blur-xs"
          />

          {/* Modal core window */}
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descId}
            tabIndex={-1}
            variants={isDesktop ? springPresets.variants.modal : springPresets.variants.sheet}
            initial="hidden"
            animate="visible"
            exit="exit"
            className={cx(
              "relative z-10 w-full md:max-w-md mt-auto md:my-auto max-h-[85vh] overflow-y-auto overflow-x-hidden border p-6 shadow-2xl outline-none transition-colors duration-300",
              "rounded-t-3xl md:rounded-2xl",
              type === "danger"
                ? cx(tokens.modal.panelDanger, tokens.surface.card, tokens.text.onSurface)
                : cx(tokens.modal.panelNormal, tokens.text.onSurface)
            )}
          >
            {/* Grip handle -- afordance bottom sheet, cuma di mobile */}
            <div className="flex md:hidden justify-center -mt-2 mb-3">
              <div className={cx("w-10 h-1.5 rounded-full", tokens.mobileBottomNav.sheetGrip)} />
            </div>

            {/* Type Icon indicator row */}
            <div className="mb-4 flex items-center gap-3">
              <motion.div
                // P4 4.6: kompensasi visual ketiadaan haptic -- ikon sukses
                // "melompat" masuk dengan spring bounce yang cukup kuat
                // secara visual, supaya tetap terasa sebagai sinyal
                // konfirmasi meski tanpa getaran fisik. Tipe lain tetap
                // statis (bounce cuma relevan untuk state "berhasil").
                initial={type === "success" ? { scale: 0, rotate: -25 } : false}
                animate={type === "success" ? { scale: 1, rotate: 0 } : undefined}
                transition={{ type: "spring", stiffness: 420, damping: 14 }}
                className={cx(
                  "rounded-full p-2.5",
                  type === "danger"
                    ? cx(tokens.budgetProgressCard.badgeBgDanger, tokens.newTransaction.amountDisplayExpense)
                    : type === "warning"
                      ? cx(tokens.budgetProgressCard.badgeBgWarning, tokens.text.warning)
                      : type === "success"
                        ? cx(tokens.budget.statusSafe, tokens.text.success)
                        : cx(tokens.budgetProgressCard.badgeBgSafe, tokens.text.accentStrong)
                )}
              >
                {type === "danger" && <Trash2 size={22} />}
                {type === "warning" && <AlertCircle size={22} />}
                {type === "info" && <HelpCircle size={22} />}
                {type === "success" && <CheckCircle size={22} />}
              </motion.div>
              <h3 className="font-sans text-lg font-semibold tracking-tight" id={titleId}>
                {title}
              </h3>
            </div>

            {/* Description textual info */}
            <p className="mb-6 font-sans text-sm block opacity-85 leading-relaxed" id={descId}>
              {description}
            </p>

            {/* Actions button group */}
            <div className="flex items-center justify-end gap-3 max-sm:gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={onCancel}
                className="min-h-[44px] max-sm:flex-1 rounded-xl"
              >
                {cancelLabel}
              </Button>

              <Button
                type="button"
                variant={type === "danger" ? "danger" : "primary"}
                disabled={confirmDisabled}
                onClick={onConfirm}
                className="min-h-[44px] max-sm:flex-1 rounded-xl"
              >
                {confirmLabel}
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
