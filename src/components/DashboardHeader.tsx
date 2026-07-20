import React, { useEffect, useState } from "react";
import { useLanguage } from "../contexts/LanguageContext";
import { UserSession } from "../types";
import { Send, Info, Calendar, MapPin } from "lucide-react";
import { motion } from "motion/react";
import { useWeather } from "../hooks/useWeather";
import { useDashboardGreeting } from "../hooks/useDashboardGreeting";
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
  const { greetingText, subGreeting } = useDashboardGreeting(currentUser.id, currentUser.display_name);

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

  const formattedDate = new Intl.DateTimeFormat(locale === "id" ? "id-ID" : "en-US", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

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
          cuaca gagal/loading (geolocation ditolak, /api/utils?type=weather down, dst).
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
            <div className={cx(tokens.dashboardHeader.weatherBadge, tokens.text.accent)}>
              <Calendar size={12} className="shrink-0" />
              <span>{formattedDate}</span>
            </div>

            {weatherLoading && !debugOverride && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-white/10 backdrop-blur-sm border border-white/10 rounded-full text-xs font-medium text-slate-500 shrink-0 whitespace-nowrap animate-pulse">
                <span>{t("dashboard.weather_loading")}</span>
              </div>
            )}

            {effectiveWeather && weatherTheme && (
              <div className={cx(tokens.dashboardHeader.weatherBadge, tokens.text.accent)}>
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
          {/* Large title "Selamat pagi, {nama}" sekarang HANYA tampil di
              desktop (hidden md:block) -- di mobile, sapaan ini digantikan
              DashboardTitleHeader.tsx yang dirender Dashboard.tsx SEBELUM
              carousel ini (di luar overflow-x-auto, supaya collapse-on-scroll
              bisa sticky dengan benar -- lihat komentar di file itu untuk
              alasan lengkapnya). Desktop tidak punya MobileTopBar untuk
              collapse ke sana, jadi tetap dipertahankan statis di sini
              seperti semula. */}
          <div className="hidden md:block">
            <h1 className={cx("font-sans font-bold text-2xl tracking-tight", tokens.text.primary)}>
              {greetingText}
            </h1>
            <p className={cx("font-sans text-xs mt-1.5 max-w-xl leading-relaxed line-clamp-2 transition-colors", tokens.text.muted)}>
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
      </div>

      {/* Badge tamu saja di sini sekarang -- toggle mata nominal yang dulu
          ada di header kartu Pos Dompet sudah DIHAPUS (lihat
          DashboardWalletCarousel.tsx), saldo selalu tampil apa adanya. */}
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
