import React, { useEffect, useRef } from "react";
import lottie from "lottie-web";
import { WeatherCondition } from "../hooks/useWeather";

// Animasi resmi dari paket npm @meteocons/lottie (Bas Milius, MIT license:
// https://github.com/basmilius/weather-icons). Di-import lewat bundler
// (bukan hotlink CDN) supaya offline-safe & versinya terkunci oleh
// package.json, konsisten dengan cara resmi yang didokumentasikan di
// https://meteocons.com/docs/getting-started.
import clearDayAnim from "@meteocons/lottie/fill/clear-day.json";
import clearNightAnim from "@meteocons/lottie/fill/clear-night.json";
import partlyCloudyDayAnim from "@meteocons/lottie/fill/partly-cloudy-day.json";
import partlyCloudyNightAnim from "@meteocons/lottie/fill/partly-cloudy-night.json";
import cloudyAnim from "@meteocons/lottie/fill/cloudy.json";
import fogDayAnim from "@meteocons/lottie/fill/fog-day.json";
import fogNightAnim from "@meteocons/lottie/fill/fog-night.json";
import drizzleAnim from "@meteocons/lottie/fill/drizzle.json";
import rainAnim from "@meteocons/lottie/fill/rain.json";
import snowAnim from "@meteocons/lottie/fill/snow.json";
import thunderstormsDayRainAnim from "@meteocons/lottie/fill/thunderstorms-day-rain.json";
import thunderstormsNightRainAnim from "@meteocons/lottie/fill/thunderstorms-night-rain.json";

function getAnimationData(condition: WeatherCondition, isDay: boolean) {
  switch (condition) {
    case "clear":
      return isDay ? clearDayAnim : clearNightAnim;
    case "partly_cloudy":
      return isDay ? partlyCloudyDayAnim : partlyCloudyNightAnim;
    case "cloudy":
      return cloudyAnim;
    case "fog":
      return isDay ? fogDayAnim : fogNightAnim;
    case "drizzle":
      return drizzleAnim;
    case "rain":
      return rainAnim;
    case "snow":
      return snowAnim;
    case "thunderstorm":
      return isDay ? thunderstormsDayRainAnim : thunderstormsNightRainAnim;
    default:
      return cloudyAnim;
  }
}

interface WeatherLottieProps {
  condition: WeatherCondition;
  isDay: boolean;
  size?: number;
  className?: string;
}

/**
 * Merender ikon cuaca animasi (Lottie asli, hand-crafted oleh desainer --
 * bukan animasi CSS buatan kita) sesuai kondisi & waktu saat ini.
 * Murni dekoratif: aria-hidden, tidak pernah menerima interaksi apa pun.
 */
export const WeatherLottie: React.FC<WeatherLottieProps> = ({ condition, isDay, size = 176, className }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<ReturnType<typeof lottie.loadAnimation> | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    animRef.current?.destroy();
    animRef.current = lottie.loadAnimation({
      container: containerRef.current,
      animationData: getAnimationData(condition, isDay),
      renderer: "svg",
      loop: true,
      autoplay: true,
    });

    // Hormati preferensi pengguna yang mematikan animasi -- tetap tampilkan
    // ikonnya (frame pertama), tapi jangan berputar terus.
    const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) {
      animRef.current.goToAndStop(0, true);
    }

    return () => {
      animRef.current?.destroy();
      animRef.current = null;
    };
  }, [condition, isDay]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ width: size, height: size }}
      aria-hidden="true"
    />
  );
};
