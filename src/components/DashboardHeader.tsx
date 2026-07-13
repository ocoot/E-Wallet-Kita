import React, { useEffect, useState } from "react";
import { useLanguage } from "../contexts/LanguageContext";
import { UserSession } from "../types";
import { Send, Info, Calendar, MapPin } from "lucide-react";
import { motion } from "motion/react";
import { useWeather } from "../hooks/useWeather";
import { useBudgets } from "../hooks/useBudgets";
import { getWeatherTheme } from "../lib/weatherTheme";
import { DashboardWeatherLayer } from "./DashboardWeatherLayer";
import { WeatherDebugToggle, WeatherDebugOverride } from "./WeatherDebugToggle";
import { EventOverlay } from "./EventOverlay";
import { getActiveEvent, fetchAllEvents } from "../api/eventCalendar";
import type { NagerHoliday, SportsDbEvent } from "../api/eventCalendar";
import type { OverlayType } from "../api/eventCalendar";
import { Card } from "./ui/Card";

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

  // TEMPORARY DEV TOOL -- lihat komentar di WeatherDebugToggle.tsx.
  // Saat override aktif, ini menggantikan data cuaca asli hanya untuk
  // preview visual (tidak mengubah/menyimpan apa pun).
  const [debugOverride, setDebugOverride] = useState<WeatherDebugOverride | null>(null);

  // ── Deteksi event/liburan & sepakbola aktif ──
  const [holidays, setHolidays] = useState<NagerHoliday[] | null>(null);
  const [footballMatches, setFootballMatches] = useState<SportsDbEvent[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchAllEvents().then((data) => {
      if (!cancelled) {
        setHolidays(data.holidays);
        setFootballMatches(data.footballMatches);
      }
    });
    return () => { cancelled = true; };
  }, []);

  const activeEvent = getActiveEvent(new Date(), holidays, footballMatches);
  const eventOverlay: OverlayType | null = activeEvent?.event.overlay.type ?? null;

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

  const getDynamicSubGreeting = (): { text: string; type: "budget_danger" | "budget_warning" | "budget_ok" | "empty" | "loading" } => {
    if (budgetsLoading) {
      return {
        text: locale === "id" ? "Memuat status anggaran..." : "Loading budget status...",
        type: "loading"
      };
    }

    if (budgets.length > 0) {
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

        const rawText = locale === "id"
          ? `Status Anggaran Harian: Jatah aman harian ± ${formattedAllowance} (${remainingDays} hari tersisa, ${overallPercent}% anggaran terpakai).`
          : `Daily Budget Status: Safe daily allowance ± ${formattedAllowance} (${remainingDays} days remaining, ${overallPercent}% budget spent).`;

        return {
          text: rawText,
          type: "budget_ok"
        };
      }
    }

    return {
      text: locale === "id"
        ? "Belum ada anggaran kategori yang diatur. Buat anggaran untuk memantau pengeluaran Anda."
        : "No category budgets set yet. Create one to keep track of your spending.",
      type: "empty"
    };
  };

  return (
    <Card
      id="dashboard-welcome-banner"
      border="subtle"
      elevation="sm"
      className="relative flex flex-col md:flex-row md:items-center justify-between gap-4"
    >
      {weatherTheme && effectiveWeather && (
        <DashboardWeatherLayer
          condition={effectiveWeather.condition}
          isDay={effectiveWeather.isDay}
        />
      )}

      {/* Overlay event/liburan (confetti Piala Dunia, dll) -- sengaja dirender
          TERPISAH dari DashboardWeatherLayer supaya tetap muncul walau data
          cuaca gagal/loading (geolocation ditolak, /api/weather down, dst).
          Sebelumnya overlay ini "menumpang" di dalam weather layer sehingga
          tidak pernah terlihat ketika cuaca gagal dimuat. */}
      {eventOverlay && (
        <EventOverlay type={eventOverlay} />
      )}

      <div className="relative z-10 flex items-center gap-4">
        {/* Logo brand PNG sudah dipindah khusus ke MobileTopBar/Sidebar supaya
            tidak duplikat dengan greeting card ini (sebelumnya logo yang sama
            tampil dua kali sekaligus di layar: kecil di top bar + besar di
            sini). Greeting card sekarang fokus murni ke sapaan personal. */}
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
              <p className="font-sans text-xs mt-1.5 max-w-xl leading-relaxed transition-colors text-slate-400 light_sakura:text-slate-500 italic">
                {subGreeting.text}
              </p>
            );
          })()}
          {telegramStatus.linked && (
            <div className="flex items-center gap-1.5 mt-2 text-[clamp(0.5625rem,2.6vw,0.625rem)] text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-md w-fit border border-emerald-500/10">
              <Send size={10} />
              <span>
                {t("settings.telegram_sync_status")}
                {telegramStatus.lastSync ? ` (${t("settings.telegram_last_sync", { time: telegramStatus.lastSync })})` : ""}
              </span>
            </div>
          )}
        </motion.div>
      </div>

      {/* Badge tamu saja di sini sekarang -- toggle mata nominal sudah
          dipindah keluar dari kartu ini, lihat BalanceVisibilityToggle.tsx */}
      <div className="relative z-10 flex flex-col items-start md:items-end gap-2 shrink-0">
        {currentUser.is_guest && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, delay: 0.3 }}
            className="bg-amber-500/10 border border-amber-500/20 rounded-2xl px-4 py-2 font-sans text-xs font-semibold text-amber-500 flex items-center gap-2"
          >
            <Info size={14} />
            <span>{t("auth.guest_badge")}</span>
          </motion.div>
        )}
      </div>
    </Card>
  );
};
