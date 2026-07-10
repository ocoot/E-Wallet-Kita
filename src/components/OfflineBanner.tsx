import React from "react";
import { useOnlineStatus } from "../hooks/useOnlineStatus";
import { useLanguage } from "../contexts/LanguageContext";
import { WifiOff } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

export const OfflineBanner: React.FC = () => {
  const isOnline = useOnlineStatus();
  const { t } = useLanguage();

  return (
    <AnimatePresence>
      {!isOnline && (
        <motion.div
          initial={{ opacity: 0, y: -50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -50 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="fixed top-0 left-0 right-0 z-[90] flex items-center justify-center p-3.5 bg-amber-600 text-white shadow-lg text-center font-sans font-medium text-xs sm:text-sm gap-2"
        >
          <WifiOff size={16} className="animate-pulse shrink-0" />
          <span>
            <strong>{t("network.offline_banner_title")}:</strong> {t("network.offline_banner_desc")}
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
