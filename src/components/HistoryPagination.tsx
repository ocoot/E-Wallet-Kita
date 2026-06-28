import React from "react";
import { useLanguage } from "../contexts/LanguageContext";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { audioFeedback } from "../lib/audio";

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
  const { t } = useLanguage();

  if (totalPages <= 1) return null;

  return (
    <div id="history-pagination-footer" className="p-4 bg-slate-950/20 border-t border-slate-800/50 flex items-center justify-between font-sans text-xs text-slate-400 light_sakura:bg-rose-50/20 light_sakura:border-rose-100">
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
          className="p-1.5 rounded-lg bg-slate-950 hover:bg-slate-900 border border-slate-800 hover:text-white disabled:opacity-30 disabled:pointer-events-none cursor-pointer light_sakura:bg-white light_sakura:border-rose-100 light_sakura:text-slate-800"
        >
          <ChevronLeft size={14} />
        </button>
        
        <span className="font-mono font-semibold text-slate-300 light_sakura:text-slate-800">
          {currentPage} / {totalPages}
        </span>

        <button
          disabled={currentPage === totalPages}
          aria-label={t("common.next")}
          onClick={() => {
            audioFeedback.playClick();
            setCurrentPage((curr) => Math.min(totalPages, curr + 1));
          }}
          className="p-1.5 rounded-lg bg-slate-950 hover:bg-slate-900 border border-slate-800 hover:text-white disabled:opacity-30 disabled:pointer-events-none cursor-pointer light_sakura:bg-white light_sakura:border-rose-100 light_sakura:text-slate-800"
        >
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
};
