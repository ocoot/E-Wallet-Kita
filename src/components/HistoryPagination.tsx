import React from "react";
import { useLanguage } from "../contexts/LanguageContext";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { audioFeedback } from "../lib/audio";
import { useThemeTokens } from "../hooks/useThemeTokens";

interface HistoryPaginationProps {
  totalPages: number;
  currentPage: number;
  setCurrentPage: React.Dispatch<React.SetStateAction<number>>;
  paginatedCount: number;
  totalItems: number;
}

export const HistoryPagination: React.FC<HistoryPaginationProps> = ({
  totalPages,
  currentPage,
  setCurrentPage,
  paginatedCount,
  totalItems,
}) => {
  const { tokens, cx } = useThemeTokens();
  const { t } = useLanguage();

  if (totalPages <= 1) return null;

  return (
    <div id="history-pagination-footer" className={cx("p-4 border-t flex items-center justify-between font-sans text-xs", tokens.surface.sunken, tokens.border.accent, tokens.text.muted)}>
      <span>
        {t("history.pagination_info", { current: paginatedCount, total: totalItems })}
      </span>

      {/* Pagination Controls */}
      <div className="flex items-center gap-2">
        <button
          disabled={currentPage === 1}
          aria-label={t("common.previous")}
          onClick={() => {
            audioFeedback.playClick();
            setCurrentPage((curr) => Math.max(1, curr - 1));
          }}
          className={cx("p-1.5 rounded-lg border hover:text-white disabled:opacity-30 disabled:pointer-events-none cursor-pointer", tokens.surface.sunken, tokens.border.accent, tokens.text.secondary)}
        >
          <ChevronLeft size={14} />
        </button>
        
        <span className={cx("font-mono font-semibold", tokens.text.label)}>
          {currentPage} / {totalPages}
        </span>

        <button
          disabled={currentPage === totalPages}
          aria-label={t("common.next")}
          onClick={() => {
            audioFeedback.playClick();
            setCurrentPage((curr) => Math.min(totalPages, curr + 1));
          }}
          className={cx("p-1.5 rounded-lg border hover:text-white disabled:opacity-30 disabled:pointer-events-none cursor-pointer", tokens.surface.sunken, tokens.border.accent, tokens.text.secondary)}
        >
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
};
