import React, { useState, useEffect } from "react";
import { useLanguage } from "../contexts/LanguageContext";
import { dbService } from "../lib/db";
import { supabase } from "../lib/supabase";
import { UserSession, Transaction } from "../types";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { Modal } from "../components/Modal";
import { EmptyState } from "../components/EmptyState";
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Send, 
  Sparkles, 
  Check, 
  X, 
  Plus, 
  ArrowRight,
  Info,
  RefreshCw
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { audioFeedback } from "../lib/audio";

interface DashboardProps {
  transactionsUpdatedTrigger: number;
  onTransactionAdded: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  transactionsUpdatedTrigger,
  onTransactionAdded
}) => {
  const { user } = useAuth();
  const currentUser: UserSession = {
    id: user?.id || "",
    display_name: user?.user_metadata?.full_name || "User",
    is_guest: user?.is_anonymous || false,
    preferred_language: "id",
    preferred_theme: "dark_obsidian"
  };
  const { t } = useLanguage();
  const { showToast } = useToast();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [summary, setSummary] = useState({ income: 0, expense: 0, balance: 0 });
  const [sparkPoints, setSparkPoints] = useState<number[]>([]);
  const [telegramStatus, setTelegramStatus] = useState<{ linked: boolean, lastSync: string | null }>({ linked: false, lastSync: null });

  // Categories lookup helpers
  const categoryKeys = ["salary", "bonus", "food_drink", "monthly_groceries", "vegetables", "bills", "other"];

  // Load current month metrics
  useEffect(() => {
    const loadData = async () => {
      const today = new Date();
      const currentMonthPrefix = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`; // e.g., "2026-06"
      
      try {
        const [data, userRes] = await Promise.all([
          dbService.getTransactions(currentUser.id, currentMonthPrefix),
          supabase.from("users").select("telegram_chat_id").eq("id", currentUser.id).single()
        ]);
        
        setTransactions(data);
        
        if (userRes.data?.telegram_chat_id) {
          const latestTelegramTx = data
            .filter(t => t.source === 'telegram')
            .sort((a,b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
          
          setTelegramStatus({
            linked: true,
            lastSync: latestTelegramTx ? new Date(latestTelegramTx.created_at).toLocaleTimeString() : null
          });
        }

        // Compute sums
        let inc = 0;
        let exp = 0;
        data.forEach(t => {
          if (t.type === "income") {
            inc += t.amount;
          } else {
            exp += t.amount;
          }
        });

        setSummary({
          income: inc,
          expense: exp,
          balance: inc - exp
        });

        // Compute cumulative balance trend (sparkline)
        const sortedData = [...data].sort((a, b) => a.transaction_date.localeCompare(b.transaction_date));
        let runBal = 0;
        const historyPoints = sortedData.map(t => {
          runBal += (t.type === "income" ? t.amount : -t.amount);
          return runBal;
        });
        setSparkPoints(historyPoints);
      } catch (err) {
        console.error('Dashboard load error:', err);
      }
    };

    if (currentUser.id) {
      loadData();
    }
  }, [currentUser.id, transactionsUpdatedTrigger]);

  // Helper currency formatter
  const formatIDR = (num: number) => {
    return "Rp" + Math.round(num).toLocaleString("id-ID");
  };

  // Chart data calculations by Categories
  const categoryChartData = categoryKeys.map(key => {
    const total = transactions
      .filter(t => t.category === key)
      .reduce((acc, curr) => acc + curr.amount, 0);
    return { key, total };
  }).filter(c => c.total > 0);

  const maxTotal = categoryChartData.length > 0 ? Math.max(...categoryChartData.map(c => c.total)) : 100000;

  return (
    <div className="space-y-6">
      {/* 1. Welcome Message Banner */}
      <div className="p-6 rounded-3xl border bg-slate-900 border-slate-900 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-colors duration-300 light_sakura:bg-white light_sakura:border-rose-100/10 shadow-sm">
        <div>
          <h2 className="font-sans font-bold text-2xl tracking-tight text-white light_sakura:text-slate-900">
            {t("dashboard.welcome", { name: currentUser.display_name })}
          </h2>
          <p className="font-sans text-sm text-gray-400 mt-1 light_sakura:text-slate-500">
            {t("app.tagline_sub")}
          </p>
          {telegramStatus.linked && (
            <div className="flex items-center gap-1.5 mt-2 text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-md w-fit">
              <Send size={10} />
              <span>
                {t("settings.telegram_sync_status")}
                {telegramStatus.lastSync ? ` (${t("settings.telegram_last_sync", { time: telegramStatus.lastSync })})` : ""}
              </span>
            </div>
          )}
        </div>
        {currentUser.is_guest && (
          <div className="self-start md:self-center bg-amber-500/10 border border-amber-500/20 rounded-2xl px-4 py-2 font-sans text-xs font-semibold text-amber-500 flex items-center gap-2">
            <Info size={14} />
            <span>{t("auth.guest_badge")}</span>
          </div>
        )}
      </div>

      {/* 2. Scorecard Summaries (3 Column Bento format) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Income Card */}
        <motion.div 
          onClick={() => audioFeedback.playClick()}
          whileHover={{ y: -5, scale: 1.02, boxShadow: "0 20px 25px -5px rgba(16, 185, 129, 0.15), 0 8px 10px -6px rgba(16, 185, 129, 0.15)" }}
          transition={{ type: "spring", stiffness: 350, damping: 18 }}
          className="p-6 rounded-3xl border bg-slate-900 border-slate-900 relative overflow-hidden transition-colors duration-300 light_sakura:bg-white light_sakura:border-rose-100/10 text-white light_sakura:text-slate-800 shadow-xs cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-4">
            <span className="font-sans text-xs font-semibold uppercase tracking-wider text-gray-400 light_sakura:text-slate-500">
              {t("dashboard.income")}
            </span>
            <div className="p-2 rounded-xl bg-emerald-500/15 text-emerald-400 light_sakura:bg-emerald-50 light_sakura:text-emerald-600 transition-transform group-hover:scale-110">
              <TrendingUp size={20} />
            </div>
          </div>
          <p className="font-mono text-2xl font-bold tracking-tight text-emerald-400 light_sakura:text-emerald-600">
            {formatIDR(summary.income)}
          </p>
          <p className="font-sans text-[11px] text-gray-400 mt-1 light_sakura:text-slate-500">
            {t("dashboard.this_month")}
          </p>
        </motion.div>

        {/* Expense Card */}
        <motion.div 
          onClick={() => audioFeedback.playClick()}
          whileHover={{ y: -5, scale: 1.02, boxShadow: "0 20px 25px -5px rgba(239, 68, 68, 0.15), 0 8px 10px -6px rgba(239, 68, 68, 0.15)" }}
          transition={{ type: "spring", stiffness: 350, damping: 18 }}
          className="p-6 rounded-3xl border bg-slate-900 border-slate-900 relative overflow-hidden transition-colors duration-300 light_sakura:bg-white light_sakura:border-rose-100/10 text-white light_sakura:text-slate-800 shadow-xs cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-4">
            <span className="font-sans text-xs font-semibold uppercase tracking-wider text-gray-400 light_sakura:text-slate-500">
              {t("dashboard.expense")}
            </span>
            <div className="p-2 rounded-xl bg-red-500/15 text-red-400 light_sakura:bg-red-50 light_sakura:text-red-600 transition-transform group-hover:scale-110">
              <TrendingDown size={20} />
            </div>
          </div>
          <p className="font-mono text-2xl font-bold tracking-tight text-red-500 light_sakura:text-rose-600">
            {formatIDR(summary.expense)}
          </p>
          <p className="font-sans text-[11px] text-gray-400 mt-1 light_sakura:text-slate-500">
            {t("dashboard.this_month")}
          </p>
        </motion.div>

        {/* Net Balance Card */}
        <motion.div 
          onClick={() => audioFeedback.playClick()}
          whileHover={{ y: -5, scale: 1.02, boxShadow: "0 20px 25px -5px rgba(20, 184, 166, 0.15), 0 8px 10px -6px rgba(20, 184, 166, 0.15)" }}
          transition={{ type: "spring", stiffness: 350, damping: 18 }}
          className="p-6 rounded-3xl border bg-slate-900 border-slate-900 relative overflow-hidden transition-colors duration-300 light_sakura:bg-white light_sakura:border-rose-100/10 text-white light_sakura:text-slate-800 shadow-xs group cursor-pointer"
        >
          <div className="flex items-center justify-between mb-4 relative z-10">
            <span className="font-sans text-xs font-semibold uppercase tracking-wider text-gray-400 light_sakura:text-slate-500">
              {t("dashboard.balance")}
            </span>
            <div className={`p-2 rounded-xl transition-transform group-hover:scale-110 duration-300 ${summary.balance >= 0 ? "bg-teal-500/15 text-teal-400 light_sakura:bg-rose-50 light_sakura:text-rose-500" : "bg-red-500/15 text-red-400"}`}>
              <DollarSign size={20} />
            </div>
          </div>
          <p className={`font-mono text-2xl font-bold tracking-tight relative z-10 ${summary.balance >= 0 ? "text-teal-400 light_sakura:text-rose-500" : "text-red-500"}`}>
            {formatIDR(summary.balance)}
          </p>
          <p className="font-sans text-[11px] text-gray-400 mt-1 light_sakura:text-slate-500 relative z-10">
            {t("dashboard.net_balance_desc")}
          </p>

          {/* Sparkline Vector Trend Chart */}
          {sparkPoints.length >= 2 && (
            <div className="absolute right-0 bottom-0 w-36 h-16 opacity-35 pointer-events-none group-hover:opacity-60 transition-opacity duration-300">
              <svg viewBox="0 0 120 40" className="w-full h-full">
                <defs>
                  <linearGradient id="sparkGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={summary.balance >= 0 ? "#2dd4bf" : "#ef4444"} stopOpacity="0.25" />
                    <stop offset="100%" stopColor={summary.balance >= 0 ? "#2dd4bf" : "#ef4444"} stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path
                  d={`M ${sparkPoints.map((val, idx) => {
                    const x = (idx / (sparkPoints.length - 1)) * 120;
                    const minPt = Math.min(...sparkPoints);
                    const maxPt = Math.max(...sparkPoints);
                    const ptDiff = (maxPt - minPt) || 1;
                    const y = 35 - ((val - minPt) / ptDiff) * 30;
                    return `${x} ${y}`;
                  }).join(" L ")}`}
                  fill="none"
                  stroke={summary.balance >= 0 ? "#14b8a6" : "#f43f5e"}
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <motion.circle
                  cx={120}
                  cy={35 - ((sparkPoints[sparkPoints.length - 1] - Math.min(...sparkPoints)) / ((Math.max(...sparkPoints) - Math.min(...sparkPoints)) || 1)) * 30}
                  r="3.5"
                  fill={summary.balance >= 0 ? "#14b8a6" : "#f43f5e"}
                  className="stroke-white dark:stroke-slate-900"
                  strokeWidth="1.5"
                  initial={{ scale: 0 }}
                  animate={{ scale: [1, 1.4, 1], opacity: [1, 0.4, 1] }}
                  transition={{ repeat: Infinity, duration: 2 }}
                />
                <path
                  d={`M 0 40 L ${sparkPoints.map((val, idx) => {
                    const x = (idx / (sparkPoints.length - 1)) * 120;
                    const minPt = Math.min(...sparkPoints);
                    const maxPt = Math.max(...sparkPoints);
                    const ptDiff = (maxPt - minPt) || 1;
                    const y = 35 - ((val - minPt) / ptDiff) * 30;
                    return `${x} ${y}`;
                  }).join(" L ")} L 120 40 Z`}
                  fill="url(#sparkGradient)"
                />
              </svg>
            </div>
          )}
        </motion.div>
      </div>

      {/* 3. Graphic Chart Trends (Custom high contrast visual SVG bar columns) */}
      <div className="p-6 rounded-3xl border bg-slate-900 border-slate-900 transition-colors duration-300 light_sakura:bg-white light_sakura:border-rose-100/10 shadow-xs">
        <h3 className="font-sans font-semibold text-sm text-white mb-6 uppercase tracking-wider text-gray-400 light_sakura:text-slate-800">
          {t("dashboard.chart_title")}
        </h3>

        {categoryChartData.length === 0 ? (
          <EmptyState message={t("dashboard.chart_no_data")} />
        ) : (
          <div className="space-y-4">
            {categoryChartData.map(c => {
              const textLabel = t(`categories.${c.key}`);
              const percentage = Math.max(8, (c.total / maxTotal) * 100);
              const isIncomeCategory = ["salary", "bonus"].includes(c.key);
              
              return (
                <div key={c.key} className="space-y-1">
                  <div className="flex items-center justify-between font-sans text-xs">
                    <span className="font-semibold text-slate-300 light_sakura:text-slate-700">
                      {textLabel}
                    </span>
                    <span className="font-mono text-gray-400 font-semibold light_sakura:text-slate-500">
                      {formatIDR(c.total)}
                    </span>
                  </div>

                  {/* Horizontal bar element */}
                  <div className="w-full h-3 bg-slate-950 rounded-full overflow-hidden light_sakura:bg-rose-50">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${percentage}%` }}
                      transition={{ duration: 0.6 }}
                      className={`h-full rounded-full 
                        ${isIncomeCategory 
                          ? "bg-gradient-to-r from-emerald-500 to-teal-400" 
                          : "bg-gradient-to-r from-indigo-500 to-purple-500 light_sakura:from-rose-400 light_sakura:to-rose-300"
                        }`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
};
