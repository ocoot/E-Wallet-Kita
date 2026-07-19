import React, { useMemo } from "react";
import { useLanguage } from "../contexts/LanguageContext";
import { Transaction, Category } from "../types";
import { Trash2, Send, Pencil, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { EmptyState } from "./EmptyState";
import { useThemeTokens } from "../hooks/useThemeTokens";

interface HistoryGroupedListProps {
  paginatedTransactions: Transaction[];
  formatDateLabel: (dateStr: string) => string;
  formatIDR: (num: number) => string;
  getSourceIconLabel: (source: "manual" | "ai_web" | "telegram") => string;
  onDeleteItem: (id: string) => void;
  onEditItem: (tx: Transaction) => void;
  categories: Category[];
}

// ── Formasi: dikelompokkan per tanggal, ala mutasi rekening m-banking ──
// Menggantikan tabel horizontal-scroll dengan list vertikal yang lebih
// nyaman dibaca di layar HP.
export const HistoryGroupedList: React.FC<HistoryGroupedListProps> = ({
  paginatedTransactions,
  formatDateLabel,
  formatIDR,
  getSourceIconLabel,
  onDeleteItem,
  onEditItem,
  categories,
}) => {
  const { tokens, cx } = useThemeTokens();
  const { t, locale } = useLanguage();

  const groups = useMemo(() => {
    const map = new Map<string, Transaction[]>();
    for (const tx of paginatedTransactions) {
      const key = tx.transaction_date;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(tx);
    }
    return Array.from(map.entries());
  }, [paginatedTransactions]);

  const getCategoryLabel = (key: string) => {
    const cat = categories.find(c => c.key === key);
    if (!cat) return key;
    return locale === "id" ? (cat.label_id || cat.key) : (cat.label_en || cat.key);
  };

  if (paginatedTransactions.length === 0) {
    return (
      <div className={cx("border rounded-2xl", tokens.border.accent, tokens.surface.sunken)}>
        <EmptyState message={t("history.no_transactions")} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {groups.map(([date, txs]) => (
        <div key={date}>
          <div className={cx("text-[clamp(0.5906rem,2.73vw,0.6562rem)] font-bold uppercase tracking-widest mb-2 px-1", tokens.text.muted)}>
            {formatDateLabel(date)}
          </div>
          <div className={cx("rounded-2xl border overflow-hidden divide-y", tokens.border.accent, tokens.surface.sunken, tokens.historyGroupedList.divideSubtle)}>
            <AnimatePresence mode="popLayout">
              {txs.map(tx => {
                const isExpense = tx.type === "expense";
                return (
                  <motion.div
                    key={tx.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.97 }}
                    className={cx("flex items-center gap-3 p-3.5 transition-colors", tokens.hover.sunken)}
                  >
                    {/* Icon lingkaran */}
                    <div className={`w-9 h-9 shrink-0 rounded-xl flex items-center justify-center ${
                      isExpense ? tokens.historyGroupedList.expenseChip
                                : tokens.historyGroupedList.incomeChip
                    }`}>
                      {isExpense ? <ArrowUpRight size={15} /> : <ArrowDownLeft size={15} />}
                    </div>

                    {/* Detail */}
                    <div className="min-w-0 flex-1">
                      <p className={cx("font-sans font-bold text-sm truncate", tokens.text.heading)}>
                        {getCategoryLabel(tx.category)}
                      </p>
                      <p className={cx("text-[clamp(0.5906rem,2.73vw,0.6562rem)] mt-0.5 truncate flex items-center gap-1", tokens.text.muted)}>
                        {tx.source === "telegram" && (
                          <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-sm bg-[#0088cc]/20 text-[#0088cc] shrink-0">
                            <Send size={8} className="-translate-x-0.5 translate-y-0.5 rotate-45" />
                          </span>
                        )}
                        {tx.note ? tx.note : getSourceIconLabel(tx.source)}
                      </p>
                    </div>

                    {/* Nominal + actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      <span className={`font-mono font-bold text-sm ${isExpense ? tokens.text.danger : tokens.text.success}`}>
                        {isExpense ? "-" : "+"}{formatIDR(tx.amount)}
                      </span>
                      <button
                        onClick={() => onEditItem(tx)}
                        aria-label={t("common.edit")}
                        className="btn-mobile-target p-2 rounded-lg text-slate-500 select-none hover:text-indigo-400 hover:bg-indigo-500/10 transition-[transform,background-color,color] cursor-pointer active:scale-90"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => onDeleteItem(tx.id)}
                        aria-label={t("common.delete")}
                        className="btn-mobile-target p-2 rounded-lg text-slate-500 select-none hover:text-red-400 hover:bg-red-500/10 transition-[transform,background-color,color] cursor-pointer active:scale-90"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </div>
      ))}
    </div>
  );
};
