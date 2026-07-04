import React, { useMemo } from "react";
import { WeatherCondition } from "../hooks/useWeather";
import { getWeatherTheme } from "../lib/weatherTheme";

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

interface CloudPuffConfig {
  top: string;
  left: string;
  scale: number;
  opacity: number;
  dur: string;
  delay: string;
  blurPx: number;
  driftPx: number;
}

/**
 * Awan "puff" yang disusun dari beberapa lingkaran bertumpuk (teknik klasik
 * CSS cumulus cloud) alih-alih ikon outline -- jauh lebih menyerupai awan
 * asli karena punya volume & bayangan lembut, bukan sekadar garis kontur.
 */
const CloudPuff: React.FC<{ tint: string; blurPx: number }> = ({ tint, blurPx }) => {
  // Ukuran dasar 1x, di-scale oleh transform pada wrapper pemanggil.
  return (
    <div
      className="relative"
      style={{
        width: 96,
        height: 40,
        filter: `blur(${blurPx}px) drop-shadow(0 6px 10px rgba(0,0,0,0.18))`,
      }}
    >
      <div className="absolute left-1 bottom-0 rounded-full" style={{ width: 88, height: 24, background: tint }} />
      <div className="absolute rounded-full" style={{ width: 30, height: 30, left: 4, bottom: 10, background: tint }} />
      <div className="absolute rounded-full" style={{ width: 40, height: 40, left: 22, bottom: 14, background: tint }} />
      <div className="absolute rounded-full" style={{ width: 34, height: 34, left: 48, bottom: 12, background: tint }} />
      <div className="absolute rounded-full" style={{ width: 24, height: 24, left: 70, bottom: 6, background: tint }} />
    </div>
  );
};

/**
 * Overlay animasi di belakang welcome banner Dashboard. Murni dekoratif
 * (aria-hidden) -- tidak pernah menghalangi interaksi (pointer-events-none)
 * dan otomatis nonaktif saat prefers-reduced-motion (lihat index.css).
 */
export const DashboardWeatherLayer: React.FC<DashboardWeatherLayerProps> = ({ condition, isDay }) => {
  const theme = getWeatherTheme(condition, isDay);

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

  // Awan disusun 3 lapis "kedalaman" (parallax): lapis belakang kecil, redup,
  // lambat & tinggi; lapis depan besar, lebih pekat, cepat & rendah. Ini yang
  // bikin kesan volume/jarak, bukan cuma tempelan ikon rata.
  const clouds = useMemo(() => {
    const isOvercast = condition === "cloudy";
    const total = isOvercast ? 6 : 4;

    return Array.from({ length: total }, (_, i) => {
      const depth = i / Math.max(total - 1, 1); // 0 = paling jauh, 1 = paling dekat
      const r1 = seededRandom(i + 1);
      const r2 = seededRandom(i + 31);
      const r3 = seededRandom(i + 61);

      return {
        top: `${lerp(6, 46, depth) + (r1 - 0.5) * 8}%`,
        left: `${(r2 * 90 - 10).toFixed(1)}%`,
        scale: lerp(0.45, 1.05, depth) * (isOvercast ? 1.15 : 1),
        opacity: lerp(0.12, isOvercast ? 0.4 : 0.3, depth),
        dur: `${lerp(34, 16, depth).toFixed(0)}s`,
        delay: `${(r3 * -20).toFixed(1)}s`,
        blurPx: lerp(3, 0.5, depth),
        driftPx: lerp(14, 34, depth),
      } as CloudPuffConfig;
    });
  }, [condition]);

  const fogBands = useMemo(
    () =>
      Array.from({ length: 3 }, (_, i) => ({
        top: `${20 + i * 25}%`,
        dur: `${10 + i * 3}s`,
        delay: `${i * 1.5}s`,
      })),
    []
  );

  // Tint awan menyesuaikan waktu & kepadatan cuaca supaya terasa "milik"
  // langit saat itu -- putih hangat siang cerah, kelabu tebal saat overcast,
  // kebiruan redup di malam hari.
  const cloudTint = condition === "cloudy"
    ? "linear-gradient(to bottom, rgba(203,213,225,0.85), rgba(100,116,139,0.55))"
    : isDay
      ? "linear-gradient(to bottom, rgba(255,255,255,0.95), rgba(226,232,240,0.55))"
      : "linear-gradient(to bottom, rgba(199,210,254,0.4), rgba(100,116,139,0.35))";

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 overflow-hidden rounded-3xl bg-gradient-to-br ${theme.gradientClass}`}
    >
      {theme.particle === "rain" && (
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

      {theme.particle === "thunder" && (
        <>
          {raindrops.slice(0, 18).map((d, i) => (
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

      {theme.particle === "stars" && (
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

      {theme.particle === "clouds" && (
        <>
          {clouds.map((c, i) => (
            <div
              key={i}
              className="weather-cloud"
              style={
                {
                  top: c.top,
                  left: c.left,
                  opacity: c.opacity,
                  "--wx-dur": c.dur,
                  "--wx-delay": c.delay,
                  "--wx-drift": `${c.driftPx}px`,
                } as React.CSSProperties
              }
            >
              <div style={{ transform: `scale(${c.scale})`, transformOrigin: "left center" }}>
                <CloudPuff tint={cloudTint} blurPx={c.blurPx} />
              </div>
            </div>
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

      {theme.particle === "sun" && (
        <div
          className="weather-sun-glow absolute -top-6 right-6 w-28 h-28 rounded-full bg-amber-300/30 blur-2xl"
        />
      )}
    </div>
  );
};
