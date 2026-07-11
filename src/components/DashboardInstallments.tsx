import React from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { Landmark, ChevronRight } from "lucide-react";
import { useLanguage } from "../contexts/LanguageContext";
import { useAuth } from "../contexts/AuthContext";
import { useInstallments } from "../hooks/useInstallments";
import { ErrorState } from "./ErrorState";
import { audioFeedback } from "../lib/audio";

/**
 * Widget dashboard ringkas untuk cicilan/utang jangka panjang yang masih
 * berjalan, menampilkan progres tiap cicilan (mis. "12/24 bulan"). Hanya
 * tampil kalau user punya minimal 1 cicilan aktif.
 */
export const DashboardInstallments: React.FC = () => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { installments, loading, error, refresh } = useInstallments(user?.id);

  const active = installments.filter((i) => !i.is_completed).slice(0, 3);

  if (error) {
    return (
      <div className="rounded-3xl bg-slate-900 border border-slate-900 light_sakura:bg-white light_sakura:border-rose-100/10 shadow-lg transition-colors duration-300">
        <ErrorState onRetry={refresh} />
      </div>
    );
  }

  if (loading || active.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-6 rounded-3xl bg-slate-900 border border-slate-900 light_sakura:bg-white light_sakura:border-rose-100/10 shadow-lg transition-colors duration-300"
    >
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 bg-indigo-500/15 text-indigo-400 light_sakura:bg-rose-500/15 light_sakura:text-rose-500">
            <Landmark size={16} />
          </div>
          <h3 className="font-sans font-bold text-sm text-slate-100 light_sakura:text-slate-800">
            {t("installments.dashboard_widget_title")}
          </h3>
        </div>
        <button
          onClick={() => { audioFeedback.playClick(); navigate("/installments"); }}
          className="flex items-center gap-1 text-[clamp(0.6188rem,2.86vw,0.6875rem)] font-semibold text-slate-400 hover:text-slate-200 light_sakura:text-slate-500 light_sakura:hover:text-slate-700 transition-colors cursor-pointer"
        >
          {t("installments.dashboard_widget_cta")} <ChevronRight size={12} />
        </button>
      </div>

      <div className="space-y-3">
        {active.map((i) => (
          <div key={i.id} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-300 light_sakura:text-slate-700 truncate pr-2">{i.name}</span>
              <span className="text-slate-500 shrink-0">{i.months_paid}/{i.total_months}</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-slate-800/70 light_sakura:bg-slate-200/70 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 light_sakura:from-rose-500 light_sakura:to-rose-400"
                style={{ width: `${i.progressPercent}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
};
