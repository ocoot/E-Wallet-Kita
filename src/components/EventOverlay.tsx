import React, { useMemo } from "react";
import type { OverlayType } from "../api/eventCalendar";

/**
 * Overlay partikel dekoratif untuk hari libur & event spesial.
 * Pola yang digunakan sama dengan partikel cuaca di DashboardWeatherLayer
 * (seededRandom + CSS custom properties), supaya performa tetap ringan.
 */

/* ── Seeded random (deterministik per-index, stabil antar render) ── */
function seededRandom(seed: number): number {
  const x = Math.sin(seed * 999) * 10000;
  return x - Math.floor(x);
}

/* ── Konfigurasi partikel per overlay type ── */

interface ParticleConfig {
  count: number;
  colors?: string[];
  sizeRange?: [number, number];
  durRange?: [number, number];
  /** Untuk seeded random offset */
  seedOffset: number;
}

const OVERLAY_CONFIGS: Record<OverlayType, ParticleConfig> = {
  confetti: {
    count: 40,
    colors: [
      "#f43f5e", "#eab308", "#22c55e", "#3b82f6",
      "#a855f7", "#ec4899", "#f97316", "#06b6d4",
    ],
    sizeRange: [6, 12],
    durRange: [2.5, 5],
    seedOffset: 0,
  },
  fireworks: {
    count: 5, // 5 titik ledakan
    colors: [
      "#fbbf24", "#fb923c", "#f472b6", "#818cf8",
      "#34d399", "#f87171",
    ],
    sizeRange: [4, 10],
    durRange: [3, 6],
    seedOffset: 1000,
  },
  hearts: {
    count: 20,
    colors: ["#f43f5e", "#fb7185", "#fda4af", "#e11d48", "#ff5e7d"],
    sizeRange: [16, 26],
    durRange: [4, 8],
    seedOffset: 2000,
  },
  sparkles: {
    count: 25,
    colors: ["#fef08a", "#fde047", "#facc15", "#fff", "#e2e8f0"],
    sizeRange: [3, 8],
    durRange: [1.5, 4],
    seedOffset: 3000,
  },
};

/* ── Sub-komponen partikel ── */

interface ParticleStyle extends React.CSSProperties {
  "--ev-dur"?: string;
  "--ev-delay"?: string;
  "--ev-driftx"?: string;
  "--ev-drifty"?: string;
  "--ev-rot"?: string;
  "--ev-size"?: string;
}

/* Confetti — kotak warna-warni */
const ConfettiParticle: React.FC<{
  left: string; color: string; w: number; h: number;
  dur: string; delay: string;
}> = ({ left, color, w, h, dur, delay }) => (
  <span
    className="event-particle-confetti"
    style={{
      left,
      width: w,
      height: h,
      backgroundColor: color,
      display: "block",
      "--ev-dur": dur,
      "--ev-delay": delay,
    } as ParticleStyle}
  />
);

/* Fireworks — lingkaran ledakan dari berbagai titik */
const FireworkBurst: React.FC<{
  left: string; top: string; delay: string; dur: string;
}> = ({ left, top, delay, dur }) => {
  // Setiap burst punya 8 partikel memancar
  const particles = useMemo(
    () =>
      Array.from({ length: 8 }, (_, i) => {
        const angle = (i / 8) * 360;
        const dist = 30 + seededRandom(i + 100) * 50;
        const rad = (angle * Math.PI) / 180;
        return {
          dx: `${Math.cos(rad) * dist}px`,
          dy: `${Math.sin(rad) * dist}px`,
          size: 3 + seededRandom(i + 200) * 4,
          colorIdx: Math.floor(seededRandom(i + 300) * OVERLAY_CONFIGS.fireworks.colors!.length),
        };
      }),
    []
  );

  return (
    <div className="event-firework" style={{ left, top, width: 1, height: 1 }}>
      <div
        className="event-firework-flash"
        style={{ "--ev-delay": delay, "--ev-dur": dur } as ParticleStyle}
      />
      {particles.map((p, i) => (
        <span
          key={i}
          style={{
            position: "absolute",
            width: p.size,
            height: p.size,
            borderRadius: "999px",
            backgroundColor: OVERLAY_CONFIGS.fireworks.colors![p.colorIdx],
            animation: `event-firework-burst ${dur} ease-out infinite`,
            animationDelay: delay,
            opacity: 0,
            "--ev-driftx": p.dx,
            "--ev-drifty": p.dy,
          } as ParticleStyle}
        />
      ))}
    </div>
  );
};

/* Hearts — emoji melayang */
const HeartParticle: React.FC<{
  left: string; size: number; dur: string; delay: string; rot: number;
}> = ({ left, size, dur, delay, rot }) => (
  <span
    className="event-particle-heart"
    style={{
      left,
      "--ev-size": `${size}px`,
      "--ev-dur": dur,
      "--ev-delay": delay,
      "--ev-rot": `${rot}deg`,
      position: "absolute",
    } as ParticleStyle}
  >
    ❤️
  </span>
);

/* Sparkles — titik gemerlap */
const SparkleParticle: React.FC<{
  left: string; top: string; size: number; color: string;
  dur: string; delay: string;
}> = ({ left, top, size, color, dur, delay }) => (
  <span
    className="event-particle-sparkle"
    style={{
      left,
      top,
      backgroundColor: color,
      boxShadow: `0 0 ${size * 2}px ${color}`,
      "--ev-size": `${size}px`,
      "--ev-dur": dur,
      "--ev-delay": delay,
    } as ParticleStyle}
  />
);

/* ── Komponen utama EventOverlay ── */

interface EventOverlayProps {
  type: OverlayType;
}

export const EventOverlay: React.FC<EventOverlayProps> = ({ type }) => {
  const config = OVERLAY_CONFIGS[type];

  const confettiParticles = useMemo(() => {
    if (type !== "confetti") return null;
    return Array.from({ length: config.count }, (_, i) => ({
      id: i,
      left: `${(seededRandom(i + config.seedOffset) * 100).toFixed(1)}%`,
      color: config.colors![Math.floor(seededRandom(i + 50) * config.colors!.length)],
      w: config.sizeRange![0] + seededRandom(i + 100) * (config.sizeRange![1] - config.sizeRange![0]),
      h: (config.sizeRange![0] + seededRandom(i + 150) * (config.sizeRange![1] - config.sizeRange![0])) * 1.3,
      dur: `${(config.durRange![0] + seededRandom(i + 200) * (config.durRange![1] - config.durRange![0])).toFixed(1)}s`,
      delay: `${(seededRandom(i + 250) * -3).toFixed(1)}s`,
    }));
  }, [type, config]);

  const fireworkBursts = useMemo(() => {
    if (type !== "fireworks") return null;
    return Array.from({ length: config.count }, (_, i) => ({
      id: i,
      left: `${(5 + seededRandom(i + config.seedOffset) * 90).toFixed(1)}%`,
      top: `${(5 + seededRandom(i + 50) * 70).toFixed(1)}%`,
      dur: `${(config.durRange![0] + seededRandom(i + 100) * (config.durRange![1] - config.durRange![0])).toFixed(1)}s`,
      delay: `${(seededRandom(i + 150) * -6).toFixed(1)}s`,
    }));
  }, [type, config]);

  const heartParticles = useMemo(() => {
    if (type !== "hearts") return null;
    return Array.from({ length: config.count }, (_, i) => ({
      id: i,
      left: `${(seededRandom(i + config.seedOffset) * 100).toFixed(1)}%`,
      size: config.sizeRange![0] + seededRandom(i + 50) * (config.sizeRange![1] - config.sizeRange![0]),
      dur: `${(config.durRange![0] + seededRandom(i + 100) * (config.durRange![1] - config.durRange![0])).toFixed(1)}s`,
      delay: `${(seededRandom(i + 150) * -4).toFixed(1)}s`,
      rot: (seededRandom(i + 200) - 0.5) * 30,
    }));
  }, [type, config]);

  const sparkleParticles = useMemo(() => {
    if (type !== "sparkles") return null;
    return Array.from({ length: config.count }, (_, i) => ({
      id: i,
      left: `${(seededRandom(i + config.seedOffset) * 100).toFixed(1)}%`,
      top: `${(seededRandom(i + 50) * 80).toFixed(1)}%`,
      size: config.sizeRange![0] + seededRandom(i + 100) * (config.sizeRange![1] - config.sizeRange![0]),
      color: config.colors![Math.floor(seededRandom(i + 150) * config.colors!.length)],
      dur: `${(config.durRange![0] + seededRandom(i + 200) * (config.durRange![1] - config.durRange![0])).toFixed(1)}s`,
      delay: `${(seededRandom(i + 250) * -2.5).toFixed(1)}s`,
    }));
  }, [type, config]);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl" aria-hidden="true">
      {/* Confetti */}
      {confettiParticles?.map((p) => (
        <ConfettiParticle key={p.id} {...p} />
      ))}

      {/* Fireworks */}
      {fireworkBursts?.map((b) => (
        <FireworkBurst key={b.id} {...b} />
      ))}

      {/* Hearts */}
      {heartParticles?.map((h) => (
        <HeartParticle key={h.id} {...h} />
      ))}

      {/* Sparkles */}
      {sparkleParticles?.map((s) => (
        <SparkleParticle key={s.id} {...s} />
      ))}
    </div>
  );
};
