import React, { useEffect, useRef } from "react";
// @ts-ignore -- lihat src/types/lottie-web.d.ts untuk penjelasan ambient shim ini
import lottie from "lottie-web";
import { fetchLottieAnimation } from "../lib/lottieWeather";

interface LottieWeatherIconProps {
  /** Slug ikon Meteocons, misalnya "cloudy" atau "thunderstorms-day-rain" */
  slug: string;
  size?: number;
  className?: string;
  /** Dipanggil kalau animasi gagal di-fetch/dimuat -- parent harus fallback ke render CSS/SVG */
  onError?: () => void;
}

/**
 * Render 1 ikon cuaca Lottie (Meteocons) yang di-fetch dari CDN resmi saat
 * mount. Murni dekoratif: tidak pernah throw ke luar, kegagalan selalu
 * dilaporkan lewat onError() supaya parent bisa mengganti ke lapisan
 * CSS/SVG kita sendiri sebagai fallback.
 */
export const LottieWeatherIcon: React.FC<LottieWeatherIconProps> = ({ slug, size = 128, className, onError }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    let animation: ReturnType<typeof lottie.loadAnimation> | null = null;

    fetchLottieAnimation(slug)
      .then((animationData) => {
        if (cancelled || !containerRef.current) return;
        animation = lottie.loadAnimation({
          container: containerRef.current,
          renderer: "svg",
          loop: true,
          autoplay: true,
          animationData,
          rendererSettings: { preserveAspectRatio: "xMidYMid meet" },
        });
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn(`[LottieWeatherIcon] gagal memuat "${slug}", fallback ke render CSS/SVG:`, err?.message || err);
        onError?.();
      });

    return () => {
      cancelled = true;
      animation?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className={className}
      style={{ width: size, height: size }}
    />
  );
};
