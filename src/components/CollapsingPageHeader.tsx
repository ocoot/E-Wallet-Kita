import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useThemeTokens } from "../hooks/useThemeTokens";
import { useMainScrollRef } from "../contexts/MainScrollContext";
import { audioFeedback } from "../lib/audio";

interface CollapsingPageHeaderProps {
  /** Judul singkat yang muncul di sticky bar begitu di-scroll (BUKAN judul
   *  besar halaman itu sendiri -- itu tetap dirender halaman masing-masing
   *  seperti sebelumnya, komponen ini cuma menambah lapisan sticky di
   *  atasnya saat discroll). */
  title: string;
  /** Path tujuan tombol back. Kalau tidak diisi, pakai `navigate(-1)`
   *  (kembali ke entry history sebelumnya) -- sama seperti AdminBackBar. */
  backTo?: string;
  /** Jarak scroll (px) sebelum sticky bar mulai muncul. Default 48 --
   *  kira-kira setinggi 1 baris judul besar + sedikit margin, supaya bar
   *  baru muncul SETELAH judul asli benar-benar mulai keluar dari view,
   *  bukan tumpang tindih dengan judul asli yang masih terlihat. */
  threshold?: number;
}

/**
 * PILOT (Agu 2026): versi pertama pola "Large Title collapse ke sticky
 * compact header" ala native iOS (Settings/Mail bawaan: judul besar di
 * atas mengecil & pindah ke top bar sticky begitu discroll, lengkap
 * tombol back) -- lihat diskusi UI/UX di percakapan ini untuk konteks.
 * Dicoba dulu di SATU halaman (AdminErrorMonitor.tsx) sebelum disebar ke
 * halaman Admin/Settings lain.
 *
 * Baca posisi scroll dari `<main overflow-y-auto>` di App.tsx lewat
 * `useMainScrollRef()` (context yang sama dipakai `usePullToRefresh`) --
 * BUKAN dari `window`, karena scroll container sesungguhnya di app ini
 * adalah `<main>`, bukan window (lihat komentar di MainScrollContext.tsx).
 *
 * `top: 0` (BUKAN `env(safe-area-inset-top)`) sengaja -- `<main>` sudah
 * diberi `paddingTop: env(safe-area-inset-top)` sekali di App.tsx sebelum
 * konten halaman manapun dirender, jadi menambahkannya lagi di sini akan
 * DOBEL menjorok ke bawah status bar saat sticky.
 *
 * Background translucent + `backdrop-blur` (bukan `tokens.surface.card`
 * yang solid) sengaja dipilih di sini secara spesifik supaya konten yang
 * lewat di baliknya samar-samar kelihatan sekilas sebelum scroll
 * berhenti -- efek yang sama dipakai top bar native iOS. Belum ada token
 * "surface translucent" terpusat di tokens.ts (dipakai baru di 1 tempat
 * ini), jadi ditulis inline dulu -- promosikan ke tokens.ts kalau pola
 * ini nanti disebar ke ≥2 halaman lain sesuai aturan rollout token.
 */
export const CollapsingPageHeader: React.FC<CollapsingPageHeaderProps> = ({
  title,
  backTo,
  threshold = 48,
}) => {
  const navigate = useNavigate();
  const { tokens, cx } = useThemeTokens();
  const scrollRef = useMainScrollRef();
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    const el = scrollRef?.current;
    if (!el) return;

    const handleScroll = () => setIsCollapsed(el.scrollTop > threshold);
    handleScroll(); // sinkron begitu mount, kalau halaman dibuka sudah dalam posisi scroll (mis. balik dari detail lain)

    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [scrollRef, threshold]);

  const handleBack = () => {
    audioFeedback.playClick();
    if (backTo) navigate(backTo);
    else navigate(-1);
  };

  return (
    <AnimatePresence>
      {isCollapsed && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          className={cx(
            "sticky top-0 z-30 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-3",
            "flex items-center gap-3 border-b backdrop-blur-md",
            "bg-slate-900/85 light_sakura:bg-white/85",
            tokens.border.default
          )}
        >
          <button
            type="button"
            onClick={handleBack}
            aria-label="Back"
            className="shrink-0 -ml-1.5 p-1.5 rounded-full cursor-pointer active:scale-[0.92] transition-transform"
          >
            <ChevronLeft size={20} className={tokens.text.secondary} />
          </button>
          <h2 className={cx("font-sans font-bold text-base truncate", tokens.text.heading)}>
            {title}
          </h2>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
