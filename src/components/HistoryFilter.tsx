import React from "react";
import { useLanguage } from "../contexts/LanguageContext";
import { Search } from "lucide-react";
import { audioFeedback } from "../lib/audio";

interface HistoryFilterProps {
  filterMonth: string;
  setFilterMonth: (val: string) => void;
  monthOptions: { value: string; label: string }[];
  search: string;
  setSearch: (val: string) => void;
  pageSize: number | "all";
  setPageSize: (val: number | "all") => void;
}

export const HistoryFilter: React.FC<HistoryFilterProps> = ({
  filterMonth,
  setFilterMonth,
  monthOptions,
  search,
  setSearch,
  pageSize,
  setPageSize,
}) => {
  const { t } = useLanguage();

  return (
    <div id="history-controls-row" className="grid grid-cols-1 md:grid-cols-3 gap-4 pb-2">
      {/* Month Selector dropdown */}
      <div className="space-y-1.5">
        <label className="font-sans text-[10px] font-bold text-gray-400 uppercase tracking-wider block light_sakura:text-slate-500">
          {t("history.filter_month")}
        </label>
        <div className="relative">
          <select
            value={filterMonth}
            onChange={(e) => {
              audioFeedback.playClick();
              setFilterMonth(e.target.value);
            }}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 font-sans text-xs text-white outline-none focus:border-indigo-500 light_sakura:bg-slate-50 light_sakura:border-rose-100 light_sakura:text-slate-800 cursor-pointer"
          >
            {monthOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Text Filter search bar */}
      <div className="space-y-1.5">
        <label className="font-sans text-[10px] font-bold text-gray-400 uppercase tracking-wider block light_sakura:text-slate-500">
          {t("history.search_label")}
        </label>
        <div className="relative">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400">
            <Search size={14} />
          </span>
          <input
            type="text"
            placeholder={t("history.search_placeholder")}
            value={search}
            onChange={(e) => {
              if (!search || !e.target.value) {
                audioFeedback.playClick();
              }
              setSearch(e.target.value);
            }}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl font-sans text-xs text-white outline-none focus:border-indigo-500 light_sakura:bg-slate-50 light_sakura:border-rose-100 light_sakura:text-slate-800"
          />
        </div>
      </div>

      {/* Dynamic page sizing selector key */}
      <div className="space-y-1.5">
        <label className="font-sans text-[10px] font-bold text-gray-400 uppercase tracking-wider block light_sakura:text-slate-500">
          {t("history.page_size")}
        </label>
        <select
          value={pageSize}
          onChange={(e) => {
            audioFeedback.playClick();
            const val = e.target.value;
            setPageSize(val === "all" ? "all" : parseInt(val));
          }}
          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 font-sans text-xs text-white outline-none focus:border-indigo-500 light_sakura:bg-slate-50 light_sakura:border-rose-100 light_sakura:text-slate-800 cursor-pointer"
        >
          <option value={5}>5</option>
          <option value={10}>10</option>
          <option value={15}>15</option>
          <option value={20}>20</option>
          <option value={50}>50</option>
          <option value="all">{t("history.show_all")}</option>
        </select>
      </div>
    </div>
  );
};
