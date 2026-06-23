import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { Loader2 } from "lucide-react";

interface LoadingOverlayProps {
  isOpen: boolean;
  message?: string;
}

export const LoadingOverlay: React.FC<LoadingOverlayProps> = ({ isOpen, message = "Memproses..." }) => {
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
            className="relative z-10 flex flex-col items-center gap-3 rounded-2xl border border-indigo-500/20 bg-slate-900 px-8 py-7 shadow-2xl light_sakura:bg-rose-50/90 light_sakura:border-rose-100"
          >
            <Loader2 className="animate-spin text-teal-400 light_sakura:text-rose-500" size={30} />
            <p className="font-sans text-xs font-bold text-slate-200 light_sakura:text-slate-700 text-center max-w-[200px]">
              {message}
            </p>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
