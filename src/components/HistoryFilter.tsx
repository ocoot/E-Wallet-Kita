import React from "react";
import { useLanguage } from "../contexts/LanguageContext";
import { Search, Filter } from "lucide-react";
import { audioFeedback } from "../lib/audio";
import { Category } from "../types";

interface HistoryFilterProps {
  filterMonth: string;
  setFilterMonth: (val: string) => void;
  monthOptions: { value: string; label: string }[];
  search: string;
  setSearch: (val: string) => void;
  pageSize: number | "all";
  setPageSize: (val: number | "all") => void;
  filterCategory: string;
  setFilterCategory: (val: string) => void;
  categories: Category[];
}

export const HistoryFilter: React.FC<HistoryFilterProps> = ({
  filterMonth,
  setFilterMonth,
  monthOptions,
  search,
  setSearch,
  pageSize,
  setPageSize,
  filterCategory,
  setFilterCategory,
  categories,
}) => {
  const { t, locale } = useLanguage();

  return (
    <div id="history-controls-row" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-4 rounded-2xl bg-slate-950/40 border border-slate-800/50 light_sakura:bg-rose-50/20 light_sakura:border-rose-100/30">
      {/* 1. Month Selector dropdown */}
      <div className="space-y-1.5">
        <label className="font-sans text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold text-slate-400 uppercase tracking-wider block light_sakura:text-slate-500">
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

      {/* 2. Category Filter */}
      <div className="space-y-1.5">
        <label className="font-sans text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold text-slate-400 uppercase tracking-wider block light_sakura:text-slate-500 flex items-center gap-1.5">
          <Filter size={10} />
          <span>{t("transaction.label_category")}</span>
        </label>
        <select
          value={filterCategory}
          onChange={(e) => {
            audioFeedback.playClick();
            setFilterCategory(e.target.value);
          }}
          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 font-sans text-xs text-white outline-none focus:border-indigo-500 light_sakura:bg-slate-50 light_sakura:border-rose-100 light_sakura:text-slate-800 cursor-pointer"
        >
          <option value="all">{locale === "id" ? "Semua Kategori" : "All Categories"}</option>
          {categories.map((cat) => (
            <option key={cat.key} value={cat.key}>
              {locale === "id" ? (cat.label_id || cat.key) : (cat.label_en || cat.key)}
            </option>
          ))}
        </select>
      </div>

      {/* 3. Text Filter search bar */}
      <div className="space-y-1.5">
        <label className="font-sans text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold text-slate-400 uppercase tracking-wider block light_sakura:text-slate-500">
          {t("history.search_label")}
        </label>
        <div className="relative">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
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

      {/* 4. Dynamic page sizing selector */}
      <div className="space-y-1.5">
        <label className="font-sans text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold text-slate-400 uppercase tracking-wider block light_sakura:text-slate-500">
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
