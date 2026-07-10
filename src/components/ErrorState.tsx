import React from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { useLanguage } from "../contexts/LanguageContext";

interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry: () => void;
  isRetrying?: boolean;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title,
  description,
  onRetry,
  isRetrying = false,
}) => {
  const { t } = useLanguage();

  return (
    <div className="flex flex-col items-center justify-center p-10 text-center space-y-4">
      <div className="rounded-full p-3.5 bg-red-500/10 text-red-500 light_sakura:bg-rose-50 light_sakura:text-rose-500">
        <AlertCircle size={40} strokeWidth={1.5} />
      </div>
      <h3 className="font-sans font-bold text-slate-300 light_sakura:text-slate-700 text-sm">
        {title || t("network.error_fetching_data")}
      </h3>
      <p className="font-sans text-xs text-slate-500 light_sakura:text-slate-400 max-w-[280px]">
        {description || t("network.error_fallback_desc")}
      </p>
      <button
        onClick={onRetry}
        disabled={isRetrying}
        className="flex items-center gap-2 cursor-pointer rounded-xl px-4 py-2 font-sans text-xs font-semibold tracking-tight text-white shadow-lg transition-all duration-200 bg-indigo-600 hover:bg-indigo-500 hover:shadow-indigo-500/20 light_sakura:bg-rose-500 light_sakura:hover:bg-rose-400 disabled:opacity-50 min-h-[44px]"
      >
        <RefreshCw size={14} className={isRetrying ? "animate-spin" : ""} />
        {t("network.retry_button")}
      </button>
    </div>
  );
};
