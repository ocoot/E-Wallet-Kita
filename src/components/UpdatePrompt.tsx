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
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 28 }}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] w-[calc(100%-2rem)] max-w-sm"
        >
          <div className="flex items-center gap-3 px-4 py-3 rounded-2xl shadow-2xl border bg-slate-900 border-indigo-500/30 text-white light_sakura:bg-white light_sakura:border-rose-300/50 light_sakura:text-slate-800">
            <div className="p-2 rounded-xl bg-indigo-500/15 text-indigo-400 shrink-0 light_sakura:bg-rose-500/10 light_sakura:text-rose-500">
              <RefreshCw size={16} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold truncate">
                {t("pwa.update_title")}
              </p>
              <p className="text-[11px] text-slate-400 light_sakura:text-slate-500 truncate">
                {t("pwa.update_desc")}
              </p>
            </div>
            <button
              onClick={handleUpdate}
              className="shrink-0 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold transition-colors cursor-pointer light_sakura:bg-rose-500 light_sakura:hover:bg-rose-400"
            >
              {t("pwa.update_btn")}
            </button>
            <button
              onClick={handleDismiss}
              className="shrink-0 p-1 rounded-lg text-slate-500 hover:text-slate-300 transition-colors cursor-pointer light_sakura:hover:text-slate-700"
              aria-label="Tutup"
            >
              <X size={14} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
