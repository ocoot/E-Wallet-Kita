import React from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { PiggyBank, ChevronRight, TrendingUp } from "lucide-react";
import { useLanguage } from "../contexts/LanguageContext";
import { useAuth } from "../contexts/AuthContext";
import { useCategories } from "../hooks/useCategories";
import { useBudgets } from "../hooks/useBudgets";
import { audioFeedback } from "../lib/audio";

export const DashboardBudgetSummary: React.FC = () => {
  const { t, locale } = useLanguage();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { categories } = useCategories();
  const { budgets, loading } = useBudgets(user?.id);

  if (loading || budgets.length === 0) return null;

  const getLabel = (key: string) => {
    const cat = categories.find((c) => c.key === key);
    if (!cat) return key;
    return locale === "id" ? cat.label_id || cat.key : cat.label_en || cat.key;
  };

  const formatIDR = (num: number) => {
    return "Rp" + Math.round(num).toLocaleString("id-ID");
  };

  // Sort by highest percentage used to show most critical ones first
  const sortedBudgets = [...budgets].sort((a, b) => b.percent - a.percent).slice(0, 3);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-6 rounded-3xl bg-slate-900 border border-slate-800/50 light_sakura:bg-white light_sakura:border-rose-100/30 shadow-lg transition-all duration-300 overflow-hidden relative"
    >
      <div className="flex items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-400 light_sakura:bg-rose-500/10 light_sakura:text-rose-500 shrink-0">
            <PiggyBank size={18} />
          </div>
          <div>
            <h3 className="font-sans font-bold text-sm text-slate-100 light_sakura:text-slate-900">
              {t("budget.page_title")}
            </h3>
            <p className="text-[clamp(0.5625rem,2.6vw,0.625rem)] text-slate-500 light_sakura:text-slate-500 uppercase tracking-widest font-bold">
              {t("budget.summary_subtitle", "Monthly Spending Limits")}
            </p>
          </div>
        </div>
        <button
          onClick={() => {
            audioFeedback.playClick();
            navigate("/budget");
          }}
          className="p-2 rounded-xl bg-slate-800/50 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors light_sakura:bg-rose-50 light_sakura:text-rose-400 light_sakura:hover:text-rose-600 cursor-pointer"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      <div className="space-y-5">
        {sortedBudgets.map((b) => {
          const isDanger = b.status === "danger";
          const isWarning = b.status === "warning";
          
          return (
            <div key={b.id} className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-200 light_sakura:text-slate-700">{getLabel(b.category_key)}</span>
                <div className="flex items-center gap-1.5">
                  <span className={`font-bold tabular-nums ${isDanger ? 'text-red-400' : isWarning ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {Math.round(b.percent)}%
                  </span>
                  <span className="text-slate-500 text-[clamp(0.5625rem,2.6vw,0.625rem)]">{formatIDR(b.spent)} / {formatIDR(b.monthly_limit)}</span>
                </div>
              </div>
              <div className="h-1.5 w-full bg-slate-800/50 rounded-full overflow-hidden light_sakura:bg-rose-100/40">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(100, b.percent)}%` }}
                  transition={{ duration: 0.8, ease: "circOut" }}
                  className={`h-full rounded-full ${
                    isDanger 
                      ? 'bg-red-500' 
                      : isWarning 
                        ? 'bg-amber-500' 
                        : 'bg-indigo-500 light_sakura:bg-rose-500'
                  }`}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 pt-5 border-t border-slate-800/50 light_sakura:border-rose-100/30">
        <button
          onClick={() => navigate("/budget")}
          className="w-full flex items-center justify-center gap-2 text-[clamp(0.6188rem,2.86vw,0.6875rem)] font-bold text-indigo-400 hover:text-indigo-300 light_sakura:text-rose-500 light_sakura:hover:text-rose-600 transition-colors cursor-pointer"
        >
          <TrendingUp size={14} />
          {t("budget.view_all_budgets", "Manage All Budgets")}
        </button>
      </div>
    </motion.div>
  );
};
