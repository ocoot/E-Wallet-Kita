import React, { useCallback, useLayoutEffect, useRef, useState } from "react";
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
  const slideRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  // Tinggi kontainer di-set eksplisit lewat JS supaya mengikuti tinggi
  // konten slide yang SEDANG aktif -- bukan tinggi slide tertinggi. Tanpa
  // ini, flex row akan otomatis stretch ke tinggi child terbesar (mis.
  // kartu "Total Kekayaan" yang lebih tinggi), sehingga saat slide yang
  // lebih pendek (kartu "Saldo Anda") aktif, tersisa ruang kosong besar
  // di bawah sebelum section berikutnya.
  const [activeHeight, setActiveHeight] = useState<number | undefined>(undefined);

  const slides = React.Children.toArray(children);

  const measureActive = useCallback(() => {
    const node = slideRefs.current[activeIndex];
    if (node) {
      setActiveHeight(node.getBoundingClientRect().height);
    }
  }, [activeIndex]);

  // Ukur ulang setiap kali slide aktif berganti.
  useLayoutEffect(() => {
    measureActive();
  }, [measureActive]);

  // Ukur ulang juga saat konten slide aktif berubah ukuran secara dinamis
  // (mis. data async yang baru selesai dimuat) atau saat layar di-resize.
  useLayoutEffect(() => {
    const node = slideRefs.current[activeIndex];
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => measureActive());
    observer.observe(node);
    return () => observer.disconnect();
  }, [activeIndex, measureActive]);

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
        className="flex items-start overflow-x-auto overflow-y-hidden snap-x snap-mandatory scrollbar-hide -mx-0.5 px-0.5 transition-[height] duration-300 ease-out"
        style={{ scrollSnapType: "x mandatory", height: activeHeight }}
      >
        {slides.map((slide, idx) => (
          <div
            key={idx}
            ref={(node) => {
              slideRefs.current[idx] = node;
            }}
            className="w-full shrink-0 snap-center snap-always"
          >
            {slide}
          </div>
        ))}
      </div>

      {/* Dot indicator -- ukuran visual pill dibuat kecil & tetap (fixed px,
          bukan cuma class Tailwind) lewat <span> di dalam <button>, supaya
          target sentuh tetap nyaman di mobile (padding di button) tanpa
          bikin dot itu sendiri tampak besar. */}
      <div className="flex items-center justify-center gap-1 mt-3">
        {slides.map((_, idx) => (
          <button
            key={idx}
            type="button"
            aria-label={`Slide ${idx + 1}`}
            onClick={() => scrollToIndex(idx)}
            className="appearance-none bg-transparent border-0 p-1.5 m-0 flex items-center justify-center cursor-pointer shrink-0 leading-none"
          >
            <span
              className={cx(
                "block rounded-full transition-all",
                idx === activeIndex ? "bg-indigo-400" : "bg-slate-500/40"
              )}
              style={{
                height: 4,
                width: idx === activeIndex ? 12 : 4,
              }}
            />
          </button>
        ))}
      </div>
    </div>
  );
};
