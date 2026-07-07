import React from "react";
import logoUrl from "../assets/images/user_logo_transparent.png";
import { useLanguage } from "../contexts/LanguageContext";
import { TrendingUp, TrendingDown, DollarSign } from "lucide-react";
import { motion } from "motion/react";
import { audioFeedback } from "../lib/audio";
import { InfoTooltip } from "./InfoTooltip";

interface DashboardStatsProps {
  summary: { income: number; expense: number; balance: number };
  sparkPoints: number[];
  formatIDR: (num: number) => string;
}

export const DashboardStats: React.FC<DashboardStatsProps> = ({
  summary,
  sparkPoints,
  formatIDR,
}) => {
  const { t } = useLanguage();

  return (
    <div id="dashboard-scorecards" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {/* Income Card */}
      <motion.div 
        id="stats-income-card"
        onClick={() => audioFeedback.playClick()}
        whileHover={{ y: -5, scale: 1.02, boxShadow: "0 20px 25px -5px rgba(16, 185, 129, 0.15), 0 8px 10px -6px rgba(16, 185, 129, 0.15)" }}
        transition={{ type: "spring", stiffness: 350, damping: 18 }}
        className="p-6 rounded-3xl border bg-slate-900 border-slate-900 relative overflow-hidden transition-colors duration-300 light_sakura:bg-white light_sakura:border-rose-100/10 text-white light_sakura:text-slate-800 shadow-xs cursor-pointer group"
      >
        <div className="flex items-center justify-between mb-4">
          <span className="font-sans text-xs font-semibold uppercase tracking-wider text-slate-400 light_sakura:text-slate-500">
            {t("dashboard.income")}
          </span>
          <div className="p-2 rounded-xl bg-emerald-500/15 text-emerald-400 light_sakura:bg-emerald-50 light_sakura:text-emerald-600 transition-transform group-hover:scale-110">
            <TrendingUp size={20} />
          </div>
        </div>
        <p className="font-mono text-2xl font-bold tracking-tight text-emerald-400 light_sakura:text-emerald-600">
          {formatIDR(summary.income)}
        </p>
        <p className="font-sans text-[clamp(0.6188rem,2.86vw,0.6875rem)] text-slate-400 mt-1 light_sakura:text-slate-500">
          {t("dashboard.this_month")}
        </p>
      </motion.div>

      {/* Expense Card */}
      <motion.div 
        id="stats-expense-card"
        onClick={() => audioFeedback.playClick()}
        whileHover={{ y: -5, scale: 1.02, boxShadow: "0 20px 25px -5px rgba(239, 68, 68, 0.15), 0 8px 10px -6px rgba(239, 68, 68, 0.15)" }}
        transition={{ type: "spring", stiffness: 350, damping: 18 }}
        className="p-6 rounded-3xl border bg-slate-900 border-slate-900 relative overflow-hidden transition-colors duration-300 light_sakura:bg-white light_sakura:border-rose-100/10 text-white light_sakura:text-slate-800 shadow-xs cursor-pointer group"
      >
        <div className="flex items-center justify-between mb-4">
          <span className="font-sans text-xs font-semibold uppercase tracking-wider text-slate-400 light_sakura:text-slate-500">
            {t("dashboard.expense")}
          </span>
          <div className="p-2 rounded-xl bg-red-500/15 text-red-400 light_sakura:bg-red-50 light_sakura:text-red-600 transition-transform group-hover:scale-110">
            <TrendingDown size={20} />
          </div>
        </div>
        <p className="font-mono text-2xl font-bold tracking-tight text-red-500 light_sakura:text-rose-600">
          {formatIDR(summary.expense)}
        </p>
        <p className="font-sans text-[clamp(0.6188rem,2.86vw,0.6875rem)] text-slate-400 mt-1 light_sakura:text-slate-500">
          {t("dashboard.this_month")}
        </p>
      </motion.div>

      {/* Net Balance Card */}
      <motion.div 
        id="stats-balance-card"
        onClick={() => audioFeedback.playClick()}
        whileHover={{ y: -5, scale: 1.02, boxShadow: "0 20px 25px -5px rgba(20, 184, 166, 0.15), 0 8px 10px -6px rgba(20, 184, 166, 0.15)" }}
        transition={{ type: "spring", stiffness: 350, damping: 18 }}
        className="p-6 rounded-3xl border bg-slate-900 border-slate-900 relative overflow-hidden transition-colors duration-300 light_sakura:bg-white light_sakura:border-rose-100/10 text-white light_sakura:text-slate-800 shadow-xs group cursor-pointer"
      >
        <div className="flex items-center justify-between mb-4 relative z-10">
          <span className="font-sans text-xs font-semibold uppercase tracking-wider text-slate-400 light_sakura:text-slate-500 flex items-center gap-1.5">
            {t("dashboard.balance")}
            <InfoTooltip text={t("dashboard.net_balance_tooltip")} align="left" />
          </span>
          <div className="shrink-0 transition-transform group-hover:scale-110 duration-300">
            <img 
              src={logoUrl} 
              alt="EWK Icon" 
              className="w-8 h-8 object-contain"
            />
          </div>
        </div>
        <p className={`font-mono text-2xl font-bold tracking-tight relative z-10 ${summary.balance >= 0 ? "text-emerald-400 light_sakura:text-emerald-600" : "text-red-500"}`}>
          {formatIDR(summary.balance)}
        </p>
        <p className="font-sans text-[clamp(0.6188rem,2.86vw,0.6875rem)] text-slate-400 mt-1 light_sakura:text-slate-500 relative z-10">
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
  );
};
