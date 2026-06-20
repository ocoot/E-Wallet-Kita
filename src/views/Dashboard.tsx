import React, { useState, useEffect } from "react";
import { useLanguage } from "../contexts/LanguageContext";
import { dbService, Transaction } from "../lib/db";
import { UserSession } from "../lib/auth";
import { useToast } from "../contexts/ToastContext";
import { Modal } from "../components/Modal";
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
  Info
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface DashboardProps {
  currentUser: UserSession;
  transactionsUpdatedTrigger: number;
  onTransactionAdded: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  currentUser,
  transactionsUpdatedTrigger,
  onTransactionAdded
}) => {
  const { t } = useLanguage();
  const { showToast } = useToast();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [summary, setSummary] = useState({ income: 0, expense: 0, balance: 0 });
  const [sparkPoints, setSparkPoints] = useState<number[]>([]);

  // AI Box state
  const [aiText, setAiText] = useState("");
  const [isAiLoading, setIsAiLoading] = useState(false);

  // Parsing Result review card
  const [parsedResult, setParsedResult] = useState<{
    type: "income" | "expense";
    category_key: string;
    amount: number;
    original_text: string;
  } | null>(null);

  // Confirmation Modals State
  const [isConfirmSaveOpen, setIsConfirmSaveOpen] = useState(false);
  const [isGlobalLoading, setIsGlobalLoading] = useState(false);

  // Categories lookup helpers
  const categoryKeys = ["salary", "bonus", "food_drink", "monthly_groceries", "vegetables", "bills", "other"];

  // Load current month metrics
  useEffect(() => {
    const today = new Date();
    const currentMonthPrefix = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`; // e.g., "2026-06"
    
    const data = dbService.getTransactions(currentUser.id, currentMonthPrefix);
    setTransactions(data);

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

  }, [currentUser.id, transactionsUpdatedTrigger]);

  const handleAiParse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiText.trim()) return;

    setIsAiLoading(true);
    setParsedResult(null);
    showToast(t("toast.loading_parse"), "info");

    try {
      const response = await fetch("/api/parse-transaction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: aiText.trim() })
      });
      
      const parsed = await response.json();
      
      if (parsed.error) {
        throw new Error(parsed.error);
      }

      setParsedResult({
        type: parsed.type || "expense",
        category_key: parsed.category_key || "other",
        amount: parsed.amount || 0,
        original_text: parsed.original_text || aiText
      });
      
      showToast(t("toast.parse_success"), "success");
      setAiText(""); // Clear box

    } catch (err) {
      console.error(err);
      showToast(t("toast.error_general"), "error");
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleConfirmSaveTransaction = () => {
    if (!parsedResult) return;
    if (parsedResult.amount <= 0 || isNaN(parsedResult.amount)) {
      showToast(t("toast.invalid_amount"), "error");
      return;
    }
    setIsConfirmSaveOpen(true);
  };

  const handleExecuteSave = async () => {
    if (!parsedResult) return;
    setIsConfirmSaveOpen(false);
    setIsGlobalLoading(true);

    // Simulate database write
    setTimeout(() => {
      dbService.saveTransaction(
        currentUser.id,
        parsedResult.type,
        parsedResult.category_key,
        parsedResult.amount,
        parsedResult.original_text,
        "ai_web",
        new Date().toISOString().split("T")[0] // Today's date YYYY-MM-DD
      );

      showToast(t("toast.success_save"), "success");
      setParsedResult(null); // Clear preview card
      onTransactionAdded(); // Trigger re-load
      setIsGlobalLoading(false);
    }, 600);
  };

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
        </div>
        {currentUser.is_guest && (
          <div className="self-start md:self-center bg-amber-500/10 border border-amber-500/20 rounded-2xl px-4 py-2 font-sans text-xs font-semibold text-amber-500 flex items-center gap-2">
            <Info size={14} />
            <span>Mode Tamu</span>
          </div>
        )}
      </div>

      {/* 2. Scorecard Summaries (3 Column Bento format) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Income Card */}
        <div className="p-6 rounded-3xl border bg-slate-900 border-slate-900 relative overflow-hidden transition-colors duration-300 light_sakura:bg-white light_sakura:border-rose-100/10 text-white light_sakura:text-slate-800 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <span className="font-sans text-xs font-semibold uppercase tracking-wider text-gray-400 light_sakura:text-slate-500">
              {t("dashboard.income")}
            </span>
            <div className="p-2 rounded-xl bg-emerald-500/15 text-emerald-400 light_sakura:bg-emerald-50 light_sakura:text-emerald-600">
              <TrendingUp size={20} />
            </div>
          </div>
          <p className="font-mono text-2xl font-bold tracking-tight text-emerald-400 light_sakura:text-emerald-600">
            {formatIDR(summary.income)}
          </p>
          <p className="font-sans text-[11px] text-gray-400 mt-1 light_sakura:text-slate-500">
            Bulan Ini
          </p>
        </div>

        {/* Expense Card */}
        <div className="p-6 rounded-3xl border bg-slate-900 border-slate-900 relative overflow-hidden transition-colors duration-300 light_sakura:bg-white light_sakura:border-rose-100/10 text-white light_sakura:text-slate-800 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <span className="font-sans text-xs font-semibold uppercase tracking-wider text-gray-400 light_sakura:text-slate-500">
              {t("dashboard.expense")}
            </span>
            <div className="p-2 rounded-xl bg-red-500/15 text-red-400 light_sakura:bg-red-50 light_sakura:text-red-600">
              <TrendingDown size={20} />
            </div>
          </div>
          <p className="font-mono text-2xl font-bold tracking-tight text-red-500 light_sakura:text-rose-600">
            {formatIDR(summary.expense)}
          </p>
          <p className="font-sans text-[11px] text-gray-400 mt-1 light_sakura:text-slate-500">
            Bulan Ini
          </p>
        </div>

        {/* Net Balance Card */}
        <div className="p-6 rounded-3xl border bg-slate-900 border-slate-900 relative overflow-hidden transition-colors duration-300 light_sakura:bg-white light_sakura:border-rose-100/10 text-white light_sakura:text-slate-800 shadow-xs group">
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
            Sisa tabungan bersih Anda
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
        </div>
      </div>

      {/* 3. Graphic Chart Trends (Custom high contrast visual SVG bar columns) */}
      <div className="p-6 rounded-3xl border bg-slate-900 border-slate-900 transition-colors duration-300 light_sakura:bg-white light_sakura:border-rose-100/10 shadow-xs">
        <h3 className="font-sans font-semibold text-sm text-white mb-6 uppercase tracking-wider text-gray-400 light_sakura:text-slate-800">
          {t("dashboard.chart_title")}
        </h3>

        {categoryChartData.length === 0 ? (
          <div className="py-12 px-4 flex flex-col items-center justify-center text-center">
            <div className="p-3 bg-slate-950/50 rounded-2xl text-indigo-400 mb-3 light_sakura:bg-rose-50 light_sakura:text-rose-500 border border-slate-9ml0/10 light_sakura:border-rose-100">
              <TrendingUp size={24} />
            </div>
            <p className="font-sans text-xs text-gray-400 max-w-sm leading-relaxed light_sakura:text-slate-600">
              {t("dashboard.chart_no_data")}
            </p>
          </div>
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

      {/* 4. AI Voice-Style Input Section (Gemini Quick-Input box) */}
      <div className="p-6 rounded-3xl border bg-slate-900 border-slate-900 transition-colors duration-300 light_sakura:bg-white light_sakura:border-rose-100/10 shadow-xs relative">
        <div className="flex items-center gap-2.5 mb-2">
          <div className="p-1.5 rounded-lg bg-indigo-600/15 text-indigo-400 light_sakura:bg-rose-500/10 light_sakura:text-rose-500">
            <Sparkles size={16} />
          </div>
          <h3 className="font-sans font-bold text-sm text-white light_sakura:text-slate-800">
            {t("dashboard.ai_box_title")}
          </h3>
        </div>
        <p className="font-sans text-xs text-gray-400 mb-4 leading-relaxed light_sakura:text-slate-500">
          Metode teras untuk input cepat. Cukup ketik teks transaksi bebas Anda apa adanya di bawah ini:
        </p>

        <form onSubmit={handleAiParse} className="relative flex items-center">
          <input
            type="text"
            required
            disabled={isAiLoading || isGlobalLoading}
            placeholder={t("dashboard.ai_box_placeholder")}
            value={aiText}
            onChange={(e) => setAiText(e.target.value)}
            className="w-full pl-5 pr-14 py-4 bg-slate-950 border border-slate-800 text-white rounded-2xl font-sans text-xs outline-none focus:border-indigo-500 transition-colors placeholder:text-gray-500 light_sakura:bg-slate-50 light_sakura:border-rose-100 light_sakura:text-slate-800"
          />
          <button
            type="submit"
            disabled={isAiLoading || isGlobalLoading || !aiText.trim()}
            className="absolute right-3.5 p-2 bg-indigo-600 hover:bg-indigo-500 select-none text-white rounded-xl transition-all hover:scale-105 active:scale-95 disabled:opacity-30 disabled:pointer-events-none cursor-pointer light_sakura:bg-rose-500 light_sakura:hover:bg-rose-400"
          >
            {isAiLoading ? (
              <span className="block w-4 h-4 border border-t-transparent border-white rounded-full animate-spin" />
            ) : (
              <Send size={15} />
            )}
          </button>
        </form>

        {/* Custom loading skeleton animation */}
        {isAiLoading && (
          <div className="mt-4 p-4 rounded-2xl border border-dashed border-slate-800 space-y-2 animate-pulse light_sakura:border-rose-100">
            <div className="h-4 bg-slate-800 rounded-md w-1/3 light_sakura:bg-rose-50/50" />
            <div className="h-3 bg-slate-800 rounded-md w-1/2 light_sakura:bg-rose-50/50" />
          </div>
        )}

        {/* Parsed Result Edit & Confirmation Card */}
        <AnimatePresence>
          {parsedResult && (
            <motion.div
              initial={{ height: 0, opacity: 0, y: 10 }}
              animate={{ height: "auto", opacity: 1, y: 0 }}
              exit={{ height: 0, opacity: 0, y: 10 }}
              className="mt-6 p-5 rounded-2xl border border-indigo-500/20 bg-indigo-500/5 light_sakura:border-rose-200 light_sakura:bg-rose-50/20 overflow-hidden"
            >
              <div className="flex items-center justify-between mb-4 border-b border-indigo-500/10 pb-3 light_sakura:border-rose-100">
                <h4 className="font-sans font-bold text-xs text-indigo-400 flex items-center gap-2 light_sakura:text-rose-600">
                  <Check size={16} />
                  <span>{t("transaction.preview_title")}</span>
                </h4>
                <button
                  onClick={() => setParsedResult(null)}
                  className="text-gray-400 hover:text-white hover:scale-110 active:scale-90 transition-transform cursor-pointer light_sakura:text-slate-600 light_sakura:hover:text-slate-800"
                >
                  <X size={15} />
                </button>
              </div>

              <p className="font-sans text-[11px] text-gray-400 mb-4 light_sakura:text-slate-500">
                {t("transaction.preview_desc")}
              </p>

              {/* Dynamic editing fields block */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                {/* 1. Transaction Type selection */}
                <div className="space-y-1">
                  <label className="font-sans text-[10px] font-bold text-gray-400 light_sakura:text-slate-600 uppercase">
                    {t("transaction.label_type")}
                  </label>
                  <select
                    value={parsedResult.type}
                    onChange={(e) => setParsedResult({ ...parsedResult, type: e.target.value as "income" | "expense" })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 font-sans text-xs text-white outline-none focus:border-indigo-500 light_sakura:bg-white light_sakura:border-rose-100 light_sakura:text-slate-800"
                  >
                    <option value="expense">{t("transaction.expense")}</option>
                    <option value="income">{t("transaction.income")}</option>
                  </select>
                </div>

                {/* 2. Category selection */}
                <div className="space-y-1">
                  <label className="font-sans text-[10px] font-bold text-gray-400 light_sakura:text-slate-600 uppercase">
                    {t("transaction.label_category")}
                  </label>
                  <select
                    value={parsedResult.category_key}
                    onChange={(e) => setParsedResult({ ...parsedResult, category_key: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 font-sans text-xs text-white outline-none focus:border-indigo-500 light_sakura:bg-white light_sakura:border-rose-100 light_sakura:text-slate-800"
                  >
                    {categoryKeys.map((key) => (
                      <option key={key} value={key}>
                        {t(`categories.${key}`)}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 3. Number amount input value */}
                <div className="space-y-1">
                  <label className="font-sans text-[10px] font-bold text-gray-400 light_sakura:text-slate-600 uppercase">
                    {t("transaction.label_amount")}
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={parsedResult.amount}
                    onChange={(e) => setParsedResult({ ...parsedResult, amount: parseInt(e.target.value) || 0 })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 font-sans text-xs text-white outline-none focus:border-indigo-500 light_sakura:bg-white light_sakura:border-rose-100 light_sakura:text-slate-800"
                  />
                </div>
              </div>

              {/* original original text display */}
              <div className="p-3 bg-slate-950/40 border border-slate-800/10 rounded-xl text-[11px] text-gray-400 mb-4 light_sakura:bg-rose-50/50 light_sakura:border-rose-100/60 light_sakura:text-slate-600 font-mono italic">
                <span>"{parsedResult.original_text}"</span>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setParsedResult(null)}
                  className="cursor-pointer px-4.5 py-2 hover:bg-slate-950 border border-transparent rounded-xl font-sans text-xs font-semibold text-gray-400 light_sakura:hover:bg-rose-100 light_sakura:text-slate-500"
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="button"
                  onClick={handleConfirmSaveTransaction}
                  className="cursor-pointer px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white rounded-xl font-sans text-xs font-bold transition-all shadow-md flex items-center gap-1.5 light_sakura:bg-rose-500 light_sakura:hover:bg-rose-400"
                >
                  <Plus size={14} />
                  <span>{t("transaction.btn_confirm_save")}</span>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>

      {/* Confirmation Modal layout wrapper */}
      {parsedResult && (
        <Modal
          isOpen={isConfirmSaveOpen}
          title={t("confirm.save_transaction_title")}
          description={t("confirm.save_transaction_desc", {
            amount: formatIDR(parsedResult.amount),
            category: t(`categories.${parsedResult.category_key}`)
          })}
          type="info"
          confirmLabel={t("common.confirm")}
          cancelLabel={t("common.cancel")}
          onConfirm={handleExecuteSave}
          onCancel={() => setIsConfirmSaveOpen(false)}
        />
      )}

      {/* Global action loading mask layout */}
      {isGlobalLoading && (
        <div className="fixed inset-0 bg-black/55 backdrop-blur-xs z-55 flex items-center justify-center">
          <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col items-center gap-3 text-white">
            <span className="w-8 h-8 border-3 border-t-transparent border-indigo-500 rounded-full animate-spin" />
            <p className="font-sans text-xs tracking-wide">{t("common.loading")}</p>
          </div>
        </div>
      )}

    </div>
  );
};
