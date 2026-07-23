import { useEffect, useRef, useState } from "react";
import { useMainScrollRef } from "../contexts/MainScrollContext";
import { audioFeedback } from "../lib/audio";

const THRESHOLD = 68; // px tarikan sebelum lepas jari akan memicu refresh
const MAX_PULL = 110; // batas visual, supaya tidak ditarik selamanya
const DAMPING = 0.5; // "karet" -- gerak jari 1px cuma menggeser indikator 0.5px

/**
 * Gesture pull-to-refresh custom, meniru pattern app finansial native
 * (Gopay/OVO/Dana dkk) di halaman Dashboard/Riwayat.
 *
 * Kenapa custom (bukan andalkan pull-to-refresh bawaan browser mobile):
 * `overscroll-behavior-y: contain` di index.css SUDAH sengaja mematikan
 * pull-to-refresh bawaan browser (karena itu me-refresh SELURUH halaman /
 * reload keras, bukan cuma re-fetch data lewat React state) -- makanya
 * area yang kosong itu perlu diisi gesture sendiri yang hasilnya cuma
 * re-fetch data via `onRefresh`, tanpa reload/flicker seluruh app.
 *
 * Hanya aktif kalau dipanggil dari dalam <MainScrollProvider> (App.tsx) --
 * di luar itu, jadi no-op aman (pullDistance selalu 0).
 */
export function usePullToRefresh(onRefresh: () => Promise<void>) {
  const mainRef = useMainScrollRef();
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const pullDistanceRef = useRef(0);
  const startYRef = useRef<number | null>(null);
  const draggingRef = useRef(false);
  const isRefreshingRef = useRef(false);
  const crossedThresholdRef = useRef(false);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    isRefreshingRef.current = isRefreshing;
  }, [isRefreshing]);

  useEffect(() => {
    const el = mainRef?.current;
    if (!el) return;

    const setPull = (v: number) => {
      pullDistanceRef.current = v;
      setPullDistance(v);
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (isRefreshingRef.current || el.scrollTop > 0) {
        draggingRef.current = false;
        return;
      }
      startYRef.current = e.touches[0].clientY;
      draggingRef.current = true;
      crossedThresholdRef.current = false;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!draggingRef.current || startYRef.current === null) return;
      const delta = e.touches[0].clientY - startYRef.current;
      if (delta <= 0 || el.scrollTop > 0) {
        setPull(0);
        return;
      }
      const damped = Math.min(MAX_PULL, delta * DAMPING);
      setPull(damped);

      // Getar halus sekali begitu tarikan pertama kali melewati ambang
      // batas -- sinyal "lepas sekarang untuk refresh", sama seperti
      // haptic threshold di pull-to-refresh iOS/Android native.
      if (damped >= THRESHOLD && !crossedThresholdRef.current) {
        crossedThresholdRef.current = true;
        audioFeedback.playClick();
      } else if (damped < THRESHOLD && crossedThresholdRef.current) {
        crossedThresholdRef.current = false;
      }

      // Cegah rubber-band scroll bawaan browser ikut jalan bersamaan
      // dengan gesture custom ini selama masih di posisi paling atas.
      e.preventDefault();
    };

    const handleTouchEnd = async () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      startYRef.current = null;

      if (pullDistanceRef.current >= THRESHOLD) {
        setIsRefreshing(true);
        setPull(THRESHOLD);
        try {
          await onRefreshRef.current();
        } finally {
          setIsRefreshing(false);
          setPull(0);
        }
      } else {
        setPull(0);
      }
    };

    el.addEventListener("touchstart", handleTouchStart, { passive: true });
    el.addEventListener("touchmove", handleTouchMove, { passive: false });
    el.addEventListener("touchend", handleTouchEnd);
    el.addEventListener("touchcancel", handleTouchEnd);
    return () => {
      el.removeEventListener("touchstart", handleTouchStart);
      el.removeEventListener("touchmove", handleTouchMove);
      el.removeEventListener("touchend", handleTouchEnd);
      el.removeEventListener("touchcancel", handleTouchEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mainRef]);

  return { pullDistance, isRefreshing, threshold: THRESHOLD };
}
