import React from "react";
import { useLanguage } from "../contexts/LanguageContext";
import { FileDown, ChevronDown, Trash2, Lock } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { audioFeedback } from "../lib/audio";
import { usePremium } from "../hooks/usePremium";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { useThemeTokens } from "../hooks/useThemeTokens";

interface HistoryExportProps {
  isExportMenuOpen: boolean;
  setIsExportMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsSummaryConfirmOpen: (val: boolean) => void;
  setIsFullExportOpen: (val: boolean) => void;
  setIsDeleteAllOpen: (val: boolean) => void;
  hasTransactions: boolean;
  onRequirePremium: () => void;
}

export const HistoryExport: React.FC<HistoryExportProps> = ({
  isExportMenuOpen,
  setIsExportMenuOpen,
  setIsSummaryConfirmOpen,
  setIsFullExportOpen,
  setIsDeleteAllOpen,
  hasTransactions,
  onRequirePremium,
}) => {
  const { tokens, cx } = useThemeTokens();
  const { t, locale } = useLanguage();
  const { isPremium } = usePremium();
  const { user } = useAuth();
  const { showToast } = useToast();

  const isGuest = user?.is_anonymous ?? false;
  const isExportLocked = isGuest || !isPremium;

  return (
    <div id="history-export-header-row" className={cx("flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-6", tokens.border.accent)}>
      <div>
        <h2 className={cx("font-sans font-bold text-2xl tracking-tight", tokens.text.onSurface)}>
          {t("history.title")}
        </h2>
        <p className={cx("font-sans text-sm mt-1", tokens.text.secondary)}>
          {t("history.desc")}
        </p>
      </div>
      
      <div className="flex items-center gap-3 self-start md:self-center relative">
        {/* Export PDF dropdown */}
        <div className="relative">
          <button
            onClick={() => {
              audioFeedback.playClick();
              if (isExportLocked) {
                if (isGuest) {
                  audioFeedback.playDullPluck();
                  showToast(
                    t("history.locked_export_guest"),
                    "error"
                  );
                } else {
                  onRequirePremium();
                }
                return;
              }
              setIsExportMenuOpen((prev) => !prev);
            }}
            className={cx(
              "cursor-pointer px-4.5 py-3 border text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-colors",
              isExportLocked
                ? tokens.historyExport.optionActive
                : tokens.historyExport.optionInactive
            )}
          >
            {isExportLocked ? <Lock size={15} /> : <FileDown size={15} />}
            <span>{t("history.export_menu_label")}</span>
            {!isExportLocked && (
              <ChevronDown size={13} className={`transition-transform ${isExportMenuOpen ? "rotate-180" : ""}`} />
            )}
          </button>

          <AnimatePresence>
            {isExportMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-30"
                  onClick={() => setIsExportMenuOpen(false)}
                />
                <motion.div
                  initial={{ opacity: 0, y: -8, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.97 }}
                  transition={{ type: "spring", duration: 0.2 }}
                  className={cx("absolute left-0 md:left-auto md:right-0 mt-2 w-56 max-w-[calc(100vw-2rem)] z-40 rounded-xl border shadow-2xl overflow-hidden", tokens.surface.card, tokens.border.accent)}
                >
                  <button
                    onClick={() => {
                      setIsExportMenuOpen(false);
                      audioFeedback.playClick();
                      if (!isPremium) {
                        onRequirePremium();
                        return;
                      }
                      setIsSummaryConfirmOpen(true);
                    }}
                    className={cx("w-full text-left px-4 py-3 text-xs font-semibold transition-colors cursor-pointer flex items-center justify-between", tokens.text.secondary, tokens.hover.sunken)}
                  >
                    <span>{t("history.export_summary_pdf")}</span>
                    {!isPremium && (
                      <span className="text-[clamp(0.5625rem,2.6vw,0.625rem)] text-amber-400 font-bold bg-amber-400/10 px-1.5 py-0.5 rounded">
                        PRO
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => {
                      setIsExportMenuOpen(false);
                      audioFeedback.playClick();
                      if (!isPremium) {
                        onRequirePremium();
                        return;
                      }
                      setIsFullExportOpen(true);
                    }}
                    className={cx("w-full text-left px-4 py-3 text-xs font-semibold transition-colors cursor-pointer border-t flex items-center justify-between", tokens.text.secondary, tokens.hover.sunken, tokens.border.accent)}
                  >
                    <span>{t("history.export_full_pdf")}</span>
                    {!isPremium && (
                      <span className="text-[clamp(0.5625rem,2.6vw,0.625rem)] text-amber-400 font-bold bg-amber-400/10 px-1.5 py-0.5 rounded">
                        PRO
                      </span>
                    )}
                  </button>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>

        {hasTransactions && (
          <button
            onClick={() => {
              audioFeedback.playClick();
              setIsDeleteAllOpen(true);
            }}
            className="cursor-pointer px-4.5 py-3 border border-red-500/20 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <Trash2 size={15} />
            <span>{t("history.btn_delete_all")}</span>
          </button>
        )}
      </div>
    </div>
  );
};
