import React from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { PiggyBank, ChevronRight, TrendingUp } from "lucide-react";
import { useLanguage } from "../contexts/LanguageContext";
import { useAuth } from "../contexts/AuthContext";
import { useCategories } from "../hooks/useCategories";
import { useBudgets } from "../hooks/useBudgets";
import { audioFeedback } from "../lib/audio";
import { Card } from "./ui/Card";
import { useThemeTokens } from "../hooks/useThemeTokens";

const MotionCard = motion.create(Card);

export const DashboardBudgetSummary: React.FC = () => {
  const { tokens, cx } = useThemeTokens();
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
    <MotionCard
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      elevation="lg"
      className="overflow-hidden relative"
    >
      <div className="flex items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <div className={cx(tokens.dashboardBudgetSummary.iconChipBg, tokens.text.accent)}>
            <PiggyBank size={18} />
          </div>
          <div>
            <h3 className={cx("font-sans font-bold text-sm", tokens.text.heading)}>
              {t("budget.page_title")}
            </h3>
            <p className={cx("text-[clamp(0.5625rem,2.6vw,0.625rem)] uppercase tracking-widest font-bold", tokens.text.muted)}>
              {t("budget.summary_subtitle", "Monthly Spending Limits")}
            </p>
          </div>
        </div>
        <button
          onClick={() => {
            audioFeedback.playClick();
            navigate("/budget");
          }}
          className={cx("p-2 rounded-xl transition-colors cursor-pointer", tokens.surface.sunken, tokens.text.accent, tokens.dashboardBudgetSummary.chevronBtnHover)}
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
                <span className={cx("font-semibold", tokens.text.secondary)}>{getLabel(b.category_key)}</span>
                <div className="flex items-center gap-1.5">
                  <span className={`font-bold tabular-nums ${isDanger ? 'text-red-400' : isWarning ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {Math.round(b.percent)}%
                  </span>
                  <span className={cx("text-[clamp(0.5625rem,2.6vw,0.625rem)]", tokens.text.faint)}>{formatIDR(b.spent)} / {formatIDR(b.monthly_limit)}</span>
                </div>
              </div>
              <div className={cx("h-1.5 w-full rounded-full overflow-hidden", tokens.surface.sunken)}>
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(100, b.percent)}%` }}
                  transition={{ duration: 0.8, ease: "circOut" }}
                  className={`h-full rounded-full ${
                    isDanger 
                      ? 'bg-red-500' 
                      : isWarning 
                        ? 'bg-amber-500' 
                        : tokens.admin.aiMonitorSuccessProgress
                  }`}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className={cx("mt-6 pt-5 border-t", tokens.border.accent)}>
        <button
          onClick={() => navigate("/budget")}
          className={cx("w-full flex items-center justify-center gap-2 text-[clamp(0.6188rem,2.86vw,0.6875rem)] font-bold transition-colors cursor-pointer", tokens.text.accent, "hover:opacity-80")}
        >
          <TrendingUp size={14} />
          {t("budget.view_all_budgets", "Manage All Budgets")}
        </button>
      </div>
    </MotionCard>
  );
};
