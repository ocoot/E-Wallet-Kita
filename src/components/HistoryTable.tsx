import React from "react";
import { useLanguage } from "../contexts/LanguageContext";
import { Transaction, Category } from "../types";
import { Trash2, Send, Pencil } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { EmptyState } from "./EmptyState";

interface HistoryTableProps {
  paginatedTransactions: Transaction[];
  formatDateLabel: (dateStr: string) => string;
  formatIDR: (num: number) => string;
  getSourceIconLabel: (source: "manual" | "ai_web" | "telegram") => string;
  onDeleteItem: (id: string) => void;
  onEditItem: (tx: Transaction) => void;
  categories: Category[];
}

export const HistoryTable: React.FC<HistoryTableProps> = ({
  paginatedTransactions,
  formatDateLabel,
  formatIDR,
  getSourceIconLabel,
  onDeleteItem,
  onEditItem,
  categories,
}) => {
  const { t, locale } = useLanguage();

  return (
    <div id="history-data-table-container" className="border border-slate-800/80 rounded-2xl bg-slate-950/40 relative overflow-hidden light_sakura:border-rose-100/50 light_sakura:bg-rose-50/10">
      {paginatedTransactions.length === 0 ? (
        <EmptyState message={t("history.no_transactions")} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse font-sans text-left text-xs">
            {/* Header row desktop labels */}
            <thead>
              <tr className="border-b border-slate-800/60 bg-slate-950/20 text-gray-400 uppercase tracking-wider select-none font-bold light_sakura:border-rose-100/60 light_sakura:bg-rose-50/20 light_sakura:text-slate-600">
                <th className="p-4 pl-6 w-36">{t("history.col_date")}</th>
                <th className="p-4 w-24">{t("history.col_type")}</th>
                <th className="p-4 w-36">{t("history.col_category")}</th>
                <th className="p-4">{t("transaction.label_note")}</th>
                <th className="p-4 w-32">{t("history.col_amount")}</th>
                <th className="p-4 w-28 hidden md:table-cell">{t("history.col_source")}</th>
                <th className="p-4 pr-6 w-20 text-right">{t("history.col_actions")}</th>
              </tr>
            </thead>

            {/* Data Rows */}
            <tbody className="divide-y divide-slate-800/40 light_sakura:divide-rose-100/30">
              <AnimatePresence mode="popLayout">
                {paginatedTransactions.map((tx, index) => {
                  const isExpense = tx.type === "expense";
                  return (
                    <motion.tr 
                      key={tx.id} 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ 
                        type: "spring",
                        stiffness: 400,
                        damping: 25,
                        delay: Math.min(index * 0.025, 0.2) 
                      }}
                      className="hover:bg-slate-950/15 text-slate-300 transition-all duration-200 light_sakura:text-slate-700 light_sakura:hover:bg-rose-50/20"
                    >
                      {/* Date */}
                      <td className="p-4 pl-6 font-mono font-medium text-slate-400 light_sakura:text-slate-500 shrink-0">
                        {formatDateLabel(tx.transaction_date)}
                      </td>

                      {/* Cashflow Type badge */}
                      <td className="p-4">
                        <span className={`inline-flex px-2 py-1 rounded-md font-bold text-[9px] uppercase tracking-wider
                          ${isExpense 
                            ? "bg-red-500/10 text-red-400 light_sakura:bg-red-50 light_sakura:text-red-500" 
                            : "bg-emerald-500/10 text-emerald-400 light_sakura:bg-emerald-50 light_sakura:text-emerald-500"
                          }`}
                        >
                          {isExpense ? t("transaction.expense") : t("transaction.income")}
                        </span>
                      </td>

                      {/* Category lookup key */}
                      <td className="p-4 font-semibold text-slate-200 light_sakura:text-slate-900">
                        {(() => {
                          const cat = categories.find(c => c.key === tx.category);
                          if (!cat) return tx.category;
                          return locale === "id" ? (cat.label_id || cat.key) : (cat.label_en || cat.key);
                        })()}
                      </td>

                      {/* Description / source details */}
                      <td className="p-4 max-w-sm truncate text-gray-400 light_sakura:text-slate-600 font-medium">
                        {tx.note || <span className="opacity-40 italic">-</span>}
                      </td>

                      {/* Rupiah amounts */}
                      <td className={`p-4 font-mono font-semibold text-sm
                        ${isExpense ? "text-red-400 light_sakura:text-red-600" : "text-emerald-400 light_sakura:text-emerald-600"}`}
                      >
                        {isExpense ? "-" : "+"}
                        {formatIDR(tx.amount)}
                      </td>

                      {/* Source indicator */}
                      <td className="p-4 text-xs font-medium text-slate-500 hidden md:table-cell">
                        <span className="flex items-center gap-1.5">
                          {tx.source === "telegram" && (
                            <div className="bg-[#0088cc]/20 p-1 rounded-md text-[#0088cc]">
                              <Send size={10} className="-translate-x-0.5 translate-y-0.5 rotate-45" />
                            </div>
                          )}
                          <span>{getSourceIconLabel(tx.source)}</span>
                        </span>
                      </td>

                      {/* Row Actions: Edit & Delete */}
                      <td className="p-4 pr-6 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => onEditItem(tx)}
                            aria-label={t("common.edit")}
                            className="p-1.5 rounded-lg border border-transparent hover:border-indigo-500/20 text-gray-500 hover:text-indigo-400 hover:bg-indigo-500/10 transition-colors cursor-pointer hover:scale-115 active:scale-90"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            onClick={() => onDeleteItem(tx.id)}
                            aria-label={t("common.delete")}
                            className="p-1.5 rounded-lg border border-transparent hover:border-red-500/20 text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer hover:scale-115 active:scale-90"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  );
                })}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
