import React, { useMemo } from "react";
import { Cloud } from "lucide-react";
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

  const clouds = useMemo(
    () =>
      Array.from({ length: 3 }, (_, i) => ({
        top: `${8 + i * 22}%`,
        size: 40 + i * 18,
        dur: `${16 + i * 6}s`,
        delay: `${i * 2}s`,
        opacity: 0.12 + i * 0.04,
        right: `${5 + i * 15}%`,
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
            <Cloud
              key={i}
              className="weather-cloud text-white"
              style={
                {
                  top: c.top,
                  right: c.right,
                  width: c.size,
                  height: c.size,
                  opacity: c.opacity,
                  "--wx-dur": c.dur,
                  "--wx-delay": c.delay,
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

      {theme.particle === "sun" && (
        <div
          className="weather-sun-glow absolute -top-6 right-6 w-28 h-28 rounded-full bg-amber-300/30 blur-2xl"
        />
      )}
    </div>
  );
};
