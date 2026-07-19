import React from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { useLanguage } from "../contexts/LanguageContext";
import { useThemeTokens } from "../hooks/useThemeTokens";

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
  const { tokens, cx } = useThemeTokens();
  const { t } = useLanguage();

  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center p-10 text-center space-y-4"
    >
      <div className={cx("w-16 h-16 rounded-full flex items-center justify-center", tokens.errorState.iconCircleBg)}>
        <AlertTriangle size={28} className={tokens.newTransaction.amountDisplayExpense} />
      </div>
      <h3 className={cx("font-sans font-bold text-sm", tokens.text.secondary)}>
        {title || t("common.error_generic_title")}
      </h3>
      <p className={cx("font-sans text-xs max-w-[240px]", tokens.text.muted)}>
        {description || t("common.error_generic_desc")}
      </p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className={cx("flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-sans font-bold transition-colors cursor-pointer", tokens.errorState.retryBtn)}
        >
          <RotateCcw size={13} />
          {t("common.retry")}
        </button>
      )}
    </div>
  );
};
