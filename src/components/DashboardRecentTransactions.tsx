import React from "react";
import { useLanguage } from "../contexts/LanguageContext";
import { Transaction, Category } from "../types";
import { ArrowUpRight, ArrowDownLeft, ArrowRight, Send, Sparkles, User } from "lucide-react";
import { motion } from "motion/react";
import { audioFeedback } from "../lib/audio";
import { EmptyState } from "./EmptyState";

interface DashboardRecentTransactionsProps {
  transactions: Transaction[];
  formatIDR: (num: number) => string;
  formatDateLabel: (dateStr: string) => string;
  onNavigateToHistory: () => void;
  categories: Category[];
}

export const DashboardRecentTransactions: React.FC<DashboardRecentTransactionsProps> = ({
  transactions,
  formatIDR,
  formatDateLabel,
  onNavigateToHistory,
  categories,
}) => {
  const { t, locale } = useLanguage();

  // Sort and slice top 5 latest transactions
  const latestTransactions = [...transactions]
    .sort((a, b) => new Date(b.transaction_date).getTime() - new Date(a.transaction_date).getTime() || b.created_at.localeCompare(a.created_at))
    .slice(0, 5);

  const getSourceIcon = (source: "manual" | "ai_web" | "telegram") => {
    if (source === "telegram") {
      return (
        <div className="bg-[#0088cc]/15 p-2 rounded-xl text-[#0088cc] flex items-center justify-center">
          <Send size={15} className="-translate-x-0.5 translate-y-0.5 rotate-45" />
        </div>
      );
    }
    if (source === "ai_web") {
      return (
        <div className="bg-indigo-500/15 p-2 rounded-xl text-indigo-400 light_sakura:bg-rose-50 light_sakura:text-rose-500 flex items-center justify-center">
          <Sparkles size={15} />
        </div>
      );
    }
    return (
      <div className="bg-slate-800 p-2 rounded-xl text-slate-300 light_sakura:bg-slate-100 light_sakura:text-slate-600 flex items-center justify-center">
        <User size={15} />
      </div>
    );
  };

  return (
    <div id="recent-transactions-panel" className="p-6 md:p-8 rounded-3xl border bg-slate-900 border-slate-900 transition-colors duration-300 light_sakura:bg-white light_sakura:border-rose-100/10 shadow-lg space-y-6">
      <div className="flex items-center justify-between border-b border-slate-800/50 pb-5 light_sakura:border-rose-100/30">
        <div>
          <h3 className="font-sans font-bold text-base text-white tracking-tight light_sakura:text-slate-800">
            {t("history.title")}
          </h3>
          <p className="font-sans text-xs text-slate-400 mt-1 light_sakura:text-slate-500">
            {t("history.pagination_info", { current: latestTransactions.length, total: transactions.length })}
          </p>
        </div>

        <button
          onClick={() => {
            audioFeedback.playClick();
            onNavigateToHistory();
          }}
          className="cursor-pointer px-3.5 py-2 hover:bg-slate-800 rounded-xl text-[11px] font-bold text-indigo-400 light_sakura:text-rose-500 light_sakura:hover:bg-rose-50 flex items-center gap-1.5 transition-colors"
        >
          <span>{t("history.show_all")}</span>
          <ArrowRight size={13} />
        </button>
      </div>

      {latestTransactions.length === 0 ? (
        <EmptyState message={t("history.no_transactions")} />
      ) : (
        <div className="space-y-4">
          {latestTransactions.map((tx, index) => {
            const isExpense = tx.type === "expense";
            return (
              <motion.div
                key={tx.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="flex items-center justify-between p-4 rounded-2xl bg-slate-950/40 hover:bg-slate-950/60 border border-slate-800/40 hover:border-slate-700 transition-all duration-200 light_sakura:bg-rose-50/20 light_sakura:border-rose-100/10"
              >
                <div className="flex items-center gap-3">
                  {getSourceIcon(tx.source)}
                  <div>
                    <div className="font-sans text-xs font-bold text-white light_sakura:text-slate-800">
                      {(() => {
                        if (tx.note) return tx.note;
                        const cat = categories.find(c => c.key === tx.category);
                        if (!cat) return tx.category;
                        return locale === "id" ? (cat.label_id || cat.key) : (cat.label_en || cat.key);
                      })()}
                    </div>
                    <div className="font-sans text-[10px] text-slate-400 light_sakura:text-slate-500 mt-0.5 flex items-center gap-1.5">
                      <span>{formatDateLabel(tx.transaction_date)}</span>
                      <span className="w-1 h-1 rounded-full bg-slate-700 light_sakura:bg-rose-100" />
                      <span className="font-semibold text-slate-300 light_sakura:text-slate-600">
                        {(() => {
                          const cat = categories.find(c => c.key === tx.category);
                          if (!cat) return tx.category;
                          return locale === "id" ? (cat.label_id || cat.key) : (cat.label_en || cat.key);
                        })()}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <div className={`font-mono font-bold text-sm flex items-center gap-1 justify-end ${isExpense ? "text-red-400 light_sakura:text-red-600" : "text-emerald-400 light_sakura:text-emerald-600"}`}>
                    <span>{isExpense ? "-" : "+"}</span>
                    <span className="whitespace-nowrap tabular-nums">{formatIDR(tx.amount)}</span>
                  </div>
                  <div className="text-[9px] text-slate-500 light_sakura:text-slate-400 font-sans mt-0.5">
                    {isExpense ? t("transaction.expense") : t("transaction.income")}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
};
