import React, { useState } from "react";
import { Bug, X } from "lucide-react";
import { WeatherCondition } from "../hooks/useWeather";
import { useThemeTokens } from "../hooks/useThemeTokens";

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
 * TEMPORARY DEV TOOL — bukan bagian dari fitur akhir.
 *
 * Tujuannya cuma supaya QA/preview bisa lihat semua kondisi cuaca di welcome
 * banner tanpa harus nunggu cuaca asli berubah. Hanya dirender saat
 * `import.meta.env.DEV` true, jadi tidak akan pernah tampil di build
 * production -- tapi kalau memang mau dihapus total dari kode nanti, cukup:
 *   1. Hapus file ini.
 *   2. Hapus import & pemakaian <WeatherDebugToggle /> + state terkait di
 *      DashboardHeader.tsx.
 *
 * Tombol dibuat icon-only (bukan pill berlabel "Debug"/"Debug: ON") supaya
 * konsisten dengan gaya `tokens.dashboardHeader.iconButton` yang dipakai
 * elemen lain di topbar, dan pakai `useThemeTokens()` supaya otomatis
 * mengikuti tema dark_obsidian/light_sakura seperti sisa topbar (sebelumnya
 * warna di sini hardcode slate/fuchsia tanpa varian light_sakura sama
 * sekali, jadi rusak kalau tema light aktif).
 */
export const WeatherDebugToggle: React.FC<WeatherDebugToggleProps> = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);
  const { tokens, cx } = useThemeTokens();

  if (!import.meta.env.DEV) return null;

  return (
    <div className="relative z-20">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cx(
          "relative flex items-center justify-center w-7 h-7 rounded-full transition-colors",
          tokens.dashboardHeader.iconButton,
          value && "text-fuchsia-400"
        )}
        title="Debug cuaca (dev only)"
        aria-label="Debug cuaca (dev only)"
      >
        <Bug size={13} />
        {value && (
          <span
            className={cx(
              "absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full flex items-center justify-center",
              tokens.surface.card
            )}
          >
            <span className="w-2 h-2 rounded-full bg-fuchsia-400" />
          </span>
        )}
      </button>

      {open && (
        <div
          className={cx(
            "absolute right-0 top-full mt-2 w-56 max-h-72 overflow-y-auto rounded-xl border shadow-xl p-2 flex flex-col gap-1 backdrop-blur-md",
            tokens.surface.card,
            tokens.border.default
          )}
        >
          <div className="flex items-center justify-between px-1 pb-1">
            <span
              className={cx(
                "text-[clamp(0.5625rem,2.6vw,0.625rem)] font-semibold uppercase tracking-wide",
                tokens.text.label
              )}
            >
              Preview Cuaca (Dev)
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className={cx(tokens.text.label, "hover:opacity-70 transition-opacity")}
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
            className={cx(
              "text-left text-xs px-2 py-1.5 rounded-lg transition-colors",
              !value
                ? "bg-emerald-500/15 text-emerald-500"
                : cx(tokens.text.secondary, "hover:bg-white/5 light_sakura:hover:bg-slate-50")
            )}
          >
            Live (data asli)
          </button>

          <div className={cx("h-px my-1", tokens.border.default)} />

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
                className={cx(
                  "text-left text-xs px-2 py-1.5 rounded-lg transition-colors",
                  active
                    ? "bg-fuchsia-500/15 text-fuchsia-500"
                    : cx(tokens.text.secondary, "hover:bg-white/5 light_sakura:hover:bg-slate-50")
                )}
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
