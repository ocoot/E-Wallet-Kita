import React from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { useLanguage } from "../contexts/LanguageContext";

interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
}

/**
 * Tampilan error generik untuk kegagalan memuat data (fetch gagal, koneksi
 * putus, dll), dengan tombol "Coba Lagi" yang konsisten secara visual
 * dengan `EmptyState`.
 *
 * Sebelumnya kegagalan fetch di kebanyakan halaman hanya dicatat lewat
 * `console.error` tanpa umpan balik apapun ke pengguna -- dari sudut
 * pandang pengguna, halaman terlihat kosong/macet tanpa penjelasan dan
 * tanpa cara untuk mencoba lagi selain me-refresh seluruh halaman.
 */
export const ErrorState: React.FC<ErrorStateProps> = ({ title, description, onRetry }) => {
  const { t } = useLanguage();

  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center p-10 text-center space-y-4"
    >
      <div className="w-16 h-16 rounded-full flex items-center justify-center bg-red-500/10 light_sakura:bg-red-50">
        <AlertTriangle size={28} className="text-red-400 light_sakura:text-red-500" />
      </div>
      <h3 className="font-sans font-bold text-slate-300 light_sakura:text-slate-700 text-sm">
        {title || t("common.error_generic_title")}
      </h3>
      <p className="font-sans text-xs text-slate-500 light_sakura:text-slate-400 max-w-[240px]">
        {description || t("common.error_generic_desc")}
      </p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-300 light_sakura:bg-red-50 light_sakura:hover:bg-red-100 light_sakura:text-red-600 text-xs font-sans font-bold transition-colors cursor-pointer"
        >
          <RotateCcw size={13} />
          {t("common.retry")}
        </button>
      )}
    </div>
  );
};
