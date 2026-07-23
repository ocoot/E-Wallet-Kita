import React, { useLayoutEffect, useRef, useState, useEffect } from "react";
import { useThemeTokens } from "../hooks/useThemeTokens";
import { audioFeedback } from "../lib/audio";

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
  // Cache tinggi TERAKHIR yang terukur untuk tiap slide (index -> px).
  const heightsRef = useRef<number[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  // Tinggi kontainer di-set eksplisit lewat JS supaya mengikuti tinggi
  // konten slide yang SEDANG terlihat -- bukan tinggi slide tertinggi.
  // Nilainya DIHITUNG LANGSUNG dari posisi scroll aktual tiap kali event
  // `scroll` terjadi (lihat `applyHeightFromScroll`), termasuk selagi jari
  // masih di layar (drag belum selesai/snap) -- bukan cuma saat index aktif
  // "resmi" berganti. Ini supaya tinggi kontainer selalu presisi mengikuti
  // proporsi kartu mana yang paling banyak terlihat saat itu, tanpa risiko
  // "nyangkut" di tinggi lama akibat efek/observer yang telat.
  const [activeHeight, setActiveHeight] = useState<number | undefined>(undefined);

  const slides = React.Children.toArray(children);

  const applyHeightFromScroll = () => {
    const el = scrollRef.current;
    if (!el || el.clientWidth === 0) return;
    const progress = el.scrollLeft / el.clientWidth;
    const lower = Math.max(0, Math.min(slides.length - 1, Math.floor(progress)));
    const upper = Math.max(0, Math.min(slides.length - 1, Math.ceil(progress)));
    const t = progress - Math.floor(progress);
    const hLower = heightsRef.current[lower];
    const hUpper = heightsRef.current[upper];
    if (hLower === undefined && hUpper === undefined) return;
    const base = hLower ?? hUpper!;
    const target = hUpper ?? hLower!;
    setActiveHeight(base + (target - base) * t);
    setActiveIndex(Math.min(Math.max(Math.round(progress), 0), slides.length - 1));
  };

  // Amati SEMUA slide sekaligus (bukan cuma yang aktif) supaya perubahan
  // tinggi konten apa pun -- mis. skeleton loading yang berubah jadi data
  // asli, atau bagian "Rincian Aset & Riwayat" yang di-expand/collapse --
  // selalu ter-capture kapan pun itu terjadi, lalu langsung diterapkan ulang
  // lewat posisi scroll saat ini.
  useLayoutEffect(() => {
    if (typeof ResizeObserver === "undefined") {
      slideRefs.current.forEach((node, idx) => {
        if (node) heightsRef.current[idx] = node.getBoundingClientRect().height;
      });
      applyHeightFromScroll();
      return;
    }

    const observers = slideRefs.current.map((node, idx) => {
      if (!node) return null;
      const observer = new ResizeObserver(() => {
        heightsRef.current[idx] = node.getBoundingClientRect().height;
        applyHeightFromScroll();
      });
      observer.observe(node);
      heightsRef.current[idx] = node.getBoundingClientRect().height;
      return observer;
    });

    applyHeightFromScroll();

    return () => observers.forEach((o) => o?.disconnect());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slides.length]);

  const handleScroll = () => {
    applyHeightFromScroll();
  };

  // Getar halus setiap kali kartu aktif berpindah lewat swipe -- sebelumnya
  // gesture ini (murni scroll-snap native, bukan tombol) tidak memicu
  // feedback apa pun. `useRef` (bukan bandingkan langsung di render) supaya
  // getar TIDAK ikut terpicu saat render pertama (activeIndex mulai di 0).
  const previousIndexRef = useRef(0);
  useEffect(() => {
    if (previousIndexRef.current !== activeIndex) {
      audioFeedback.tapHaptic();
      previousIndexRef.current = activeIndex;
    }
  }, [activeIndex]);

  const scrollToIndex = (idx: number) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ left: idx * el.clientWidth, behavior: "smooth" });
  };

  if (slides.length <= 1) {
    return <>{slides}</>;
  }

  return (
    <div>
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex items-start overflow-x-auto overflow-y-hidden snap-x snap-mandatory scrollbar-hide -mx-0.5 px-0.5"
        style={{ scrollSnapType: "x mandatory", height: activeHeight }}
      >
        {slides.map((slide, idx) => (
          <div
            key={idx}
            ref={(node) => {
              slideRefs.current[idx] = node;
            }}
            // px-1.5 di tiap slide -> ada jarak/gap yang konsisten antara
            // kartu ini & kartu sebelahnya saat keduanya kelihatan
            // bersamaan selagi di-swipe (drag belum snap penuh), alih-alih
            // dua kartu yang bersinggungan langsung tanpa jarak.
            className="w-full shrink-0 snap-center snap-always px-1.5 first:pl-0 last:pr-0"
          >
            {slide}
          </div>
        ))}
      </div>

      {/* Dot indicator -- ukuran visual pill dibuat kecil & tetap (fixed px,
          bukan cuma class Tailwind) lewat <span> di dalam <button>, supaya
          target sentuh tetap nyaman di mobile (padding di button) tanpa
          bikin dot itu sendiri tampak besar. Padding button & gap dikecilkan
          (p-1.5/gap-1 -> p-1/gap-0.5) supaya dot-dot tidak kelihatan
          "mengambang" berjauhan satu sama lain, sambil tetap sisakan area
          sentuh yang wajar. */}
      <div className="flex items-center justify-center gap-0.5" style={{ marginTop: "0.125rem" }}>
        {slides.map((_, idx) => (
          <button
            key={idx}
            type="button"
            aria-label={`Slide ${idx + 1}`}
            onClick={() => scrollToIndex(idx)}
            className="appearance-none bg-transparent border-0 p-0.5 m-0 flex items-center justify-center cursor-pointer shrink-0 leading-none"
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
