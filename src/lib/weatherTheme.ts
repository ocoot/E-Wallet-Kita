import {
  Sun,
  Moon,
  CloudSun,
  CloudMoon,
  Cloud,
  CloudFog,
  CloudDrizzle,
  CloudRain,
  CloudSnow,
  CloudLightning,
  type LucideIcon,
} from "lucide-react";
import { WeatherCondition } from "../hooks/useWeather";

export interface WeatherTheme {
  icon: LucideIcon;
  /** Kelas gradient overlay, disusun agar tetap lembut di atas bg-slate-900 header */
  gradientClass: string;
  /** Warna aksen ikon/badge cuaca */
  accentClass: string;
  labelId: string;
  labelEn: string;
  /** Jenis lapisan partikel yang dirender DashboardWeatherLayer */
  particle: "rain" | "snow" | "clouds" | "fog" | "thunder" | "sun" | "stars" | "none";
}

export function getWeatherTheme(condition: WeatherCondition, isDay: boolean): WeatherTheme {
  switch (condition) {
    case "clear":
      return isDay
        ? {
            icon: Sun,
            gradientClass: "from-amber-400/25 via-sky-500/10 to-transparent",
            accentClass: "text-amber-400",
            labelId: "Cerah",
            labelEn: "Clear",
            particle: "sun",
          }
        : {
            icon: Moon,
            gradientClass: "from-indigo-900/40 via-slate-900/20 to-transparent",
            accentClass: "text-indigo-300",
            labelId: "Cerah Malam",
            labelEn: "Clear Night",
            particle: "stars",
          };
    case "partly_cloudy":
      return isDay
        ? {
            icon: CloudSun,
            gradientClass: "from-sky-400/25 via-slate-500/10 to-transparent",
            accentClass: "text-sky-300",
            labelId: "Cerah Berawan",
            labelEn: "Partly Cloudy",
            particle: "clouds",
          }
        : {
            icon: CloudMoon,
            gradientClass: "from-indigo-800/30 via-slate-800/15 to-transparent",
            accentClass: "text-indigo-300",
            labelId: "Cerah Berawan",
            labelEn: "Partly Cloudy",
            particle: "clouds",
          };
    case "cloudy":
      return {
        icon: Cloud,
        gradientClass: "from-slate-500/25 via-slate-600/10 to-transparent",
        accentClass: "text-slate-300",
        labelId: "Berawan",
        labelEn: "Cloudy",
        particle: "clouds",
      };
    case "fog":
      return {
        icon: CloudFog,
        gradientClass: "from-slate-400/20 via-slate-500/10 to-transparent",
        accentClass: "text-slate-300",
        labelId: "Berkabut",
        labelEn: "Foggy",
        particle: "fog",
      };
    case "drizzle":
      return {
        icon: CloudDrizzle,
        gradientClass: "from-cyan-700/25 via-slate-700/15 to-transparent",
        accentClass: "text-cyan-300",
        labelId: "Gerimis",
        labelEn: "Drizzle",
        particle: "rain",
      };
    case "rain":
      return {
        icon: CloudRain,
        gradientClass: "from-blue-800/35 via-slate-800/20 to-transparent",
        accentClass: "text-blue-300",
        labelId: "Hujan",
        labelEn: "Rain",
        particle: "rain",
      };
    case "snow":
      return {
        icon: CloudSnow,
        gradientClass: "from-slate-300/15 via-slate-500/10 to-transparent",
        accentClass: "text-slate-200",
        labelId: "Salju",
        labelEn: "Snow",
        particle: "snow",
      };
    case "thunderstorm":
      return {
        icon: CloudLightning,
        gradientClass: "from-violet-900/40 via-slate-900/25 to-transparent",
        accentClass: "text-violet-300",
        labelId: "Hujan Petir",
        labelEn: "Thunderstorm",
        particle: "thunder",
      };
    default:
      return {
        icon: Cloud,
        gradientClass: "from-slate-500/20 to-transparent",
        accentClass: "text-slate-300",
        labelId: "Berawan",
        labelEn: "Cloudy",
        particle: "none",
      };
  }
}
