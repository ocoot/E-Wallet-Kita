import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { WifiOff } from "lucide-react";
import { useOnlineStatus } from "../hooks/useOnlineStatus";
import { useLanguage } from "../contexts/LanguageContext";

/**
 * Banner persisten yang muncul di atas layar (di bawah header) begitu
 * koneksi internet putus, dan otomatis hilang begitu koneksi kembali.
 *
 * Kenapa perlu: sebelumnya tidak ada state "offline" di UI manapun --
 * fetch yang gagal karena koneksi putus hanya dicatat ke console, jadi
 * dari sudut pandang pengguna app terlihat "macet"/data tidak berubah
 * tanpa penjelasan. Dipasang sekali di root layout (App.tsx) supaya
 * konsisten muncul di semua halaman, termasuk saat modal/dialog terbuka.
 */
export const OfflineBanner: React.FC = () => {
  const isOnline = useOnlineStatus();
  const { t } = useLanguage();

  return (
    <AnimatePresence>
      {!isOnline && (
        <motion.div
          initial={{ y: -48, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -48, opacity: 0 }}
          transition={{ type: "spring", damping: 22, stiffness: 260 }}
          role="status"
          aria-live="polite"
          className="fixed top-0 left-0 right-0 z-[95] flex items-center justify-center gap-2 bg-amber-500 text-amber-950 text-xs font-sans font-bold px-4 py-2 shadow-lg"
        >
          <WifiOff size={14} className="shrink-0" />
          <span>{t("common.offline_banner") || "Tidak ada koneksi internet. Beberapa data mungkin tidak termuat."}</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
