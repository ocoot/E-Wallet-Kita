import React, { useLayoutEffect, useRef, useState } from "react";
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
  // Cache tinggi TERAKHIR yang terukur untuk tiap slide (index -> px),
  // supaya saat pindah slide kita bisa langsung terapkan tinggi yang
  // sudah pernah diketahui tanpa menunggu observer callback berikutnya.
  const heightsRef = useRef<number[]>([]);
  const activeIndexRef = useRef(0);
  const [activeIndex, setActiveIndex] = useState(0);
  // Tinggi kontainer di-set eksplisit lewat JS supaya mengikuti tinggi
  // konten slide yang SEDANG aktif -- bukan tinggi slide tertinggi. Tanpa
  // ini, flex row akan otomatis stretch ke tinggi child terbesar (mis.
  // kartu "Total Kekayaan" yang lebih tinggi), sehingga saat slide yang
  // lebih pendek (kartu "Saldo Anda") aktif, tersisa ruang kosong besar
  // di bawahnya sebelum section berikutnya.
  const [activeHeight, setActiveHeight] = useState<number | undefined>(undefined);

  const slides = React.Children.toArray(children);
  activeIndexRef.current = activeIndex;

  // PENTING: observer dipasang ke SEMUA slide sekaligus, bukan cuma slide
  // yang sedang aktif. Kartu-kartu ini sering berubah tinggi setelah mount
  // (mis. skeleton loading -> data asli selesai dimuat, atau bagian
  // "Rincian Aset & Riwayat" di-expand/collapse) -- kalau observer cuma
  // dipasang & dilepas ulang setiap kali `activeIndex` berganti, perubahan
  // tinggi yang terjadi di luar window itu bisa terlewat dan kontainer
  // "nyangkut" di tinggi lama (persis gejala celah kosong yang muncul).
  useLayoutEffect(() => {
    if (typeof ResizeObserver === "undefined") {
      const node = slideRefs.current[activeIndexRef.current];
      if (node) setActiveHeight(node.getBoundingClientRect().height);
      return;
    }

    const observers = slideRefs.current.map((node, idx) => {
      if (!node) return null;
      const observer = new ResizeObserver(() => {
        const h = node.getBoundingClientRect().height;
        heightsRef.current[idx] = h;
        if (idx === activeIndexRef.current) {
          setActiveHeight(h);
        }
      });
      observer.observe(node);
      heightsRef.current[idx] = node.getBoundingClientRect().height;
      return observer;
    });

    if (heightsRef.current[activeIndexRef.current] !== undefined) {
      setActiveHeight(heightsRef.current[activeIndexRef.current]);
    }

    return () => observers.forEach((o) => o?.disconnect());
  }, [slides.length]);

  // Saat pindah slide (swipe atau tap dot), langsung terapkan tinggi yang
  // sudah pernah terukur untuk slide itu (kalau ada) supaya perubahan
  // tinggi terjadi bersamaan dengan animasi swipe, bukan telat menunggu
  // observer callback berikutnya.
  useLayoutEffect(() => {
    const h = heightsRef.current[activeIndex];
    if (h) setActiveHeight(h);
  }, [activeIndex]);

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
