import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "../contexts/LanguageContext";
import { UserSession } from "../types";
import { Send, Info, MapPin } from "lucide-react";
import { BADGE_SIZE_CLASSES } from "./ui/Badge";
import { useWeather } from "../hooks/useWeather";
import { getWeatherTheme } from "../lib/weatherTheme";
import { WeatherDebugToggle, WeatherDebugOverride } from "./WeatherDebugToggle";
import { useThemeTokens } from "../hooks/useThemeTokens";
import { RIBBON_GRADIENT_CLASS, RIBBON_HEIGHT, RibbonWaveEdge } from "./PageRibbonBackground";

interface DashboardHeaderProps {
  currentUser: UserSession;
  telegramStatus: { linked: boolean; lastSync: string | null };
}

/**
 * FIX (permintaan user, Agu 2026): sebelumnya di breakpoint desktop
 * (>=lg) yang di-`lg:hidden`-kan cuma lengkung wave-nya (`<RibbonWaveEdge>`
 * di bawah) -- gradient ribbon-nya sendiri TETAP tampil penuh (ini memang
 * disengaja waktu Sesi 55, lihat komentar arsitektur di atas komponen,
 * tapi ternyata bukan yang diinginkan). Sekarang ribbon di-hide TOTAL di
 * desktop, diganti flat solid = warna `tokens.surface.canvas` biasa.
 *
 * Konsekuensinya: semua elemen anak yang tadinya sengaja "frosted white"
 * (chip cuaca/lokasi, avatar, badge guest -- lihat komentar poin 4 di
 * atas) HARUS di-override juga di breakpoint lg, karena frosted-white
 * cuma kebaca kalau ada background gradient warna di baliknya. Di atas
 * canvas flat (apalagi di light_sakura yang canvasnya nyaris putih),
 * putih transparan jadi nge-blend/invisible. Override ini TIDAK mengubah
 * struktur/konten (posisi, urutan, teks tetap sama) -- cuma warna, dan
 * cuma aktif di lg ke atas.
 *
 * `lg:bg-none` dipakai untuk mematikan `background-image` (gradient),
 * lalu `bg-slate-950`/`rose-50/20` mengisi `background-color`-nya --
 * dua properti CSS terpisah, jadi tanpa `bg-none` warna solidnya akan
 * tertutup gradient yang masih ada di lapisan atasnya.
 */
const DESKTOP_FLAT_RIBBON_BG =
  "lg:bg-none light_sakura:lg:bg-none lg:bg-slate-950 light_sakura:lg:bg-rose-50/20";
/** Chip cuaca/lokasi & badge guest di desktop: setara `surface.sunken` + `border.default` + `text.muted`. */
const DESKTOP_FLAT_CHIP =
  "lg:bg-slate-950/40 lg:border-slate-800 lg:text-slate-400 light_sakura:lg:bg-rose-50/60 light_sakura:lg:border-slate-100 light_sakura:lg:text-slate-500";
/** Sapaan `<h1>`: putih tetap kontras di dark (canvas gelap), tapi HARUS gelap di light_sakura (canvas nyaris putih). */
const DESKTOP_FLAT_HEADING_TEXT = "light_sakura:lg:text-slate-900";
/** Ring avatar: setara `border.default`. */
const DESKTOP_FLAT_AVATAR_RING = "lg:ring-slate-800 light_sakura:lg:ring-slate-100";
/** Fallback inisial avatar (tanpa foto profil): setara `surface.subtle` + `text.secondary`. */
const DESKTOP_FLAT_AVATAR_FALLBACK =
  "lg:bg-slate-800 lg:text-slate-300 light_sakura:lg:bg-slate-50 light_sakura:lg:text-slate-600";
/** Ring kecil di belakang titik status Telegram: setara `surface.card`, supaya tetap "memotong" bersih dari canvas di baliknya (lihat komentar aslinya di render JSX). */
const DESKTOP_FLAT_AVATAR_STATUS_RING = "lg:bg-slate-900 light_sakura:lg:bg-white";

/**
 * Sesi 55 -- Redesign "Double Wave (Ribbon)" (lihat mockup
 * `wave-mockups-themed.html`, varian 03), menggantikan "Varian A -- Minimal
 * Utility Topbar" flat dari sesi 54.
 *
 * REVISI (unifikasi sumber ribbon): gradient & wave sebelumnya duplikat
 * manual dari `PageRibbonBackground.tsx` (token `tokens.dashboardHeader.
 * heroGradient`/`waveFill`, sudah dihapus dari tokens.ts). Sekarang keduanya
 * diimpor langsung dari sana (`RIBBON_GRADIENT_CLASS`, `<RibbonWaveEdge>`) --
 * SATU sumber kebenaran untuk seluruh app. Dashboard tetap TIDAK memakai
 * hook `usePageRibbonBackground()` (pendekatan background-image tanpa
 * konten) karena hero ini perlu membungkus konten (avatar/sapaan/chip) &
 * tinggi dinamis -- lihat komentar arsitektur lengkap di
 * `PageRibbonBackground.tsx`.
 *
 * Sebelumnya komponen ini adalah topbar flat 2 baris dipisah hairline
 * 1px, tanpa warna/gradient sama sekali. Sekarang jadi hero penuh warna:
 *  - Background gradient (`RIBBON_GRADIENT_CLASS`, mint-teal di
 *    dark_obsidian / jade di light_sakura), bleed penuh sampai tepi layar
 *    (negative margin melawan padding `<main>` di App.tsx) supaya terasa
 *    seperti header native, bukan kartu di dalam halaman.
 *  - Lengkung ganda (`<RibbonWaveEdge>`, path sama persis dengan ribbon
 *    halaman lain) di tepi bawah, fill-nya = warna canvas halaman supaya
 *    menyatu mulus ke konten di bawahnya.
 *  - Semua elemen di dalam hero (chip cuaca/lokasi, tombol debug, avatar)
 *    dipindah ke gaya "frosted white" seragam di kedua tema -- karena
 *    background sekarang SELALU gradient warna, bukan lagi canvas polos
 *    yang beda kontras per tema seperti versi flat sebelumnya.
 *  - Avatar dipindah jadi absolut di pojok kanan-atas (ikut posisi mockup),
 *    terpisah dari baris chip supaya chip lokasi yang panjang tidak
 *    mendorongnya.
 *
 * Chip lokasi tetap pakai `weather.location.city` (BUKAN dari
 * `debugOverride`, karena override cuma preview kondisi cuaca/siang-malam,
 * bukan lokasi) -- perilaku ini tidak berubah dari versi sebelumnya.
 *
 * Titik hijau kecil di sudut avatar tetap menandakan status sinkron Bot
 * Telegram (dari `telegramStatus.linked`).
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
      // Ribbon hijau sekarang dibuat lebih "memanjang" ke bawah (pb-20/24,
      // sebelumnya pb-11/14) supaya area gradiennya menjorok sampai ke
      // belakang Kartu Pos Dompet "Saldo Anda" -- lalu kartu tersebut
      // ditarik naik lewat margin-bottom negatif (-mb-14/-16, sebelumnya
      // mb-4 positif) sehingga secara visual terlihat "duduk" di atas
      // ribbon, bukan lagi menempel di bawahnya dengan jarak putih polos.
      className="relative -mx-4 -mt-4 sm:-mx-6 sm:-mt-6 lg:-mx-8 lg:-mt-8 -mb-14 sm:-mb-16"
    >
      <div
        className={cx(
          "relative pt-5 sm:pt-6 px-4 sm:px-6 lg:px-8 pb-20 sm:pb-24",
          RIBBON_GRADIENT_CLASS,
          DESKTOP_FLAT_RIBBON_BG
        )}
        // Dipin ke `RIBBON_HEIGHT` (220px, sama dengan tinggi ribbon
        // background-image di semua halaman lain -- lihat
        // `usePageRibbonBackground` di PageRibbonBackground.tsx) supaya
        // area gradient Dashboard TIDAK PERNAH lebih pendek dari standar,
        // meskipun kontennya sedikit (nama pendek, bukan guest). `min-height`
        // (bukan `height` fix) sengaja dipakai supaya kalau kontennya lebih
        // tinggi dari 220px (mis. nama 2 baris + badge guest sekaligus),
        // hero tetap boleh melar mengikuti konten alih-alih memotongnya.
        style={{ minHeight: RIBBON_HEIGHT }}
      >
        {/* Baris atas: status cluster. Kiri = chip cuaca + chip lokasi kota
            (flex-1 min-w-0 + overflow-hidden supaya nama kota panjang
            truncate rapi), disisakan ruang kanan (pr-12) supaya tidak
            tertutup avatar yang sekarang absolut di pojok kanan-atas. */}
        <div className="flex items-center gap-1.5 overflow-hidden pr-12">
          {weatherLoading && !debugOverride && (
            <div className={cx(tokens.dashboardHeader.weatherBadge, "animate-pulse shrink-0", DESKTOP_FLAT_CHIP)}>
              <span>{t("dashboard.weather_loading")}</span>
            </div>
          )}

          {effectiveWeather && weatherTheme && (
            <div className={cx(tokens.dashboardHeader.weatherBadge, "shrink-0", DESKTOP_FLAT_CHIP)}>
              <weatherTheme.icon size={12} className="shrink-0" />
              {!debugOverride && weather && <span>{weather.current.temperatureC}°C</span>}
              {debugOverride && (
                <span>{debugOverride.condition.replace(/_/g, " ")}</span>
              )}
            </div>
          )}

          {/* Chip lokasi kota -- sengaja baca `weather.location.city`
              langsung (bukan lewat `effectiveWeather`), karena lokasi bukan
              bagian dari preview debug. */}
          {weather?.location.city && (
            <div
              className={cx(tokens.dashboardHeader.weatherBadge, "min-w-0", DESKTOP_FLAT_CHIP)}
              title={weather.location.city}
            >
              <MapPin size={12} className="shrink-0" />
              <span className="truncate">{weather.location.city}</span>
            </div>
          )}

          {/* Tombol debug cuaca (dev only) -- ikut di baris chip supaya
              tidak berebut tempat dengan avatar yang sekarang absolut. */}
          <div className="shrink-0">
            <WeatherDebugToggle value={debugOverride} onChange={setDebugOverride} />
          </div>
        </div>

        {/* Avatar -- pindah jadi absolut di pojok kanan-atas, mengikuti
            posisi persis di mockup "Double Wave (Ribbon)". */}
        <button
          type="button"
          onClick={() => navigate("/settings/profile")}
          aria-label={t("dashboard.open_profile")}
          title={t("dashboard.open_profile")}
          className="absolute top-5 sm:top-6 right-4 sm:right-6 lg:right-8"
        >
          <div
            className={cx(
              "w-10 h-10 rounded-full flex items-center justify-center overflow-hidden text-xs font-bold",
              tokens.dashboardHeader.avatarRing,
              DESKTOP_FLAT_AVATAR_RING,
              !currentUser.avatar_url && tokens.dashboardHeader.avatarFallback,
              !currentUser.avatar_url && DESKTOP_FLAT_AVATAR_FALLBACK
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
                tokens.dashboardHeader.avatarStatusRing,
                DESKTOP_FLAT_AVATAR_STATUS_RING
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

        {/* Sapaan besar -- tetap boleh wrap sampai 2 baris (line-clamp-2)
            untuk nama panjang, sekarang putih di atas gradient (bukan lagi
            `tokens.text.primary`, karena background bukan canvas polos
            lagi). */}
        <h1 className={cx("mt-4 font-sans font-extrabold text-[26px] leading-[1.1] tracking-[-0.025em] line-clamp-2 text-white max-w-[75%]", DESKTOP_FLAT_HEADING_TEXT)}>
          {t(getGreetingKey(), { name: currentUser.display_name })}
        </h1>

        {currentUser.is_guest && (
          <span
            className={cx(
              "mt-2 rounded-full text-[10px] font-semibold",
              BADGE_SIZE_CLASSES.xs,
              tokens.dashboardHeader.guestBadge,
              DESKTOP_FLAT_CHIP
            )}
          >
            <Info size={10} />
            {t("auth.guest_badge")}
          </span>
        )}

        {/* Lengkung ganda (Double Wave / Ribbon) -- sekarang komponen SHARED
            `<RibbonWaveEdge>` dari `PageRibbonBackground.tsx`, path sama
            persis dengan ribbon di semua halaman lain (satu sumber
            kebenaran, bukan lagi duplikat manual di file ini). Fill tetap
            mengikuti warna canvas halaman via `currentColor` supaya lengkung
            menyatu mulus ke konten di bawah header.
            `lg:hidden` -- lengkung ini disembunyikan khusus di breakpoint
            desktop (>=1024px, sama seperti breakpoint Sidebar/
            MobileBottomNav di App.tsx/Sidebar.tsx), sementara di mobile &
            tablet (<1024px) lengkung tetap tampil seperti sebelumnya.
            UPDATE (lihat `DESKTOP_FLAT_RIBBON_BG` di atas): sekarang di
            desktop bukan cuma lengkungnya yang hilang, tapi seluruh
            gradient ribbon-nya juga sudah flat = warna canvas biasa --
            jadi `lg:hidden` di sini sekarang sebetulnya redundant (toh
            tidak ada lagi gradient buat "ditutup" lengkungannya), tapi
            tetap dipertahankan sebagai guard eksplisit/self-documenting
            daripada mengandalkan efek tak-terlihat dari warna yang sudah
            sama-sama flat. */}
        <RibbonWaveEdge className="absolute bottom-0 left-0 w-full h-9 sm:h-11 block lg:hidden" />
      </div>
    </div>
  );
};
