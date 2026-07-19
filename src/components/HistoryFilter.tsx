import React from "react";
import { useLanguage } from "../contexts/LanguageContext";
import { Search, Filter } from "lucide-react";
import { DropdownField } from "./DropdownField";
import { SegmentedControl } from "./ui/SegmentedControl";
import { audioFeedback } from "../lib/audio";
import { Category } from "../types";
import { useThemeTokens } from "../hooks/useThemeTokens";

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
  const { tokens, cx } = useThemeTokens();
  const { t, locale } = useLanguage();

  return (
    <div id="history-controls-row" className={cx("grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-4 rounded-2xl border", tokens.surface.sunken, tokens.border.accent)}>
      {/* 1. Month Selector dropdown */}
      <div className="space-y-1.5">
        <label className={cx("font-sans text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold uppercase tracking-wider block", tokens.text.muted)}>
          {t("history.filter_month")}
        </label>
        <DropdownField
          value={filterMonth}
          onChange={(v) => { audioFeedback.playClick(); setFilterMonth(v); }}
          options={monthOptions}
        />
      </div>

      {/* 2. Category Filter */}
      <div className="space-y-1.5">
        <label className={cx("font-sans text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold uppercase tracking-wider block flex items-center gap-1.5", tokens.text.muted)}>
          <Filter size={10} />
          <span>{t("transaction.label_category")}</span>
        </label>
        <DropdownField
          value={filterCategory}
          onChange={(v) => { audioFeedback.playClick(); setFilterCategory(v); }}
          options={[
            { value: "all", label: locale === "id" ? "Semua Kategori" : "All Categories" },
            ...categories.map((cat) => ({
              value: cat.key,
              label: locale === "id" ? (cat.label_id || cat.key) : (cat.label_en || cat.key),
            })),
          ]}
        />
      </div>

      {/* 3. Text Filter search bar */}
      <div className="space-y-1.5">
        <label className={cx("font-sans text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold uppercase tracking-wider block", tokens.text.muted)}>
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
            className={cx("w-full pl-10 pr-4 py-2.5 rounded-xl font-sans text-xs outline-none focus:border-indigo-500 border", tokens.surface.sunken, tokens.border.accent, tokens.text.onSurface)}
          />
        </div>
      </div>

      {/* 4. Dynamic page sizing selector -- SegmentedControl (P3 3.2): opsi
          tetap & sedikit (5/10/15/20/50/Semua), pas untuk pill iOS-style
          dengan indikator meluncur, berbeda dari filter bulan/kategori di
          atas yang jumlah opsinya dinamis/tidak terbatas sehingga tetap
          pakai DropdownField. */}
      <div className="space-y-1.5">
        <label className={cx("font-sans text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold uppercase tracking-wider block", tokens.text.muted)}>
          {t("history.page_size")}
        </label>
        <SegmentedControl
          ariaLabel={t("history.page_size")}
          value={String(pageSize)}
          onChange={(v) => setPageSize(v === "all" ? "all" : parseInt(v))}
          options={[
            { value: "5", label: "5" },
            { value: "10", label: "10" },
            { value: "15", label: "15" },
            { value: "20", label: "20" },
            { value: "50", label: "50" },
            { value: "all", label: t("history.show_all") },
          ]}
        />
      </div>
    </div>
  );
};
