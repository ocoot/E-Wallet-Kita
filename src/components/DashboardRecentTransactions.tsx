import React from "react";
import { useLanguage } from "../contexts/LanguageContext";
import { Transaction, Category } from "../types";
import { ArrowUpRight, ArrowDownLeft, ArrowRight, Send, Sparkles, User, History } from "lucide-react";
import { motion } from "motion/react";
import { audioFeedback } from "../lib/audio";
import { EmptyState } from "./EmptyState";
import { Card } from "./ui/Card";
import { useThemeTokens } from "../hooks/useThemeTokens";

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
  const { tokens, cx } = useThemeTokens();

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
        <div className={cx(tokens.dashboardRecentTransactions.aiWebIconChip, tokens.icon.accent)}>
          <Sparkles size={15} />
        </div>
      );
    }
    return (
      <div className={cx("p-2 rounded-xl flex items-center justify-center", tokens.errorMonitor.progressBg, tokens.text.label)}>
        <User size={15} />
      </div>
    );
  };

  return (
    <>
      {/* Header -- ikon + label kecil uppercase, disamakan persis dengan
          pola "Ringkasan Keseluruhan" (DashboardOverviewCard.tsx) dan
          "Tren Visual..." (DashboardChart.tsx). Deskripsi "Menampilkan X
          dari Y log transaksi" dihapus atas permintaan user -- tombol
          "Tampilkan Semua" tetap di baris yang sama, kanan. */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <History size={14} className={tokens.icon.accent} />
          <h3 className={cx("text-xs font-bold uppercase tracking-wider", tokens.text.muted)}>
            {t("history.title")}
          </h3>
        </div>

        <button
          onClick={() => {
            audioFeedback.playClick();
            onNavigateToHistory();
          }}
          className={cx("select-none transition-transform active:scale-95", tokens.dashboardRecentTransactions.showAllBtnHover, tokens.text.accent)}
        >
          <span>{t("history.show_all")}</span>
          <ArrowRight size={13} />
        </button>
      </div>

      <Card id="recent-transactions-panel" padding="lg" border="subtle" elevation="ambient" className="space-y-6">

      {latestTransactions.length === 0 ? (
        <EmptyState message={t("history.no_transactions")} />
      ) : (
        <div className="space-y-1">
          {latestTransactions.map((tx, index) => {
            const isExpense = tx.type === "expense";
            return (
              <motion.div
                key={tx.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className={cx(tokens.dashboardRecentTransactions.rowCardBg, "rounded-xl px-2 py-1 -mx-2 transition-colors hover:bg-white/[0.03] light_sakura:hover:bg-slate-900/[0.03] cursor-default")}
              >
                <div className="flex items-center gap-3">
                  {getSourceIcon(tx.source)}
                  <div>
                    <div className={cx("font-sans text-xs font-bold", tokens.text.onSurface)}>
                      {(() => {
                        if (tx.note) return tx.note;
                        const cat = categories.find(c => c.key === tx.category);
                        if (!cat) return tx.category;
                        return locale === "id" ? (cat.label_id || cat.key) : (cat.label_en || cat.key);
                      })()}
                    </div>
                    <div className={cx("font-sans text-[clamp(0.5625rem,2.6vw,0.625rem)] mt-0.5 flex items-center gap-1.5", tokens.text.muted)}>
                      <span>{formatDateLabel(tx.transaction_date)}</span>
                      <span className={tokens.dashboardRecentTransactions.dotSeparator} />
                      <span className={cx("font-semibold", tokens.text.label)}>
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
                  <div className={`font-mono font-bold text-sm flex items-center gap-1 justify-end ${isExpense ? tokens.text.danger : tokens.text.success}`}>
                    <span>{isExpense ? "-" : "+"}</span>
                    <span className="whitespace-nowrap tabular-nums">{formatIDR(tx.amount)}</span>
                  </div>
                  <div className={cx("text-[clamp(0.5062rem,2.34vw,0.5625rem)] font-sans mt-0.5", tokens.text.faint)}>
                    {isExpense ? t("transaction.expense") : t("transaction.income")}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
      </Card>
    </>
  );
};
