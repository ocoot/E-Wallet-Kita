import React, { useId, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { AlertCircle, HelpCircle, Trash2, CheckCircle } from "lucide-react";
import { useLockBodyScroll } from "../hooks/useLockBodyScroll";
import { useDialogA11y } from "../hooks/useDialogA11y";
import { Button } from "./ui/Button";
import { useThemeTokens } from "../hooks/useThemeTokens";

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

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
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
            initial={{ scale: 0.95, opacity: 0, y: 15 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 15 }}
            transition={{ type: "spring", duration: 0.3 }}
            className={cx(
              "relative z-10 w-full max-w-md my-auto max-h-[85vh] overflow-y-auto overflow-x-hidden rounded-2xl border p-6 shadow-2xl outline-none transition-colors duration-300",
              type === "danger"
                ? cx(tokens.modal.panelDanger, tokens.surface.card, tokens.text.onSurface)
                : cx(tokens.modal.panelNormal, tokens.text.onSurface)
            )}
          >
            {/* Type Icon indicator row */}
            <div className="mb-4 flex items-center gap-3">
              <div className={cx(
                "rounded-full p-2.5",
                type === "danger"
                  ? cx(tokens.budgetProgressCard.badgeBgDanger, tokens.newTransaction.amountDisplayExpense)
                  : type === "warning"
                    ? cx(tokens.budgetProgressCard.badgeBgWarning, tokens.text.warning)
                    : type === "success"
                      ? cx(tokens.budget.statusSafe, tokens.text.success)
                      : cx(tokens.budgetProgressCard.badgeBgSafe, tokens.text.accentStrong)
              )}>
                {type === "danger" && <Trash2 size={22} />}
                {type === "warning" && <AlertCircle size={22} />}
                {type === "info" && <HelpCircle size={22} />}
                {type === "success" && <CheckCircle size={22} />}
              </div>
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
