import React, { useState } from "react";
import { Bug, X } from "lucide-react";
import { WeatherCondition } from "../hooks/useWeather";

export interface WeatherDebugOverride {
  condition: WeatherCondition;
  isDay: boolean;
}

interface WeatherDebugToggleProps {
  value: WeatherDebugOverride | null;
  onChange: (override: WeatherDebugOverride | null) => void;
}

const PRESETS: { label: string; override: WeatherDebugOverride }[] = [
  { label: "Cerah (Siang)", override: { condition: "clear", isDay: true } },
  { label: "Cerah (Malam)", override: { condition: "clear", isDay: false } },
  { label: "Cerah Berawan (Siang)", override: { condition: "partly_cloudy", isDay: true } },
  { label: "Cerah Berawan (Malam)", override: { condition: "partly_cloudy", isDay: false } },
  { label: "Berawan / Mendung", override: { condition: "cloudy", isDay: true } },
  { label: "Berkabut", override: { condition: "fog", isDay: true } },
  { label: "Gerimis", override: { condition: "drizzle", isDay: true } },
  { label: "Hujan", override: { condition: "rain", isDay: true } },
  { label: "Hujan Petir", override: { condition: "thunderstorm", isDay: true } },
  { label: "Salju", override: { condition: "snow", isDay: true } },
];

/**
 * ⚠️ TEMPORARY DEV TOOL — bukan bagian dari fitur akhir.
 *
 * Tujuannya cuma supaya QA/preview bisa lihat semua kondisi cuaca di welcome
 * banner tanpa harus nunggu cuaca asli berubah. Hanya dirender saat
 * `import.meta.env.DEV` true, jadi tidak akan pernah tampil di build
 * production -- tapi kalau memang mau dihapus total dari kode nanti, cukup:
 *   1. Hapus file ini.
 *   2. Hapus import & pemakaian <WeatherDebugToggle /> + state terkait di
 *      DashboardHeader.tsx.
 */
export const WeatherDebugToggle: React.FC<WeatherDebugToggleProps> = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);

  if (!import.meta.env.DEV) return null;

  return (
    <div className="relative z-20">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
          value
            ? "bg-fuchsia-500/20 border-fuchsia-400/40 text-fuchsia-200"
            : "bg-white/5 border-white/10 text-slate-400 hover:text-slate-200"
        }`}
        title="Debug cuaca (dev only)"
      >
        <Bug size={12} />
        <span>{value ? "Debug: ON" : "Debug"}</span>
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-2 w-56 max-h-72 overflow-y-auto rounded-xl border border-white/10 bg-slate-950/95 backdrop-blur-md shadow-xl p-2 flex flex-col gap-1">
          <div className="flex items-center justify-between px-1 pb-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Preview Cuaca (Dev)
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-slate-500 hover:text-slate-200"
            >
              <X size={12} />
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
            className={`text-left text-xs px-2 py-1.5 rounded-lg transition-colors ${
              !value ? "bg-emerald-500/20 text-emerald-300" : "text-slate-300 hover:bg-white/5"
            }`}
          >
            🔴 Live (data asli)
          </button>

          <div className="h-px bg-white/10 my-1" />

          {PRESETS.map((p) => {
            const active =
              value?.condition === p.override.condition && value?.isDay === p.override.isDay;
            return (
              <button
                key={p.label}
                type="button"
                onClick={() => {
                  onChange(p.override);
                  setOpen(false);
                }}
                className={`text-left text-xs px-2 py-1.5 rounded-lg transition-colors ${
                  active ? "bg-fuchsia-500/20 text-fuchsia-200" : "text-slate-300 hover:bg-white/5"
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
