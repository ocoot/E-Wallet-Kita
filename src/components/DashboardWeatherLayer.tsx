import React, { useMemo, useState } from "react";
import { WeatherCondition } from "../hooks/useWeather";
import { getWeatherTheme } from "../lib/weatherTheme";
import { getLottieIconSlug } from "../lib/lottieWeather";
import { LottieWeatherIcon } from "./LottieWeatherIcon";

interface DashboardWeatherLayerProps {
  condition: WeatherCondition;
  isDay: boolean;
}

/** Angka acak deterministik per-index supaya posisi partikel stabil selama komponen tidak remount */
function seededRandom(seed: number): number {
  const x = Math.sin(seed * 999) * 10000;
  return x - Math.floor(x);
}

function lerp(min: number, max: number, t: number): number {
  return min + (max - min) * t;
}

/**
 * Noise tipis (SVG feTurbulence sebagai data-URI, statis/tidak dianimasikan
 * supaya ringan) untuk memberi kesan grain/tekstur foto seperti aplikasi
 * cuaca asli, dipadu mix-blend-mode 'overlay' di atas awan.
 */
const NOISE_DATA_URI =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'>" +
      "<filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/></filter>" +
      "<rect width='100%' height='100%' filter='url(%23n)'/></svg>"
  );

interface CloudInstanceConfig {
  top: string;
  left: string;
  width: number;
  height: number;
  rotate: number;
  opacity: number;
  blurPx: number;
  dur: string;
  delay: string;
  driftPx: number;
}

interface CloudDensity {
  count: number;
  maxOpacity: number;
  blurFar: number;
  blurNear: number;
  sizeBoost: number;
}

/** Seberapa banyak & seberapa "tebal" lapisan awan sesuai kondisi -- mendung/hujan/petir jauh lebih padat & gelap daripada sekadar cerah berawan. */
function getCloudDensity(condition: WeatherCondition): CloudDensity {
  switch (condition) {
    case "partly_cloudy":
      return { count: 3, maxOpacity: 0.85, blurFar: 3.5, blurNear: 1, sizeBoost: 0.85 };
    case "drizzle":
      return { count: 4, maxOpacity: 0.9, blurFar: 3, blurNear: 0.8, sizeBoost: 1 };
    case "cloudy":
      return { count: 5, maxOpacity: 0.94, blurFar: 2.5, blurNear: 0.6, sizeBoost: 1.15 };
    case "rain":
      return { count: 5, maxOpacity: 0.95, blurFar: 2.5, blurNear: 0.6, sizeBoost: 1.2 };
    case "thunderstorm":
      return { count: 5, maxOpacity: 0.96, blurFar: 2.2, blurNear: 0.5, sizeBoost: 1.25 };
    default:
      return { count: 3, maxOpacity: 0.85, blurFar: 3.5, blurNear: 1, sizeBoost: 0.85 };
  }
}

/** Warna terang (puncak, kena cahaya) & gelap (dasar, bayangan) per kondisi -- dipakai sebagai 2 stop linear-gradient vertikal supaya awan punya kesan volume, bukan flat. */
function getCloudShades(condition: WeatherCondition, isDay: boolean): [string, string] {
  switch (condition) {
    case "cloudy":
      return ["#E7ECF2", "#5B6B82"];
    case "drizzle":
      return ["#CBDAEA", "#4E6180"];
    case "rain":
      return ["#9FB0C4", "#2E3B54"];
    case "thunderstorm":
      return ["#8D93BE", "#171A2E"];
    case "partly_cloudy":
    default:
      return isDay ? ["#FFFFFF", "#C3CEDD"] : ["#C9D3F5", "#3D4863"];
  }
}

/**
 * Awan digambar sebagai SVG: beberapa ellipse yang menyatu jadi satu siluet
 * puffy, diwarnai satu `linearGradient` vertikal (terang di puncak -> gelap
 * di dasar) supaya terasa punya volume/3D seperti widget cuaca native
 * (iOS/Google Weather), bukan blob CSS datar. Blur & drop-shadow diterapkan
 * SEKALI di level grup lewat CSS filter pada wrapper -- bukan per-bentuk --
 * supaya siluetnya tetap jelas, tidak luntur jadi kabut.
 */
const CloudShape: React.FC<{
  lightShade: string;
  darkShade: string;
  sunRim?: boolean;
  blurPx: number;
}> = ({ lightShade, darkShade, sunRim, blurPx }) => {
  const [uid] = useState(() => Math.random().toString(36).slice(2, 9));
  const gradId = `wx-cloud-grad-${uid}`;
  const rimId = `wx-cloud-rim-${uid}`;

  return (
    <svg
      viewBox="0 0 100 46"
      width="100%"
      height="100%"
      style={{ filter: `blur(${blurPx}px) drop-shadow(0 5px 7px rgba(10,14,26,0.28))`, display: "block" }}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={lightShade} />
          <stop offset="100%" stopColor={darkShade} />
        </linearGradient>
        {sunRim && (
          <radialGradient id={rimId} cx="72%" cy="18%" r="55%">
            <stop offset="0%" stopColor="rgba(255,231,160,0.95)" />
            <stop offset="100%" stopColor="rgba(255,231,160,0)" />
          </radialGradient>
        )}
      </defs>
      <g fill={`url(#${gradId})`}>
        <ellipse cx="30" cy="34" rx="26" ry="15" />
        <ellipse cx="49" cy="23" rx="21" ry="19" />
        <ellipse cx="69" cy="29" rx="19" ry="14" />
        <ellipse cx="17" cy="36" rx="13" ry="9" />
        <ellipse cx="84" cy="33" rx="12" ry="8.5" />
      </g>
      {sunRim && <ellipse cx="64" cy="14" rx="24" ry="13" fill={`url(#${rimId})`} style={{ mixBlendMode: "screen" }} />}
    </svg>
  );
};

/**
 * Overlay animasi di belakang welcome banner Dashboard. Murni dekoratif
 * (aria-hidden) -- tidak pernah menghalangi interaksi (pointer-events-none)
 * dan otomatis nonaktif saat prefers-reduced-motion (lihat index.css).
 *
 * Prioritas render: ikon Lottie (Meteocons, hand-animated, fetch dari CDN
 * saat runtime) kalau berhasil dimuat -> fallback ke awan SVG generative di
 * bawah ini kalau gagal (mis. offline / CDN diblokir jaringan preview).
 */
export const DashboardWeatherLayer: React.FC<DashboardWeatherLayerProps> = ({ condition, isDay }) => {
  const theme = getWeatherTheme(condition, isDay);

  // Ikon "hero" Lottie -- di-fetch runtime dari CDN resmi Meteocons. Kalau
  // gagal (mis. sandbox preview tanpa akses internet keluar) atau kombinasi
  // kondisi+waktu belum ada pemetaan yang dikonfirmasi, otomatis fallback ke
  // cluster awan SVG generative di bawah (selalu tersedia, tanpa network).
  const lottieSlug = getLottieIconSlug(condition, isDay);
  const [failedSlug, setFailedSlug] = useState<string | null>(null);
  const lottieAvailable = Boolean(lottieSlug) && lottieSlug !== failedSlug;

  const raindrops = useMemo(
    () =>
      Array.from({ length: 26 }, (_, i) => ({
        left: `${(seededRandom(i) * 100).toFixed(1)}%`,
        h: `${12 + seededRandom(i + 50) * 14}px`,
        dur: `${0.7 + seededRandom(i + 100) * 0.6}s`,
        delay: `${seededRandom(i + 150) * 1.5}s`,
      })),
    []
  );

  const drizzleDrops = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => ({
        left: `${(seededRandom(i + 400) * 100).toFixed(1)}%`,
        h: `${8 + seededRandom(i + 450) * 8}px`,
        dur: `${0.6 + seededRandom(i + 500) * 0.5}s`,
        delay: `${seededRandom(i + 550) * 1.5}s`,
      })),
    []
  );

  const snowflakes = useMemo(
    () =>
      Array.from({ length: 22 }, (_, i) => ({
        left: `${(seededRandom(i) * 100).toFixed(1)}%`,
        size: `${3 + seededRandom(i + 50) * 4}px`,
        dur: `${5 + seededRandom(i + 100) * 5}s`,
        delay: `${seededRandom(i + 150) * 5}s`,
        drift: `${(seededRandom(i + 200) - 0.5) * 60}px`,
      })),
    []
  );

  const stars = useMemo(
    () =>
      Array.from({ length: 18 }, (_, i) => ({
        left: `${(seededRandom(i) * 100).toFixed(1)}%`,
        top: `${(seededRandom(i + 50) * 60).toFixed(1)}%`,
        size: `${1 + seededRandom(i + 100) * 2}px`,
        dur: `${2 + seededRandom(i + 150) * 3}s`,
        delay: `${seededRandom(i + 200) * 3}s`,
      })),
    []
  );

  const fogBands = useMemo(
    () =>
      Array.from({ length: 3 }, (_, i) => ({
        top: `${20 + i * 25}%`,
        dur: `${10 + i * 3}s`,
        delay: `${i * 1.5}s`,
      })),
    []
  );

  const showClouds = ["partly_cloudy", "cloudy", "drizzle", "rain", "thunderstorm"].includes(condition);
  const showThunder = condition === "thunderstorm";
  const sunRimEnabled = condition === "partly_cloudy" && isDay;
  const [lightShade, darkShade] = getCloudShades(condition, isDay);

  const clouds = useMemo(() => {
    const density = getCloudDensity(condition);
    const total = density.count;

    return Array.from({ length: total }, (_, i) => {
      const depth = i / Math.max(total - 1, 1);
      const r1 = seededRandom(i + 1);
      const r2 = seededRandom(i + 31);
      const r3 = seededRandom(i + 61);
      const r4 = seededRandom(i + 91);
      const r5 = seededRandom(i + 121);

      const baseWidth = lerp(90, 190, r2) * density.sizeBoost;

      return {
        top: `${(lerp(2, 48, depth) + (r1 - 0.5) * 16).toFixed(1)}%`,
        left: `${(r2 * 70 - 5).toFixed(1)}%`,
        width: baseWidth,
        height: baseWidth * 0.46,
        rotate: (r4 - 0.5) * 8,
        opacity: lerp(0.35, density.maxOpacity, depth),
        blurPx: lerp(density.blurFar, density.blurNear, depth),
        dur: `${lerp(52, 30, depth).toFixed(0)}s`,
        delay: `${(r5 * -40).toFixed(1)}s`,
        driftPx: lerp(60, 110, depth),
      } as CloudInstanceConfig;
    });
  }, [condition]);

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 overflow-hidden rounded-3xl bg-gradient-to-br ${theme.gradientClass}`}
    >
      {/* Kilau matahari samar di balik awan -- hanya cerah berawan siang hari,
          dan hanya saat pakai render SVG fallback (ikon Lottie
          partly-cloudy-day sudah menggambar cahaya mataharinya sendiri) */}
      {sunRimEnabled && !lottieAvailable && (
        <div className="weather-sun-glow absolute -top-10 right-8 w-32 h-32 rounded-full bg-amber-300/25 blur-3xl" />
      )}

      {/* Ikon "hero" Lottie -- hand-animated, jauh lebih detail daripada
          render SVG generative kita. Kalau gagal dimuat (lihat komentar di
          atas), otomatis lewat ke blok showClouds di bawah. */}
      {lottieAvailable && lottieSlug && (
        <LottieWeatherIcon
          key={lottieSlug}
          slug={lottieSlug}
          size={132}
          className="absolute top-1/2 right-3 md:right-8 -translate-y-1/2 opacity-90 drop-shadow-[0_10px_16px_rgba(0,0,0,0.35)]"
          onError={() => setFailedSlug(lottieSlug)}
        />
      )}

      {showClouds && !lottieAvailable && (
        <div className={`absolute inset-0 ${showThunder ? "weather-sheet-flash" : ""}`}>
          {clouds.map((c, i) => (
            <div
              key={i}
              className="weather-blob"
              style={
                {
                  top: c.top,
                  left: c.left,
                  width: c.width,
                  height: c.height,
                  "--wx-dur": c.dur,
                  "--wx-delay": c.delay,
                  "--wx-driftx": `${c.driftPx}px`,
                  "--wx-rot-base": `${c.rotate}deg`,
                  "--wx-op": c.opacity,
                } as React.CSSProperties
              }
            >
              <CloudShape
                lightShade={lightShade}
                darkShade={darkShade}
                blurPx={c.blurPx}
                sunRim={sunRimEnabled && i % 2 === 0}
              />
            </div>
          ))}
        </div>
      )}

      {condition === "drizzle" && (
        <>
          {drizzleDrops.map((d, i) => (
            <span
              key={i}
              className="weather-raindrop"
              style={
                {
                  "--wx-left": d.left,
                  "--wx-h": d.h,
                  "--wx-dur": d.dur,
                  "--wx-delay": d.delay,
                } as React.CSSProperties
              }
            />
          ))}
        </>
      )}

      {(condition === "rain" || condition === "thunderstorm") && (
        <>
          {raindrops.map((d, i) => (
            <span
              key={i}
              className="weather-raindrop"
              style={
                {
                  "--wx-left": d.left,
                  "--wx-h": d.h,
                  "--wx-dur": d.dur,
                  "--wx-delay": d.delay,
                } as React.CSSProperties
              }
            />
          ))}
        </>
      )}

      {/* Kilatan menyeluruh -- menerangi seluruh banner sesaat, melengkapi kilau lapisan awan */}
      {showThunder && (
        <>
          <div className="weather-lightning" style={{ "--wx-delay": "0.5s" } as React.CSSProperties} />
          <div className="weather-lightning" style={{ "--wx-delay": "3.2s" } as React.CSSProperties} />
        </>
      )}

      {theme.particle === "snow" && (
        <>
          {snowflakes.map((s, i) => (
            <span
              key={i}
              className="weather-snowflake"
              style={
                {
                  "--wx-left": s.left,
                  "--wx-size": s.size,
                  "--wx-dur": s.dur,
                  "--wx-delay": s.delay,
                  "--wx-drift": s.drift,
                } as React.CSSProperties
              }
            />
          ))}
        </>
      )}

      {theme.particle === "stars" && !lottieAvailable && (
        <>
          {stars.map((s, i) => (
            <span
              key={i}
              className="weather-star"
              style={
                {
                  left: s.left,
                  top: s.top,
                  width: s.size,
                  height: s.size,
                  "--wx-dur": s.dur,
                  "--wx-delay": s.delay,
                } as React.CSSProperties
              }
            />
          ))}
        </>
      )}

      {theme.particle === "fog" && (
        <>
          {fogBands.map((f, i) => (
            <div
              key={i}
              className="weather-fog-band left-0 right-0 h-10 bg-white/10 blur-xl"
              style={{ top: f.top, "--wx-dur": f.dur, "--wx-delay": f.delay } as React.CSSProperties}
            />
          ))}
        </>
      )}

      {theme.particle === "sun" && !lottieAvailable && (
        <div className="weather-sun-glow absolute -top-6 right-6 w-28 h-28 rounded-full bg-amber-300/30 blur-2xl" />
      )}

      {/* Grain halus di seluruh layer -- tetap ada baik saat pakai hero
          Lottie maupun fallback SVG, supaya teksturnya konsisten. */}
      <div
        className="absolute inset-0 mix-blend-overlay"
        style={{ backgroundImage: `url("${NOISE_DATA_URI}")`, opacity: 0.05 }}
      />
    </div>
  );
};
