import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { RefreshCw, X } from "lucide-react";
import { useLanguage } from "../contexts/LanguageContext";

/**
 * Banner "Versi baru tersedia" yang muncul otomatis saat service worker
 * mendeteksi ada build baru yang sudah di-deploy ke Vercel.
 *
 * Alur:
 *  1. main.tsx memanggil registerSW({ onNeedRefresh }) dari vite-plugin-pwa
 *  2. Callback itu dispatch custom event "pwa-update-available" + simpan
 *     fungsi updateSW ke window.__pwaUpdateSW
 *  3. Komponen ini mendengarkan event tersebut dan tampil sebagai banner
 *  4. Saat user klik "Perbarui", panggil window.__pwaUpdateSW(true) yang
 *     meminta service worker baru skip waiting lalu reload halaman
 */
export const UpdatePrompt: React.FC = () => {
  const { t } = useLanguage();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handler = () => setVisible(true);
    window.addEventListener("pwa-update-available", handler);
    return () => window.removeEventListener("pwa-update-available", handler);
  }, []);

  const handleUpdate = () => {
    const updateSW = (window as any).__pwaUpdateSW;
    if (typeof updateSW === "function") {
      updateSW(true); // true = reload setelah SW aktif
    } else {
      window.location.reload();
    }
  };

  const handleDismiss = () => setVisible(false);

  return (
    <AnimatePresence>
      {visible && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 sm:p-6">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={handleDismiss}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />

          {/* Modal — di tengah layar, ukuran menyesuaikan mobile/tablet/desktop */}
          <motion.div
            initial={{ scale: 0.92, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 12 }}
            transition={{ type: "spring", stiffness: 300, damping: 28 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="update-prompt-title"
            className="relative w-full max-w-[22rem] sm:max-w-sm md:max-w-md"
          >
            <div className="relative flex flex-col gap-4 p-5 sm:p-6 rounded-2xl shadow-2xl border bg-slate-900 border-indigo-500/30 text-white light_sakura:bg-white light_sakura:border-rose-300/50 light_sakura:text-slate-800">
              <button
                onClick={handleDismiss}
                className="absolute top-3 right-3 p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-white/5 transition-colors cursor-pointer light_sakura:hover:text-slate-700 light_sakura:hover:bg-black/5"
                aria-label="Tutup"
              >
                <X size={16} />
              </button>

              <div className="flex flex-col items-center text-center gap-3 pt-1">
                <div className="p-3 rounded-2xl bg-indigo-500/15 text-indigo-400 light_sakura:bg-rose-500/10 light_sakura:text-rose-500">
                  <RefreshCw size={22} />
                </div>
                <div>
                  <p
                    id="update-prompt-title"
                    className="text-sm sm:text-base font-bold"
                  >
                    {t("pwa.update_title")}
                  </p>
                  <p className="mt-1 text-xs sm:text-sm text-slate-400 light_sakura:text-slate-500">
                    {t("pwa.update_desc")}
                  </p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2 mt-1">
                <button
                  onClick={handleDismiss}
                  className="flex-1 order-2 sm:order-1 px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs sm:text-sm font-bold transition-colors cursor-pointer light_sakura:bg-black/5 light_sakura:hover:bg-black/10 light_sakura:text-slate-600"
                >
                  {t("pwa.update_dismiss") || "Nanti"}
                </button>
                <button
                  onClick={handleUpdate}
                  className="flex-1 order-1 sm:order-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs sm:text-sm font-bold transition-colors cursor-pointer light_sakura:bg-rose-500 light_sakura:hover:bg-rose-400"
                >
                  {t("pwa.update_btn")}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
