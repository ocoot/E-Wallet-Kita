import React, { useRef, useState } from "react";
import { useThemeTokens } from "../hooks/useThemeTokens";

interface DashboardCardSwiperProps {
  /** Setiap child dirender sebagai satu slide penuh-lebar, digeser lewat swipe horizontal native (scroll-snap) -- bukan carousel JS custom, supaya terasa seperti native mobile swipe & tetap ringan. */
  children: React.ReactNode[];
}

/**
 * Pembungkus swipeable untuk kartu-kartu hero dashboard (Kartu Pos Dompet
 * "Saldo Anda" & Kartu "Total Kekayaan" -- lihat Dashboard.tsx). Sebelumnya
 * kedua kartu ini dirender bertumpuk penuh (stacked), sekarang digabung jadi
 * satu carousel horizontal 1-kartu-per-layar dengan dot indicator di bawah,
 * supaya keduanya "bersebelahan" (side-by-side lewat swipe) alih-alih makan
 * tempat vertikal berlebih.
 *
 * Pakai scroll-snap native (bukan drag/animasi JS) supaya swipe terasa
 * responsif & konsisten dengan gesture native browser mobile, dan tidak
 * perlu menangani touch/pointer events manual.
 */
export const DashboardCardSwiper: React.FC<DashboardCardSwiperProps> = ({ children }) => {
  const { cx } = useThemeTokens();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const slides = React.Children.toArray(children);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el || el.clientWidth === 0) return;
    const idx = Math.round(el.scrollLeft / el.clientWidth);
    setActiveIndex(Math.min(Math.max(idx, 0), slides.length - 1));
  };

  const scrollToIndex = (idx: number) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ left: idx * el.clientWidth, behavior: "smooth" });
    setActiveIndex(idx);
  };

  if (slides.length <= 1) {
    return <>{slides}</>;
  }

  return (
    <div>
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide -mx-0.5 px-0.5"
        style={{ scrollSnapType: "x mandatory" }}
      >
        {slides.map((slide, idx) => (
          <div key={idx} className="w-full shrink-0 snap-center snap-always">
            {slide}
          </div>
        ))}
      </div>

      {/* Dot indicator */}
      <div className="flex items-center justify-center gap-1.5 mt-3">
        {slides.map((_, idx) => (
          <button
            key={idx}
            type="button"
            aria-label={`Slide ${idx + 1}`}
            onClick={() => scrollToIndex(idx)}
            className={cx(
              "h-1.5 rounded-full transition-all cursor-pointer",
              idx === activeIndex ? "w-5 bg-indigo-400" : "w-1.5 bg-slate-500/40"
            )}
          />
        ))}
      </div>
    </div>
  );
};
