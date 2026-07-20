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
import { useThemeTokens } from "../hooks/useThemeTokens";

interface DashboardHeaderProps {
  currentUser: UserSession;
  telegramStatus: { linked: boolean; lastSync: string | null };
}

export const DashboardHeader: React.FC<DashboardHeaderProps> = ({
  currentUser,
  telegramStatus,
}) => {
  const { tokens, cx } = useThemeTokens();
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

  // Dot indikator status untuk sub-greeting (pengganti visual dari paragraf
  // italic panjang) -- warnanya mengikuti tingkat urgensi anggaran, selaras
  // dengan token badge yang sama dipakai widget budget lain di app.
  const subGreetingDotClass: Record<ReturnType<typeof getDynamicSubGreeting>["type"], string> = {
    budget_danger: "bg-red-400",
    budget_warning: "bg-amber-400",
    budget_ok: "bg-emerald-400",
    empty: "bg-slate-500 light_sakura:bg-slate-300",
    loading: "bg-slate-500 light_sakura:bg-slate-300 animate-pulse",
  };

  const avatarInitial = currentUser.display_name?.charAt(0)?.toUpperCase() || "?";
  const subGreeting = getDynamicSubGreeting();

  return (
    <Card
      id="dashboard-welcome-banner"
      border="subtle"
      elevation="sm"
      padding="sm"
      className="relative flex flex-col gap-3"
    >
      {weatherTheme && effectiveWeather && (
        <DashboardWeatherLayer
          condition={effectiveWeather.condition}
          isDay={effectiveWeather.isDay}
        />
      )}

      {/* Overlay event/liburan (confetti Piala Dunia, dll) -- sengaja dirender
          TERPISAH dari DashboardWeatherLayer supaya tetap muncul walau data
          cuaca gagal/loading (geolocation ditolak, /api/utils?type=weather down, dst).
          Sebelumnya overlay ini "menumpang" di dalam weather layer sehingga
          tidak pernah terlihat ketika cuaca gagal dimuat. */}
      {eventOverlay && (
        <EventOverlay type={eventOverlay} />
      )}

      {/* Pola "large title" native: satu baris status ringkas (cuaca+tanggal
          digabung, bukan 2 badge terpisah) di atas judul besar satu baris --
          menggantikan susunan lama (badge tanggal + badge cuaca berjajar,
          lalu judul, lalu paragraf italic panjang) yang terasa seperti
          caption artikel web, bukan status singkat gaya OS native. */}
      <div className="relative z-10 flex items-start justify-between gap-3">
        {/* Logo brand PNG sudah dipindah khusus ke MobileTopBar/Sidebar supaya
            tidak duplikat dengan greeting card ini (sebelumnya logo yang sama
            tampil dua kali sekaligus di layar: kecil di top bar + besar di
            sini). Greeting card sekarang fokus murni ke sapaan personal. */}
        <motion.div
          className="min-w-0 flex-1"
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.1, ease: "easeOut" }}
        >
          <div className="flex items-center gap-1.5 mb-1.5 overflow-x-auto no-scrollbar">
            {weatherLoading && !debugOverride && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-white/10 backdrop-blur-sm border border-white/10 rounded-full text-xs font-medium text-slate-500 shrink-0 whitespace-nowrap animate-pulse">
                <span>{t("dashboard.weather_loading")}</span>
              </div>
            )}

            {effectiveWeather && weatherTheme && (
              <div className={cx(tokens.dashboardHeader.weatherBadge, tokens.text.accent, "shrink-0")}>
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

            {/* Tanggal digabung jadi satu baris yang sama dengan badge cuaca
                (dipisah garis vertikal tipis), bukan badge terpisah di
                sampingnya seperti sebelumnya. */}
            <span className="w-px h-3 bg-white/10 shrink-0" aria-hidden="true" />
            <div className={cx(tokens.dashboardHeader.weatherBadge, tokens.text.accent, "shrink-0")}>
              <Calendar size={12} className="shrink-0" />
              <span className="whitespace-nowrap">{formattedDate}</span>
            </div>

            <WeatherDebugToggle value={debugOverride} onChange={setDebugOverride} />
          </div>

          {/* Large title -- satu baris, besar, tegas, meniru pola title
              iOS/Android modern (bukan lagi text-2xl font-bold biasa). */}
          <h1 className={cx("font-sans font-black text-[28px] sm:text-3xl leading-none tracking-tight truncate", tokens.text.primary)}>
            {t(getGreetingKey(), { name: currentUser.display_name })}
          </h1>

          {/* Status anggaran diringkas jadi satu baris dengan dot warna,
              menggantikan paragraf italic panjang -- teks lengkapnya tetap
              sama (data-driven), hanya presentasinya yang dipadatkan jadi
              satu baris dengan ellipsis; teks penuh tetap tersedia lewat
              title="" saat di-hover/di-tahan. */}
          <div className="flex items-center gap-1.5 mt-2 min-w-0">
            <span className={cx("w-1.5 h-1.5 rounded-full shrink-0", subGreetingDotClass[subGreeting.type])} aria-hidden="true" />
            <p
              className={cx("font-sans text-xs truncate transition-colors", tokens.text.muted)}
              title={subGreeting.text}
            >
              {subGreeting.text}
            </p>
          </div>

          {telegramStatus.linked && (
            <div className={cx("flex items-center gap-1.5 mt-2 text-[clamp(0.5625rem,2.6vw,0.625rem)] px-2 py-1 rounded-lg border w-fit", tokens.badge.success)}>
              <Send size={10} />
              <span>
                {t("settings.telegram_sync_status")}
                {telegramStatus.lastSync ? ` (${t("settings.telegram_last_sync", { time: telegramStatus.lastSync })})` : ""}
              </span>
            </div>
          )}
        </motion.div>

        {/* Avatar + badge tamu -- toggle mata nominal yang dulu ada di
            header kartu Pos Dompet sudah DIHAPUS (lihat
            DashboardWalletCarousel.tsx), saldo selalu tampil apa adanya. */}
        <div className="relative z-10 flex flex-col items-end gap-2 shrink-0">
          <div className={cx(
            "w-9 h-9 rounded-full flex items-center justify-center overflow-hidden text-sm font-bold shrink-0",
            "bg-white/10 backdrop-blur-sm border border-white/10 light_sakura:bg-rose-50 light_sakura:border-rose-100/50",
            tokens.text.accent
          )}>
            {currentUser.avatar_url ? (
              <img src={currentUser.avatar_url} alt={currentUser.display_name} className="w-full h-full object-cover" />
            ) : (
              avatarInitial
            )}
          </div>
          {currentUser.is_guest && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4, delay: 0.3 }}
              className="bg-amber-500/10 border border-amber-500/20 rounded-2xl px-3 py-1.5 font-sans text-xs font-semibold text-amber-500 flex items-center gap-1.5 whitespace-nowrap"
            >
              <Info size={13} className="shrink-0" />
              <span>{t("auth.guest_badge")}</span>
            </motion.div>
          )}
        </div>
      </div>
    </Card>
  );
};
