import React, { useState } from "react";
import logoUrl from "../assets/images/user_logo_transparent.png";
import { useLanguage } from "../contexts/LanguageContext";
import { UserSession } from "../types";
import { Send, Info, Calendar, MapPin } from "lucide-react";
import { motion } from "motion/react";
import { useWeather } from "../hooks/useWeather";
import { useBudgets } from "../hooks/useBudgets";
import { getWeatherTheme } from "../lib/weatherTheme";
import { DashboardWeatherLayer } from "./DashboardWeatherLayer";
import { WeatherDebugToggle, WeatherDebugOverride } from "./WeatherDebugToggle";

interface DashboardHeaderProps {
  currentUser: UserSession;
  telegramStatus: { linked: boolean; lastSync: string | null };
}

export const DashboardHeader: React.FC<DashboardHeaderProps> = ({
  currentUser,
  telegramStatus,
}) => {
  const { t, locale } = useLanguage();
  const { weather, loading: weatherLoading } = useWeather();
  const { budgets, loading: budgetsLoading } = useBudgets(currentUser.id);

  // ⚠️ TEMPORARY DEV TOOL -- lihat komentar di WeatherDebugToggle.tsx.
  // Saat override aktif, ini menggantikan data cuaca asli hanya untuk
  // preview visual (tidak mengubah/menyimpan apa pun).
  const [debugOverride, setDebugOverride] = useState<WeatherDebugOverride | null>(null);

  const effectiveWeather: { condition: WeatherDebugOverride["condition"]; isDay: boolean } | null = debugOverride
    ? debugOverride
    : weather
      ? { condition: weather.current.condition, isDay: weather.current.isDay }
      : null;

  const weatherTheme = effectiveWeather ? getWeatherTheme(effectiveWeather.condition, effectiveWeather.isDay) : null;

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

  const getDynamicTip = (): string => {
    const tipsId = [
      "Tips hari ini: Selalu catat transaksi kecil seperti parkir atau jajan agar pengeluaran bulanan tetap terkontrol!",
      "Tips hari ini: Gunakan fitur Anggaran Kategori untuk membatasi pengeluaran hiburan dan makan di luar.",
      "Tips hari ini: Sisihkan minimal 10% pendapatan di awal bulan sebelum mulai berbelanja.",
      "Tips hari ini: Sudahkah Anda memeriksa pengingat tagihan hari ini? Jangan biarkan denda menumpuk!",
      "Tips hari ini: Gunakan OCR struk belanja untuk mencatat transaksi panjang dengan satu ketukan cepat.",
      "Tips hari ini: Konsistensi adalah kunci! Catat keuangan setiap hari agar pengelolaan uang terasa lebih ringan.",
      "Tips hari ini: Hubungkan Telegram Bot kami untuk mencatat transaksi langsung dari ruang chat Anda."
    ];

    const tipsEn = [
      "Tip of the day: Always record small expenses like parking or snacks to keep your monthly budget under control!",
      "Tip of the day: Use Category Budgets to limit entertainment and dining-out expenses.",
      "Tip of the day: Save at least 10% of your income at the beginning of the month before spending.",
      "Tip of the day: Have you checked your bill reminders today? Avoid late fees by staying ahead!",
      "Tip of the day: Use receipt OCR to log long purchase receipts with a single quick tap.",
      "Tip of the day: Consistency is key! Log daily to make money management feel effortless.",
      "Tip of the day: Connect our Telegram Bot to record transactions directly from your chat app."
    ];

    const day = new Date().getDay(); // 0 to 6
    return locale === "id" ? tipsId[day] : tipsEn[day];
  };

  const getDynamicSubGreeting = (): { text: string; type: "budget_danger" | "budget_warning" | "budget_ok" | "tip" } => {
    if (!budgetsLoading && budgets.length > 0) {
      const dangerBudget = budgets.find(b => b.status === "danger" || b.percent >= 100);
      if (dangerBudget) {
        return {
          text: locale === "id"
            ? `Peringatan Anggaran: Kategori "${dangerBudget.category_key}" telah terpakai ${Math.round(dangerBudget.percent)}%! Batasi pengeluaran Anda hari ini.`
            : `Budget Alert: Category "${dangerBudget.category_key}" is at ${Math.round(dangerBudget.percent)}%! Mind your spending today.`,
          type: "budget_danger"
        };
      }

      const warningBudget = budgets.find(b => b.status === "warning");
      if (warningBudget) {
        return {
          text: locale === "id"
            ? `Perhatian Anggaran: Kategori "${warningBudget.category_key}" mendekati batas (${Math.round(warningBudget.percent)}% terpakai).`
            : `Budget Warning: Category "${warningBudget.category_key}" is approaching limit (${Math.round(warningBudget.percent)}% spent).`,
          type: "budget_warning"
        };
      }

      const totalLimit = budgets.reduce((acc, b) => acc + b.monthly_limit, 0);
      const totalSpent = budgets.reduce((acc, b) => acc + b.spent, 0);

      if (totalLimit > 0) {
        const today = new Date();
        const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
        const remainingDays = Math.max(1, daysInMonth - today.getDate() + 1);
        const remainingBudget = Math.max(0, totalLimit - totalSpent);
        const dailyAllowance = Math.floor(remainingBudget / remainingDays);
        const overallPercent = Math.round((totalSpent / totalLimit) * 100);

        const formattedAllowance = new Intl.NumberFormat(locale === "id" ? "id-ID" : "en-US", {
          style: "currency",
          currency: "IDR",
          maximumFractionDigits: 0
        }).format(dailyAllowance);

        return {
          text: locale === "id"
            ? `Status Anggaran Harian: Jatah aman harian ± ${formattedAllowance} (${remainingDays} hari tersisa, ${overallPercent}% anggaran terpakai).`
            : `Daily Budget Status: Safe daily allowance ± ${formattedAllowance} (${remainingDays} days remaining, ${overallPercent}% budget spent).`,
          type: "budget_ok"
        };
      }
    }

    return {
      text: getDynamicTip(),
      type: "tip"
    };
  };

  return (
    <div 
      id="dashboard-welcome-banner" 
      className="relative p-6 rounded-3xl border bg-slate-900 border-slate-900 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all duration-300 light_sakura:bg-white light_sakura:border-rose-100/10 shadow-sm"
    >
      {weatherTheme && effectiveWeather && (
        <DashboardWeatherLayer condition={effectiveWeather.condition} isDay={effectiveWeather.isDay} />
      )}

      <div className="relative z-10 flex items-center gap-4">
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
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-white/10 backdrop-blur-sm border border-white/10 rounded-full text-xs font-medium text-slate-300 shrink-0 whitespace-nowrap light_sakura:bg-rose-50 light_sakura:border-rose-100/50 light_sakura:text-rose-600 transition-colors duration-300">
              <Calendar size={12} className="shrink-0" />
              <span>{formattedDate}</span>
            </div>

            {weatherLoading && !debugOverride && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-white/10 backdrop-blur-sm border border-white/10 rounded-full text-xs font-medium text-slate-500 shrink-0 whitespace-nowrap animate-pulse">
                <span>{t("dashboard.weather_loading")}</span>
              </div>
            )}

            {effectiveWeather && weatherTheme && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-white/10 backdrop-blur-sm border border-white/10 rounded-full text-xs font-medium text-slate-300 shrink-0 whitespace-nowrap light_sakura:bg-rose-50 light_sakura:border-rose-100/50 light_sakura:text-rose-600 transition-colors duration-300">
                <weatherTheme.icon size={12} className={`shrink-0 ${weatherTheme.accentClass}`} />
                <span>{locale === "id" ? weatherTheme.labelId : weatherTheme.labelEn}</span>
                {!debugOverride && weather && (
                  <>
                    <span>· {weather.current.temperatureC}°C</span>
                    <span className="w-px h-3 bg-white/10 mx-0.5 shrink-0" />
                    <MapPin size={11} className="shrink-0 opacity-70" />
                    <span className="max-w-[9rem] truncate">{weather.location.city}</span>
                  </>
                )}
                {debugOverride && <span className="text-fuchsia-300">(debug)</span>}
              </div>
            )}

            <WeatherDebugToggle value={debugOverride} onChange={setDebugOverride} />
          </div>
          <h1 className="font-sans font-bold text-2xl tracking-tight text-white light_sakura:text-slate-900">
            {t(getGreetingKey(), { name: currentUser.display_name })}
          </h1>
          {(() => {
            const subGreeting = getDynamicSubGreeting();
            return (
              <p className={`font-sans text-xs mt-1.5 max-w-xl leading-relaxed transition-colors ${
                subGreeting.type === "budget_danger"
                  ? "text-rose-400 font-semibold light_sakura:text-rose-600"
                  : subGreeting.type === "budget_warning"
                  ? "text-amber-300 font-medium light_sakura:text-amber-700"
                  : subGreeting.type === "budget_ok"
                  ? "text-emerald-300 font-medium light_sakura:text-emerald-700"
                  : "text-slate-400 light_sakura:text-slate-500 italic"
              }`}>
                {subGreeting.text}
              </p>
            );
          })()}
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
          className="relative z-10 self-start md:self-center bg-amber-500/10 border border-amber-500/20 rounded-2xl px-4 py-2 font-sans text-xs font-semibold text-amber-500 flex items-center gap-2"
        >
          <Info size={14} />
          <span>{t("auth.guest_badge")}</span>
        </motion.div>
      )}
    </div>
  );
};
