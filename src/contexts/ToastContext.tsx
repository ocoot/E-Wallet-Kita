import React, { createContext, useContext, useState, useCallback, useMemo, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from "lucide-react";
import { audioFeedback } from "../lib/audio";
import { useThemeTokens } from "../hooks/useThemeTokens";
import { themeTokens } from "../lib/theme/tokens";

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

// Konfigurasi visual + perilaku per tipe toast, disatukan di sini supaya
// menambah tipe baru (atau mengubah nuansa warna/suara/durasi) tinggal
// ubah satu tempat, tidak perlu bongkar JSX-nya.
const TOAST_CONFIG: Record<
  ToastType,
  {
    duration: number;
    icon: React.ElementType;
    sound: () => void;
    container: string;
    iconChip: string;
    iconColor: string;
    accentBar: string;
    progressBar: string;
    glow: string;
  }
> = {
  success: {
    duration: 3500,
    icon: CheckCircle2,
    sound: () => audioFeedback.playChime(),
    container: themeTokens.toast.successContainer,
    iconChip: themeTokens.toast.successIconChip,
    iconColor: themeTokens.toast.successIconColor,
    accentBar: "bg-emerald-500",
    progressBar: "bg-emerald-500/60",
    glow: "shadow-[0_8px_28px_-6px_rgba(16,185,129,0.35)]",
  },
  error: {
    duration: 5500,
    icon: XCircle,
    sound: () => audioFeedback.playAlert(),
    container: themeTokens.toast.errorContainer,
    iconChip: themeTokens.toast.errorIconChip,
    iconColor: themeTokens.toast.errorIconColor,
    accentBar: "bg-red-500",
    progressBar: "bg-red-500/60",
    glow: "shadow-[0_8px_28px_-6px_rgba(239,68,68,0.35)]",
  },
  warning: {
    duration: 4500,
    icon: AlertTriangle,
    sound: () => audioFeedback.playDullPluck(),
    container: themeTokens.toast.warningContainer,
    iconChip: themeTokens.toast.warningIconChip,
    iconColor: themeTokens.toast.warningIconColor,
    accentBar: "bg-amber-500",
    progressBar: "bg-amber-500/60",
    glow: "shadow-[0_8px_28px_-6px_rgba(245,158,11,0.35)]",
  },
  info: {
    duration: 3500,
    icon: Info,
    sound: () => audioFeedback.playClick(),
    container: themeTokens.toast.infoContainer,
    iconChip: themeTokens.toast.infoIconChip,
    iconColor: themeTokens.toast.infoIconColor,
    accentBar: "bg-indigo-500",
    progressBar: "bg-indigo-500/60",
    glow: "shadow-[0_8px_28px_-6px_rgba(63, 190, 155,0.3)]",
  },
};

const ToastItem: React.FC<{ toast: Toast; onDismiss: (id: string) => void }> = ({ toast, onDismiss }) => {
  const { tokens, cx } = useThemeTokens();
  const config = TOAST_CONFIG[toast.type];
  const Icon = config.icon;

  const [isPaused, setIsPaused] = useState(false);
  const remainingRef = useRef(config.duration);
  const startedAtRef = useRef(Date.now());
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const clearTimer = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  };

  const startTimer = (ms: number) => {
    clearTimer();
    startedAtRef.current = Date.now();
    timerRef.current = setTimeout(() => onDismiss(toast.id), ms);
  };

  useEffect(() => {
    startTimer(remainingRef.current);
    return clearTimer;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleMouseEnter = () => {
    const elapsed = Date.now() - startedAtRef.current;
    remainingRef.current = Math.max(remainingRef.current - elapsed, 400);
    clearTimer();
    setIsPaused(true);
  };

  const handleMouseLeave = () => {
    setIsPaused(false);
    startTimer(remainingRef.current);
  };

  const iconColorClass = {
    success: tokens.text.success,
    error: tokens.text.danger,
    warning: tokens.text.warning,
    info: tokens.text.accentStrong,
  }[toast.type];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -16, scale: 0.92 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 48, scale: 0.92, transition: { duration: 0.2 } }}
      transition={{ type: "spring", stiffness: 320, damping: 24 }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={cx(
        "relative overflow-hidden rounded-xl border pointer-events-auto backdrop-blur-xs",
        config.container,
        config.glow
      )}
    >
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${config.accentBar}`} />

      <div className="flex items-start gap-3 p-4 pl-5">
        <motion.div
          initial={{ scale: 0, rotate: -20 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ delay: 0.08, type: "spring", stiffness: 400, damping: 15 }}
          className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center ${config.iconChip}`}
        >
          <Icon size={18} className={iconColorClass} />
        </motion.div>

        <div className="flex-1 font-sans text-sm font-medium pr-1 pt-1.5">
          {toast.message}
        </div>

        <button
          onClick={() => onDismiss(toast.id)}
          className="mt-1.5 hover:scale-[1.15] active:scale-90 transition-transform opacity-75 hover:opacity-100 text-current cursor-pointer"
          aria-label="Tutup notifikasi"
        >
          <X size={15} />
        </button>
      </div>

      <div
        className={`toast-progress-bar ${config.progressBar} ${isPaused ? "toast-progress-paused" : ""} absolute bottom-0 left-0 h-[3px] w-full`}
        style={{ animationDuration: `${config.duration}ms` }}
      />
    </motion.div>
  );
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: ToastType = "success") => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);
    TOAST_CONFIG[type].sound();
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}

      <div
        role="status"
        aria-live="polite"
        aria-atomic="false"
        // P4 4.4: di mobile, toast tampil sebagai banner penuh menempel di
        // atas (gaya notifikasi iOS), bukan kartu kecil di pojok kanan yang
        // terasa seperti notifikasi web. Di desktop (>=768px) posisi lama
        // (pojok kanan-atas, lebar terbatas) dipertahankan.
        className="fixed z-[70] flex flex-col gap-2.5 pointer-events-none inset-x-3 top-[max(1rem,env(safe-area-inset-top))] md:inset-x-auto md:top-4 md:right-4 md:max-w-sm md:w-full"
      >
        <AnimatePresence>
          {toasts.map((t) => (
            <ToastItem key={t.id} toast={t} onDismiss={removeToast} />
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
