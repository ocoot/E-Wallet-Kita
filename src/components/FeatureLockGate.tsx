import React from "react";
import { motion } from "motion/react";
import { Lock } from "lucide-react";
import { useLanguage } from "../contexts/LanguageContext";
import { useMaintenance } from "../contexts/MaintenanceContext";

interface FeatureLockGateProps {
  /** feature_key sesuai data di tabel maintenance_feature_locks. */
  featureKey: string;
  children: React.ReactNode;
}

/**
 * Membungkus halaman/fitur tertentu. Jika fitur sedang dikunci oleh
 * admin/owner (lewat tab Maintenance di Admin Panel), tampilan asli
 * fitur diganti dengan layar "tergembok" dan tidak bisa diakses.
 * Semua teks ditarik dari kamus i18n (locales/id.json & en.json),
 * tidak ada string yang ditulis langsung di komponen ini.
 */
export const FeatureLockGate: React.FC<FeatureLockGateProps> = ({ featureKey, children }) => {
  const { t } = useLanguage();
  const { isFeatureLocked } = useMaintenance();

  if (!isFeatureLocked(featureKey)) {
    return <>{children}</>;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6 bg-slate-950/20 rounded-3xl border border-amber-500/20 light_sakura:bg-amber-50/40 light_sakura:border-amber-200"
    >
      <div className="p-4 rounded-full bg-amber-500/10 border border-amber-500/30 mb-4">
        <Lock size={36} className="text-amber-400" />
      </div>
      <h2 className="font-sans font-bold text-lg text-slate-100 light_sakura:text-slate-900">
        {t("maintenance.feature_locked_title")}
      </h2>
      <p className="font-sans text-xs text-slate-400 mt-2 max-w-md leading-relaxed light_sakura:text-slate-500">
        {t("maintenance.feature_locked_desc")}
      </p>
    </motion.div>
  );
};
