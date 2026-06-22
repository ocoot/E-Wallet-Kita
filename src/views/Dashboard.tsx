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
  RefreshCw,
  TrendingUp as TrendUpIcon,
  Activity
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { audioFeedback } from "../lib/audio";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  LineChart,
  Line
} from "recharts";

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

  // Interactive Recharts configuration states
  const [chartMode, setChartMode] = useState<"area" | "line">("area");
  const [chartType, setChartType] = useState<"daily" | "cumulative">("cumulative");

  // Locale labels for chart representation
  const labelIncome = t("dashboard.income");
  const labelExpense = t("dashboard.expense");
  const labelBalance = t("dashboard.balance");

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

  // Build trend chart data sequentially over days of the month
  const getChartData = () => {
    const today = new Date();
    // Gather all days of the current month up to either today or the max transaction day
    const maxDay = transactions.length > 0
      ? Math.max(...transactions.map(t => new Date(t.transaction_date).getDate()), today.getDate())
      : today.getDate();

    // Map by day
    const dailyMap: { [key: number]: { income: number; expense: number } } = {};
    for (let d = 1; d <= maxDay; d++) {
      dailyMap[d] = { income: 0, expense: 0 };
    }

    transactions.forEach(t => {
      const dt = new Date(t.transaction_date);
      const day = dt.getDate();
      if (dailyMap[day]) {
        if (t.type === "income") {
          dailyMap[day].income += t.amount;
        } else {
          dailyMap[day].expense += t.amount;
        }
      }
    });

    const data = [];
    let cumIncome = 0;
    let cumExpense = 0;

    const currentMonthNum = today.getMonth() + 1;
    const monthLabel = t(`months.m${currentMonthNum}`);

    for (let d = 1; d <= maxDay; d++) {
      const { income, expense } = dailyMap[d];
      cumIncome += income;
      cumExpense += expense;

      const incVal = chartType === "cumulative" ? cumIncome : income;
      const expVal = chartType === "cumulative" ? cumExpense : expense;
      const balVal = incVal - expVal;

      data.push({
        day: `${d} ${monthLabel.substring(0, 3)}`,
        rawDay: d,
        [labelIncome]: incVal,
        [labelExpense]: expVal,
        [labelBalance]: balVal,
      });
    }
    return data;
  };

  const chartData = getChartData();

  // Custom tooltips renderer to perfectly match Obsidian and Sakura modes
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="p-4 bg-slate-950/95 border border-slate-800 text-slate-100 rounded-2xl shadow-xl backdrop-blur-md light_sakura:bg-white light_sakura:border-rose-100 light_sakura:text-slate-800">
          <p className="font-sans font-bold text-xs mb-2 text-slate-400 light_sakura:text-slate-500">{label}</p>
          <div className="space-y-1.5 font-mono text-xs">
            {payload.map((p: any) => {
              const isInc = p.name === labelIncome;
              const isExp = p.name === labelExpense;
              let colorCls = "text-indigo-400 light_sakura:text-indigo-600";
              if (isInc) colorCls = "text-emerald-400 light_sakura:text-emerald-600";
              if (isExp) colorCls = "text-red-400 light_sakura:text-rose-600";

              return (
                <div key={p.name} className="flex items-center justify-between gap-6">
                  <span className="text-gray-400 light_sakura:text-slate-500">{p.name}:</span>
                  <span className={`font-bold ${colorCls}`}>{formatIDR(p.value)}</span>
                </div>
              );
            })}
          </div>
        </div>
      );
    }
    return null;
  };

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

      {/* 3. Graphic Chart Trends & Multi-view Panels */}
      <div className="p-6 md:p-8 rounded-3xl border bg-slate-900 border-slate-900 transition-colors duration-300 light_sakura:bg-white light_sakura:border-rose-100/10 shadow-lg space-y-6">
        
        {/* Chart Header & Tab Options */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800/50 pb-5 light_sakura:border-rose-100/30">
          <div>
            <h3 className="font-sans font-bold text-base text-white tracking-tight light_sakura:text-slate-800">
              {t("dashboard.chart_title")}
            </h3>
            <p className="font-sans text-xs text-gray-400 mt-1 light_sakura:text-slate-500">
              {chartType === "cumulative" 
                ? t("dashboard.chart_desc_cumulative")
                : t("dashboard.chart_desc_daily")}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Chart Type Selector: Cumulative vs Daily */}
            <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 light_sakura:bg-rose-50/50 light_sakura:border-rose-100">
              <button
                onClick={() => {
                  audioFeedback.playClick();
                  setChartType("cumulative");
                }}
                className={`px-3 py-1.5 text-[10px] font-bold rounded-lg transition-all cursor-pointer ${
                  chartType === "cumulative"
                    ? "bg-slate-900 text-indigo-400 shadow-sm light_sakura:bg-white light_sakura:text-rose-500"
                    : "text-gray-400 hover:text-slate-200 light_sakura:text-slate-500"
                }`}
              >
                {t("dashboard.chart_cumulative")}
              </button>
              <button
                onClick={() => {
                  audioFeedback.playClick();
                  setChartType("daily");
                }}
                className={`px-3 py-1.5 text-[10px] font-bold rounded-lg transition-all cursor-pointer ${
                  chartType === "daily"
                    ? "bg-slate-900 text-indigo-400 shadow-sm light_sakura:bg-white light_sakura:text-rose-500"
                    : "text-gray-400 hover:text-slate-200 light_sakura:text-slate-500"
                }`}
              >
                {t("dashboard.chart_daily")}
              </button>
            </div>

            {/* Chart Mode Selector: Area vs Line */}
            <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 light_sakura:bg-rose-50/50 light_sakura:border-rose-100">
              <button
                onClick={() => {
                  audioFeedback.playClick();
                  setChartMode("area");
                }}
                className={`px-3 py-1.5 text-[10px] font-bold rounded-lg transition-all cursor-pointer ${
                  chartMode === "area"
                    ? "bg-slate-900 text-indigo-300 shadow-sm light_sakura:bg-white light_sakura:text-rose-500"
                    : "text-gray-400 hover:text-slate-200 light_sakura:text-slate-500"
                }`}
              >
                {t("dashboard.chart_area")}
              </button>
              <button
                onClick={() => {
                  audioFeedback.playClick();
                  setChartMode("line");
                }}
                className={`px-3 py-1.5 text-[10px] font-bold rounded-lg transition-all cursor-pointer ${
                  chartMode === "line"
                    ? "bg-slate-900 text-indigo-300 shadow-sm light_sakura:bg-white light_sakura:text-rose-500"
                    : "text-gray-400 hover:text-slate-200 light_sakura:text-slate-500"
                }`}
              >
                {t("dashboard.chart_line")}
              </button>
            </div>
          </div>
        </div>

        {/* Dynamic Rendering of Recharts */}
        {transactions.length === 0 ? (
          <EmptyState message={t("dashboard.chart_no_data")} />
        ) : (
          <div className="w-full overflow-hidden">
            <ResponsiveContainer width="100%" height={320}>
              {chartMode === "area" ? (
                <AreaChart
                  data={chartData}
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0.01} />
                    </linearGradient>
                    <linearGradient id="colorExpense" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.22} />
                      <stop offset="95%" stopColor="#f43f5e" stopOpacity={0.01} />
                    </linearGradient>
                    <linearGradient id="colorBalance" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.22} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0.01} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" opacity={0.25} />
                  <XAxis 
                    dataKey="day" 
                    stroke="#71717a" 
                    fontSize={10} 
                    tickLine={false} 
                    axisLine={false} 
                    className="font-mono text-[9px]"
                  />
                  <YAxis 
                    stroke="#71717a" 
                    fontSize={10} 
                    tickLine={false} 
                    axisLine={false} 
                    tickFormatter={(val) => 
                      val >= 1000000 
                        ? `${(val / 1000000).toFixed(1)}jt` 
                        : val >= 1000 
                        ? `${(val / 1000).toFixed(0)}rb` 
                        : val
                    }
                    className="font-mono"
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend 
                    verticalAlign="top" 
                    height={36} 
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{ fontSize: '11px', fontFamily: 'Inter, sans-serif', paddingBottom: '10px' }}
                  />
                  <Area
                    type="monotone"
                    dataKey={labelIncome}
                    stroke="#10b981"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorIncome)"
                  />
                  <Area
                    type="monotone"
                    dataKey={labelExpense}
                    stroke="#f43f5e"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorExpense)"
                  />
                  <Area
                    type="monotone"
                    dataKey={labelBalance}
                    stroke="#6366f1"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#colorBalance)"
                  />
                </AreaChart>
              ) : (
                <LineChart
                  data={chartData}
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" opacity={0.25} />
                  <XAxis 
                    dataKey="day" 
                    stroke="#71717a" 
                    fontSize={10} 
                    tickLine={false} 
                    axisLine={false}
                    className="font-mono text-[9px]"
                  />
                  <YAxis 
                    stroke="#71717a" 
                    fontSize={10} 
                    tickLine={false} 
                    axisLine={false} 
                    tickFormatter={(val) => 
                      val >= 1000000 
                        ? `${(val / 1000000).toFixed(1)}jt` 
                        : val >= 1000 
                        ? `${(val / 1000).toFixed(0)}rb` 
                        : val
                    }
                    className="font-mono"
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend 
                    verticalAlign="top" 
                    height={36} 
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{ fontSize: '11px', fontFamily: 'Inter, sans-serif', paddingBottom: '10px' }}
                  />
                  <Line
                    type="monotone"
                    dataKey={labelIncome}
                    stroke="#10b981"
                    strokeWidth={2.5}
                    dot={{ r: 2 }}
                    activeDot={{ r: 4 }}
                  />
                  <Line
                    type="monotone"
                    dataKey={labelExpense}
                    stroke="#f43f5e"
                    strokeWidth={2.5}
                    dot={{ r: 2 }}
                    activeDot={{ r: 4 }}
                  />
                  <Line
                    type="monotone"
                    dataKey={labelBalance}
                    stroke="#6366f1"
                    strokeWidth={3}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              )}
            </ResponsiveContainer>
          </div>
        )}

        {/* Small Elegant Secondary Panel explaining Category analysis context */}
        {transactions.length > 0 && (
          <div className="flex flex-wrap gap-4 items-center justify-between text-[11px] text-gray-500 border-t border-slate-800/40 pt-4 progress-legend light_sakura:border-rose-100/30 light_sakura:text-slate-400">
            <span className="flex items-center gap-1.5 font-sans font-medium">
              <Activity size={12} className="text-zinc-400" />
              {t("dashboard.chart_instruction")}
            </span>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                {labelIncome}
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-rose-500" />
                {labelExpense}
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-indigo-500" />
                {labelBalance}
              </span>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
