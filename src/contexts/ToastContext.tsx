import React, { createContext, useContext, useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { CheckCircle2, AlertTriangle, Info, X } from "lucide-react";

type ToastType = "success" | "error" | "info" | "warning";

interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = (message: string, type: ToastType = "success") => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}

      {/* Floating container */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: -20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.9 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              onAnimationComplete={() => {
                // Auto dismiss after 3.2 seconds
                setTimeout(() => removeToast(t.id), 3200);
              }}
              className={`p-4 rounded-xl shadow-xl flex items-start gap-3 border pointer-events-auto backdrop-blur-xs
                ${t.type === "success"
                  ? "bg-emerald-950/95 border-emerald-500/30 text-emerald-100 light_sakura:bg-emerald-50 light_sakura:border-emerald-200 light_sakura:text-emerald-800"
                  : t.type === "error"
                    ? "bg-red-950/95 border-red-500/30 text-red-100 light_sakura:bg-red-50 light_sakura:border-red-200 light_sakura:text-red-800"
                    : t.type === "warning"
                      ? "bg-amber-950/95 border-amber-500/30 text-amber-100 light_sakura:bg-amber-50 light_sakura:border-amber-200 light_sakura:text-amber-800"
                      : "bg-slate-900/95 border-indigo-500/30 text-indigo-100 light_sakura:bg-indigo-50 light_sakura:border-indigo-200 light_sakura:text-indigo-800"
                }`}
            >
              {/* Type icon indicator */}
              <div className="mt-0.5">
                {t.type === "success" && <CheckCircle2 size={18} className="text-emerald-400 light_sakura:text-emerald-600" />}
                {t.type === "error" && <AlertTriangle size={18} className="text-red-400 light_sakura:text-red-600" />}
                {t.type === "warning" && <AlertTriangle size={18} className="text-amber-400 light_sakura:text-amber-600" />}
                {t.type === "info" && <Info size={18} className="text-indigo-400 light_sakura:text-indigo-600" />}
              </div>

              {/* Message text content */}
              <div className="flex-1 font-sans text-sm font-medium pr-1">
                {t.message}
              </div>

              {/* Close handler button */}
              <button
                onClick={() => removeToast(t.id)}
                className="hover:scale-115 active:scale-90 transition-transform opacity-75 hover:opacity-100 text-current cursor-pointer"
              >
                <X size={15} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within a ToastProvider");
  return context;
};
