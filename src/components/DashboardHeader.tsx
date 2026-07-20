import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "../contexts/LanguageContext";
import { UserSession } from "../types";
import { Send, Info, MapPin } from "lucide-react";
import { useWeather } from "../hooks/useWeather";
import { getWeatherTheme } from "../lib/weatherTheme";
import { WeatherDebugToggle, WeatherDebugOverride } from "./WeatherDebugToggle";
import { useThemeTokens } from "../hooks/useThemeTokens";

interface DashboardHeaderProps {
  currentUser: UserSession;
  telegramStatus: { linked: boolean; lastSync: string | null };
}

/**
 * Redesign "Varian A -- Minimal Utility Topbar" (native look-alike).
 *
 * Sebelumnya komponen ini adalah <Card> besar berisi 4+ badge terpisah
 * (tanggal, cuaca, lokasi, debug), sapaan besar, sub-teks status anggaran,
 * dan banner sync Telegram permanen -- pola khas hero card di website, dan
 * kelamaan makan ruang layar di mobile.
 *
 * Layout sekarang "iOS Large Title" (lihat mockup 1/5 yang disetujui):
 * bukan lagi 1 baris sejajar kiri-kanan, tapi 2 tingkat, dipisah hairline
 * 1px (`tokens.border.default`) alih-alih shadow/Card:
 *  - Baris atas : status cluster (chip cuaca + chip lokasi kota) di kiri,
 *           tombol debug cuaca (dev only, ikon saja) + avatar profil di
 *           kanan.
 *  - Baris bawah: sapaan besar (font-extrabold ~26px, meniru nav bar Large
 *           Title iOS Mail/Notes), boleh wrap sampai 2 baris untuk nama
 *           panjang (`line-clamp-2`, tidak dipotong paksa jadi "...").
 *           Tanpa sub-teks anggaran -- info itu sudah tersedia di
 *           <DashboardBudgetSummary />/<DashboardBudgetAlerts /> di bagian
 *           bawah halaman, jadi tidak digandakan di sini.
 *
 * Chip lokasi pakai `weather.location.city` (sudah ada dari
 * `useWeather()`, endpoint `/api/utils?type=weather` resolve dari GPS atau
 * fallback IP) -- BUKAN dari `debugOverride`, karena override cuma preview
 * kondisi cuaca/siang-malam, bukan lokasi. Jadi chip lokasi tetap tampil
 * apa adanya walau chip cuaca sedang dalam mode preview debug.
 *
 * Titik hijau kecil di sudut avatar menandakan status sinkron Bot Telegram
 * (dari `telegramStatus.linked`), menggantikan banner sync yang dulu selalu
 * tampil penuh.
 *
 * Overlay dekoratif cuaca (awan/partikel animasi) & overlay event/liburan
 * sengaja TIDAK dipakai lagi di sini -- tidak ada ruang yang pas untuk itu
 * di topbar setipis ini. Kalau suatu saat mau dikembalikan, tempatnya lebih
 * cocok di kartu ringkasan saldo (bagian yang punya ruang lega), bukan di
 * topbar.
 */
export const DashboardHeader: React.FC<DashboardHeaderProps> = ({
  currentUser,
  telegramStatus,
}) => {
  const { tokens, cx } = useThemeTokens();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { weather, loading: weatherLoading } = useWeather();

  // TEMPORARY DEV TOOL -- lihat komentar di WeatherDebugToggle.tsx. Saat
  // override aktif, ini menggantikan data cuaca asli hanya untuk preview
  // visual (tidak mengubah/menyimpan apa pun).
  const [debugOverride, setDebugOverride] = useState<WeatherDebugOverride | null>(null);

  const effectiveWeather: { condition: WeatherDebugOverride["condition"]; isDay: boolean } | null = debugOverride
    ? debugOverride
    : weather
      ? { condition: weather.current.condition, isDay: weather.current.isDay }
      : null;

  const weatherTheme = effectiveWeather ? getWeatherTheme(effectiveWeather.condition, effectiveWeather.isDay) : null;

  const getGreetingKey = (): string => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 11) return "dashboard.greeting_morning";
    if (hour >= 11 && hour < 15) return "dashboard.greeting_afternoon";
    if (hour >= 15 && hour < 19) return "dashboard.greeting_evening";
    return "dashboard.greeting_night";
  };

  const initial = currentUser.display_name?.charAt(0)?.toUpperCase() || "?";

  return (
    <div
      id="dashboard-welcome-banner"
      className={cx("relative pt-1 pb-3 border-b", tokens.border.default)}
    >
      {/* Baris atas: status cluster. Kiri = chip cuaca + chip lokasi kota
          (flex-1 min-w-0 + overflow-hidden supaya nama kota panjang
          truncate rapi alih-alih mendorong avatar keluar layar di HP
          sempit). Kanan = debug (dev only) + avatar, shrink-0 karena harus
          selalu utuh terlihat. */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0 flex items-center gap-1.5 overflow-hidden">
          {weatherLoading && !debugOverride && (
            <div className={cx(tokens.dashboardHeader.weatherBadge, "animate-pulse shrink-0")}>
              <span>{t("dashboard.weather_loading")}</span>
            </div>
          )}

          {effectiveWeather && weatherTheme && (
            <div className={cx(tokens.dashboardHeader.weatherBadge, tokens.text.accent, "shrink-0")}>
              <weatherTheme.icon size={12} className={`shrink-0 ${weatherTheme.accentClass}`} />
              {!debugOverride && weather && <span>{weather.current.temperatureC}°C</span>}
              {debugOverride && (
                <span>{debugOverride.condition.replace(/_/g, " ")}</span>
              )}
            </div>
          )}

          {/* Chip lokasi kota -- baru. Sengaja baca `weather.location.city`
              langsung (bukan lewat `effectiveWeather`), karena lokasi bukan
              bagian dari preview debug. */}
          {weather?.location.city && (
            <div
              className={cx(tokens.dashboardHeader.weatherBadge, tokens.text.accent, "min-w-0")}
              title={weather.location.city}
            >
              <MapPin size={12} className="shrink-0" />
              <span className="truncate">{weather.location.city}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <WeatherDebugToggle value={debugOverride} onChange={setDebugOverride} />

          <button
            type="button"
            onClick={() => navigate("/settings/profile")}
            aria-label={t("dashboard.open_profile")}
            title={t("dashboard.open_profile")}
            className="relative shrink-0"
          >
            <div
              className={cx(
                "w-8 h-8 rounded-full flex items-center justify-center overflow-hidden text-xs font-bold",
                tokens.dashboardHeader.avatarRing,
                !currentUser.avatar_url && tokens.dashboardHeader.avatarFallback
              )}
            >
              {currentUser.avatar_url ? (
                <img
                  src={currentUser.avatar_url}
                  alt={currentUser.display_name}
                  className="w-full h-full object-cover"
                />
              ) : (
                initial
              )}
            </div>

            {/* Titik status sync Bot Telegram -- menggantikan banner sync
                permanen versi lama. Detail lengkap (waktu sync terakhir)
                bisa dilihat di Pengaturan > Telegram, jadi tidak perlu
                diulang di sini; title/aria-label cukup untuk pembaca
                layar. */}
            {telegramStatus.linked && (
              <span
                className={cx(
                  "absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full flex items-center justify-center",
                  tokens.surface.card
                )}
                title={
                  telegramStatus.lastSync
                    ? t("settings.telegram_last_sync", { time: telegramStatus.lastSync })
                    : t("settings.telegram_sync_status")
                }
              >
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span className="sr-only">
                  <Send size={8} />
                  {t("settings.telegram_sync_status")}
                </span>
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Baris bawah: sapaan besar ala iOS Large Title. Boleh wrap sampai
          2 baris (line-clamp-2) untuk nama panjang -- tidak dipotong paksa
          jadi "...". */}
      <h1
        className={cx(
          "mt-2.5 font-sans font-extrabold text-[26px] leading-[1.15] tracking-tight line-clamp-2",
          tokens.text.primary
        )}
      >
        {t(getGreetingKey(), { name: currentUser.display_name })}
      </h1>

      {currentUser.is_guest && (
        <span
          className={cx(
            "inline-flex items-center gap-1 mt-2 px-2 py-0.5 rounded-full text-[10px] font-semibold",
            "bg-amber-500/10 border border-amber-500/20 text-amber-500"
          )}
        >
          <Info size={10} />
          {t("auth.guest_badge")}
        </span>
      )}
    </div>
  );
};