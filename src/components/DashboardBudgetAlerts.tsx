import React from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { useLanguage } from "../contexts/LanguageContext";
import { useAuth } from "../contexts/AuthContext";
import { useCategories } from "../hooks/useCategories";
import { useBudgets } from "../hooks/useBudgets";
import { audioFeedback } from "../lib/audio";

/**
 * Tampil hanya kalau ada kategori yang statusnya warning/danger bulan ini.
 * Sumber data sama dengan halaman Budget (useBudgets), jadi tidak ada
 * logic tandingan -- kartu ini hanya mem-filter & menampilkan ringkasannya.
 */
export const DashboardBudgetAlerts: React.FC = () => {
  const { t, locale } = useLanguage();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { categories } = useCategories();
  const { budgets, loading } = useBudgets(user?.id);

  const alerts = budgets.filter((b) => b.status !== "safe");

  if (loading || alerts.length === 0) return null;

  const getLabel = (key: string) => {
    const cat = categories.find((c) => c.key === key);
    if (!cat) return key;
    return locale === "id" ? cat.label_id || cat.key : cat.label_en || cat.key;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-6 rounded-3xl bg-slate-900 border border-slate-900 light_sakura:bg-white light_sakura:border-rose-100/10 shadow-lg transition-colors duration-300"
    >
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-amber-500/15 flex items-center justify-center text-amber-400 shrink-0">
            <AlertTriangle size={16} />
          </div>
          <h3 className="font-sans font-bold text-sm text-slate-100 light_sakura:text-slate-800">
            {t("budget.dashboard_alert_title")}
          </h3>
        </div>
        <button
          onClick={() => {
            audioFeedback.playClick();
            navigate("/budget");
          }}
          className="flex items-center gap-1 text-[clamp(0.6188rem,2.86vw,0.6875rem)] font-semibold text-amber-400 hover:text-amber-300 light_sakura:text-amber-600 cursor-pointer"
        >
          {t("budget.dashboard_alert_cta")}
          <ChevronRight size={12} />
        </button>
      </div>

      <ul className="space-y-1.5">
        {alerts.slice(0, 4).map((b) => (
          <li
            key={b.id}
            className="flex items-center justify-between text-xs text-slate-300 light_sakura:text-slate-700"
          >
            <span className="truncate">
              {t("budget.dashboard_alert_item", {
                category: getLabel(b.category_key),
                percent: Math.round(b.percent)
              })}
            </span>
            <span className={`shrink-0 ml-2 w-1.5 h-1.5 rounded-full ${b.status === "danger" ? "bg-red-500" : "bg-amber-500"}`} />
          </li>
        ))}
      </ul>
    </motion.div>
  );
};
