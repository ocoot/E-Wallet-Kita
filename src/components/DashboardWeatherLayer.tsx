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

/**
 * Noise tipis (SVG feTurbulence sebagai data-URI, statis/tidak dianimasikan
 * supaya ringan) untuk memberi kesan grain/tekstur foto seperti aplikasi
 * cuaca asli, dipadu mix-blend-mode 'overlay' di atas blob awan.
 */
const NOISE_DATA_URI =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'>" +
      "<filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/></filter>" +
      "<rect width='100%' height='100%' filter='url(%23n)'/></svg>"
  );

interface CloudBlobConfig {
  top: string;
  left: string;
  width: number;
  height: number;
  radius: string;
  rotate: number;
  opacity: number;
  blurPx: number;
  dur: string;
  delay: string;
  driftX: string;
  driftY: string;
  tintIndex: number;
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
      return { count: 3, maxOpacity: 0.26, blurFar: 26, blurNear: 16, sizeBoost: 0.85 };
    case "drizzle":
      return { count: 4, maxOpacity: 0.38, blurFar: 24, blurNear: 14, sizeBoost: 1 };
    case "cloudy":
      return { count: 5, maxOpacity: 0.46, blurFar: 22, blurNear: 12, sizeBoost: 1.15 };
    case "rain":
      return { count: 5, maxOpacity: 0.5, blurFar: 22, blurNear: 12, sizeBoost: 1.2 };
    case "thunderstorm":
      return { count: 5, maxOpacity: 0.54, blurFar: 20, blurNear: 11, sizeBoost: 1.25 };
    default:
      return { count: 3, maxOpacity: 0.26, blurFar: 26, blurNear: 16, sizeBoost: 0.85 };
  }
}

/** 2 warna tint per kondisi supaya blob-nya tidak monoton satu warna datar. */
function getCloudTints(condition: WeatherCondition, isDay: boolean): [string, string] {
  switch (condition) {
    case "cloudy":
      return ["rgba(226,232,240,0.9)", "rgba(100,116,139,0.75)"];
    case "drizzle":
      return ["rgba(191,209,229,0.85)", "rgba(85,104,133,0.75)"];
    case "rain":
      return ["rgba(148,163,184,0.75)", "rgba(42,58,84,0.85)"];
    case "thunderstorm":
      return ["rgba(129,140,168,0.7)", "rgba(24,29,52,0.9)"];
    case "partly_cloudy":
    default:
      return isDay
        ? ["rgba(255,255,255,0.9)", "rgba(203,213,225,0.6)"]
        : ["rgba(199,210,254,0.35)", "rgba(71,85,105,0.5)"];
  }
}

/**
 * Overlay animasi di belakang welcome banner Dashboard. Murni dekoratif
 * (aria-hidden) -- tidak pernah menghalangi interaksi (pointer-events-none)
 * dan otomatis nonaktif saat prefers-reduced-motion (lihat index.css).
 *
 * Awan digambar sebagai beberapa blob raksasa berbentuk organik (border-radius
 * asimetris) yang sangat blur & bertumpuk transparan -- bukan kluster
 * lingkaran kecil bergaya kartun -- supaya terasa seperti "kabut/asap"
 * atmosferik ala aplikasi cuaca native (Google/Apple Weather).
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
  const [tintA, tintB] = getCloudTints(condition, isDay);

  // Blob-blob awan raksasa, disebar dengan sedikit lapisan kedalaman: yang
  // "jauh" lebih kecil, lebih transparan, lebih blur & lambat; yang "dekat"
  // lebih besar, lebih pekat, lebih tajam & sedikit lebih cepat.
  const blobs = useMemo(() => {
    const density = getCloudDensity(condition);
    const total = density.count;

    return Array.from({ length: total }, (_, i) => {
      const depth = i / Math.max(total - 1, 1);
      const r1 = seededRandom(i + 1);
      const r2 = seededRandom(i + 31);
      const r3 = seededRandom(i + 61);
      const r4 = seededRandom(i + 91);
      const r5 = seededRandom(i + 121);

      const baseSize = lerp(160, 320, r2) * density.sizeBoost;

      return {
        top: `${(lerp(-15, 55, depth) + (r1 - 0.5) * 20).toFixed(1)}%`,
        left: `${(r2 * 110 - 15).toFixed(1)}%`,
        width: baseSize,
        height: baseSize * lerp(0.45, 0.7, r3),
        radius: `${40 + r1 * 30}% ${60 - r1 * 20}% ${50 + r4 * 20}% ${45 - r4 * 15}% / ${55 - r3 * 20}% ${45 + r3 * 15}% ${60 - r5 * 20}% ${40 + r5 * 20}%`,
        rotate: (r4 - 0.5) * 30,
        opacity: lerp(0.14, density.maxOpacity, depth),
        blurPx: lerp(density.blurFar, density.blurNear, depth),
        dur: `${lerp(46, 24, depth).toFixed(0)}s`,
        delay: `${(r5 * -30).toFixed(1)}s`,
        driftX: `${lerp(18, 46, depth).toFixed(0)}px`,
        driftY: `${lerp(6, 16, depth).toFixed(0)}px`,
        tintIndex: i % 2,
      } as CloudBlobConfig;
    });
  }, [condition]);

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 overflow-hidden rounded-3xl bg-gradient-to-br ${theme.gradientClass}`}
    >
      {/* Kilau matahari samar di balik awan -- hanya cerah berawan siang hari */}
      {sunRimEnabled && (
        <div className="weather-sun-glow absolute -top-10 right-8 w-32 h-32 rounded-full bg-amber-300/25 blur-3xl" />
      )}

      {showClouds && (
        <div className={`absolute inset-0 ${showThunder ? "weather-sheet-flash" : ""}`}>
          {blobs.map((b, i) => (
            <div
              key={i}
              className="weather-blob"
              style={
                {
                  top: b.top,
                  left: b.left,
                  width: b.width,
                  height: b.height,
                  borderRadius: b.radius,
                  background: `radial-gradient(ellipse at 35% 35%, ${b.tintIndex === 0 ? tintA : tintB}, transparent 72%)`,
                  opacity: b.opacity,
                  filter: `blur(${b.blurPx}px)`,
                  "--wx-dur": b.dur,
                  "--wx-delay": b.delay,
                  "--wx-driftx": b.driftX,
                  "--wx-drifty": b.driftY,
                  "--wx-rot-base": `${b.rotate}deg`,
                } as React.CSSProperties
              }
            />
          ))}

          {/* Grain halus di atas blob supaya terasa bertekstur, bukan gradient polos */}
          <div
            className="absolute inset-0 mix-blend-overlay"
            style={{ backgroundImage: `url("${NOISE_DATA_URI}")`, opacity: 0.06 }}
          />
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
        <div className="weather-sun-glow absolute -top-6 right-6 w-28 h-28 rounded-full bg-amber-300/30 blur-2xl" />
      )}
    </div>
  );
};
