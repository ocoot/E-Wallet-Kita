import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { AlertCircle, HelpCircle, Trash2, CheckCircle } from "lucide-react";

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
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
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
            initial={{ scale: 0.95, opacity: 0, y: 15 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 15 }}
            transition={{ type: "spring", duration: 0.3 }}
            className={`relative z-10 w-full max-w-md overflow-hidden rounded-2xl border p-6 shadow-2xl transition-colors duration-300
              ${type === "danger" 
                ? "bg-slate-900 border-red-500/30 text-white dark_obsidian:bg-slate-900 light_sakura:bg-white light_sakura:text-slate-800 light_sakura:border-red-200" 
                : "bg-slate-900 border-indigo-500/20 text-white dark_obsidian:bg-slate-900 light_sakura:bg-rose-50/90 light_sakura:text-slate-800 light_sakura:border-rose-100"
              }`}
          >
            {/* Type Icon indicator row */}
            <div className="mb-4 flex items-center gap-3">
              <div className={`rounded-full p-2.5 
                ${type === "danger" 
                  ? "bg-red-500/15 text-red-400 light_sakura:bg-red-50 light_sakura:text-red-500" 
                  : type === "warning" 
                    ? "bg-amber-500/15 text-amber-400 light_sakura:bg-amber-50 light_sakura:text-amber-600"
                    : type === "success"
                      ? "bg-emerald-500/15 text-emerald-400 light_sakura:bg-emerald-50 light_sakura:text-emerald-600"
                      : "bg-indigo-500/15 text-indigo-400 light_sakura:bg-indigo-50 light_sakura:text-indigo-600"
                }`}
              >
                {type === "danger" && <Trash2 size={22} />}
                {type === "warning" && <AlertCircle size={22} />}
                {type === "info" && <HelpCircle size={22} />}
                {type === "success" && <CheckCircle size={22} />}
              </div>
              <h3 className="font-sans text-lg font-semibold tracking-tight">
                {title}
              </h3>
            </div>

            {/* Description textual info */}
            <p className="mb-6 font-sans text-sm block opacity-85 leading-relaxed">
              {description}
            </p>

            {/* Actions button group */}
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onCancel}
                className="cursor-pointer rounded-xl px-4 py-2 font-sans text-sm font-medium transition-all duration-200 
                  hover:bg-slate-800 dark_obsidian:hover:bg-slate-800 hover:text-white
                  light_sakura:text-slate-600 light_sakura:hover:bg-rose-100"
              >
                {cancelLabel}
              </button>

              <button
                type="button"
                disabled={confirmDisabled}
                onClick={onConfirm}
                className={`cursor-pointer rounded-xl px-4.5 py-2 font-sans text-sm font-semibold tracking-tight text-white shadow-lg transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]
                  ${type === "danger"
                    ? "bg-red-600 hover:bg-red-500 hover:shadow-red-500/20"
                    : "bg-indigo-600 hover:bg-indigo-500 hover:shadow-indigo-500/20 light_sakura:bg-rose-500 light_sakura:hover:bg-rose-400"
                  } ${confirmDisabled ? "opacity-40 cursor-not-allowed scale-100! hover:scale-100!" : ""}`}
              >
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
