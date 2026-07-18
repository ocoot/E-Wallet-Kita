import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { Loader2 } from "lucide-react";
import { useLockBodyScroll } from "../hooks/useLockBodyScroll";
import { useThemeTokens } from "../hooks/useThemeTokens";

interface LoadingOverlayProps {
  isOpen: boolean;
  message?: string;
}

export const LoadingOverlay: React.FC<LoadingOverlayProps> = ({ isOpen, message = "Memproses..." }) => {
  const { tokens, cx } = useThemeTokens();
  useLockBodyScroll(isOpen);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          {/* Overlay background */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-xs"
          />

          {/* Loading card */}
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 10 }}
            transition={{ type: "spring", duration: 0.3 }}
            className={cx(
              "relative z-10 flex flex-col items-center gap-3 rounded-2xl border px-8 py-7 shadow-2xl",
              tokens.surface.card,
              tokens.border.accent
            )}
          >
            <Loader2 className={cx("animate-spin", tokens.text.accent)} size={30} />
            <p className={cx("font-sans text-xs font-bold text-center max-w-[200px]", tokens.text.secondary)}>
              {message}
            </p>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
