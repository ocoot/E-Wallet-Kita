import React from "react";
import logoUrl from "../assets/images/user_logo_transparent.png";
import { useLanguage } from "../contexts/LanguageContext";
import { UserSession } from "../types";
import { Send, Info, Calendar } from "lucide-react";

interface DashboardHeaderProps {
  currentUser: UserSession;
  telegramStatus: { linked: boolean; lastSync: string | null };
}

export const DashboardHeader: React.FC<DashboardHeaderProps> = ({
  currentUser,
  telegramStatus,
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

  return (
    <div id="dashboard-welcome-banner" className="p-6 rounded-3xl border bg-slate-900 border-slate-900 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-colors duration-300 light_sakura:bg-white light_sakura:border-rose-100/10 shadow-sm">
      <div className="flex items-center gap-4">

        {/* Logo PNG transparan - tidak ada background kotak */}
        <div className="shrink-0">
          <img
            src={logoUrl}
            alt="EWK Icon"
            className="w-16 h-16 sm:w-20 sm:h-20 md:w-20 md:h-20 lg:w-24 lg:h-24 object-contain transition-all duration-300"
          />
        </div>

        <div>
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
            <div className="flex items-center gap-1.5 mt-2 text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-md w-fit">
              <Send size={10} />
              <span>
                {t("settings.telegram_sync_status")}
                {telegramStatus.lastSync ? ` (${t("settings.telegram_last_sync", { time: telegramStatus.lastSync })})` : ""}
              </span>
            </div>
          )}
        </div>
      </div>

      {currentUser.is_guest && (
        <div className="self-start md:self-center bg-amber-500/10 border border-amber-500/20 rounded-2xl px-4 py-2 font-sans text-xs font-semibold text-amber-500 flex items-center gap-2">
          <Info size={14} />
          <span>{t("auth.guest_badge")}</span>
        </div>
      )}
    </div>
  );
};
