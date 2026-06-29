import React from "react";
import logoUrl from "../assets/images/user_logo_transparent.png";
import { useLanguage } from "../contexts/LanguageContext";
import { UserSession } from "../types";
import { Send, Info, Calendar, Target, AlertTriangle } from "lucide-react";
import { motion } from "motion/react";

interface DashboardHeaderProps {
  currentUser: UserSession;
  telegramStatus: { linked: boolean; lastSync: string | null };
  todaySpending?: number;
}

export const DashboardHeader: React.FC<DashboardHeaderProps> = ({
  currentUser,
  telegramStatus,
  todaySpending = 0,
}) => {
  const { t, locale } = useLanguage();

  const getGreetingKey = (): string => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 11) {
      return "dashboard.greeting_morning";
    } else if (hour >= 11 && hour < 15) {
      return "dashboard.greeting_afternoon";
    } else if (hour >= 15 && hour < 19) {
      return "dashboard.greeting_evening";
    } else {
      return "dashboard.greeting_night";
    }
  };

  const formattedDate = new Intl.DateTimeFormat(locale === "id" ? "id-ID" : "en-US", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

  const formatIDR = (num: number) => {
    return "Rp" + Math.round(num).toLocaleString("id-ID");
  };

  const dailyBudget = currentUser.daily_budget || 0;
  const progressPercent = dailyBudget > 0 ? (todaySpending / dailyBudget) * 100 : 0;
  const isOverBudget = dailyBudget > 0 && todaySpending > dailyBudget;

  return (
    <div 
      id="dashboard-welcome-banner" 
      className="p-6 rounded-3xl border bg-slate-900 border-slate-900 flex flex-col gap-6 transition-all duration-300 light_sakura:bg-white light_sakura:border-rose-100/10 shadow-sm overflow-hidden"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          {/* Logo PNG transparan */}
          <motion.div 
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="shrink-0"
          >
            <img
              src={logoUrl}
              alt="EWK Icon"
              className="w-16 h-16 sm:w-20 sm:h-20 md:w-20 md:h-20 lg:w-24 lg:h-24 object-contain transition-all duration-300"
            />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.1, ease: "easeOut" }}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-white/5 border border-white/10 rounded-full text-xs font-medium text-slate-300 light_sakura:bg-rose-50 light_sakura:border-rose-100/50 light_sakura:text-rose-600 transition-colors duration-300">
                <Calendar size={12} className="shrink-0" />
                <span>{formattedDate}</span>
              </div>
            </div>
            <h1 className="font-sans font-bold text-2xl tracking-tight text-white light_sakura:text-slate-900">
              {t(getGreetingKey(), { name: currentUser.display_name })}
            </h1>
            <p className="font-sans text-sm text-slate-400 mt-1 light_sakura:text-slate-500">
              {t("app.tagline_sub")}
            </p>
            {telegramStatus.linked && (
              <div className="flex items-center gap-1.5 mt-2 text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-md w-fit border border-emerald-500/10">
                <Send size={10} />
                <span>
                  {t("settings.telegram_sync_status")}
                  {telegramStatus.lastSync ? ` (${t("settings.telegram_last_sync", { time: telegramStatus.lastSync })})` : ""}
                </span>
              </div>
            )}
          </motion.div>
        </div>

        {currentUser.is_guest && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, delay: 0.3 }}
            className="self-start md:self-center bg-amber-500/10 border border-amber-500/20 rounded-2xl px-4 py-2 font-sans text-xs font-semibold text-amber-500 flex items-center gap-2"
          >
            <Info size={14} />
            <span>{t("auth.guest_badge")}</span>
          </motion.div>
        )}
      </div>

      {/* Daily Spending Goal Progress Bar */}
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="pt-5 border-t border-white/5 light_sakura:border-rose-100/40"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <div className={`p-1.5 rounded-lg ${isOverBudget ? 'bg-red-500/10 text-red-400' : 'bg-indigo-500/10 text-indigo-400 light_sakura:bg-rose-500/10 light_sakura:text-rose-500'}`}>
              <Target size={14} />
            </div>
            <span className="text-[11px] font-bold text-slate-400 light_sakura:text-slate-500 uppercase tracking-widest">
              {t("settings.daily_budget")}
            </span>
          </div>
          
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-white light_sakura:text-slate-800">
              {formatIDR(todaySpending)}
            </span>
            <span className="text-xs text-slate-500">/</span>
            <span className="text-xs font-medium text-slate-400">
              {dailyBudget > 0 ? formatIDR(dailyBudget) : t("budget.not_set", "Not set")}
            </span>
            {isOverBudget && (
              <div className="flex items-center gap-1 ml-1 text-[10px] font-bold text-red-400 animate-pulse">
                <AlertTriangle size={12} />
                <span>OVER!</span>
              </div>
            )}
          </div>
        </div>

        <div className="relative h-2.5 w-full bg-slate-800/50 rounded-full overflow-hidden light_sakura:bg-rose-100/40">
          {dailyBudget > 0 ? (
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(100, progressPercent)}%` }}
              transition={{ duration: 1, ease: "circOut" }}
              className={`h-full relative rounded-full ${
                isOverBudget 
                  ? 'bg-gradient-to-r from-red-500 to-rose-600' 
                  : 'bg-gradient-to-r from-indigo-500 to-violet-600 light_sakura:from-rose-400 light_sakura:to-rose-500'
              }`}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-[9px] text-slate-600 light_sakura:text-rose-300 font-medium">
                {t("budget.daily_budget_hint", "Atur target harian di Pengaturan")}
              </span>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};
