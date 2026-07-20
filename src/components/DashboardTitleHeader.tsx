import React from "react";
import { motion, useScroll, useTransform } from "motion/react";
import { useThemeTokens } from "../hooks/useThemeTokens";
import { useDashboardGreeting } from "../hooks/useDashboardGreeting";
import type { SubGreetingType } from "../hooks/useDashboardGreeting";

interface DashboardTitleHeaderProps {
  userId: string | undefined;
  displayName: string;
}

/**
 * Large-title header native untuk Dashboard, MOBILE ONLY (md:hidden --
 * desktop tetap pakai judul statis di dalam DashboardHeader.tsx seperti
 * semula, lihat komentar di file itu).
 *
 * SENGAJA dirender Dashboard.tsx sebagai sibling SEBELUM
 * `<DashboardWalletCarousel>`, BUKAN di dalam DashboardHeader.tsx (yang
 * dirender sebagai slide DI DALAM carousel itu). Alasannya murni teknis:
 * carousel-nya `overflow-x-auto overflow-y-hidden` (lihat
 * DashboardWalletCarousel.tsx) -- kalau elemen `position: sticky` dipasang
 * di dalam ancestor yang overflow-nya bukan "visible", browser menjadikan
 * ancestor itu sebagai acuan scroll untuk sticky (bukan window), padahal
 * ancestor ini sendiri tidak pernah scroll VERTICAL (dia scroll
 * horizontal). Akibatnya sticky rusak -- PERSIS bug yang sudah
 * didokumentasikan untuk MobileTopBar di App.tsx, jadi solusinya sama:
 * taruh di luar ancestor yang overflow-nya bukan "visible".
 *
 * Konsekuensi dari solusi ini: judul besar di sini TIDAK ikut ter-swipe
 * kalau user geser carousel ke kartu Pos Dompet -- ini justru BENAR untuk
 * pola native (large title halaman semestinya tidak "hilang" saat swipe
 * konten lain, beda dengan versi lama yang menumpangkan greeting di
 * kartu yang sama dengan carousel).
 *
 * Struktur render:
 *  1. Judul besar (h1, selalu terlihat, sedikit scale-down saat discroll)
 *     + baris status (dot warna + subGreeting.text) -- ini pengganti
 *     paragraf italic panjang yang dulu ada di DashboardHeader.tsx.
 *  2. Compact bar (sticky, menempel persis di bawah MobileTopBar lewat
 *     var --mobile-topbar-h) -- TRANSPARAN & judulnya tidak terlihat di
 *     scroll=0 (opacity 0), baru fade-in begitu discroll melewati judul
 *     besar, supaya tidak duplikat teks.
 */
export const DashboardTitleHeader: React.FC<DashboardTitleHeaderProps> = ({ userId, displayName }) => {
  const { tokens, cx } = useThemeTokens();
  const { greetingText, subGreeting } = useDashboardGreeting(userId, displayName);

  const { scrollY } = useScroll();
  const heroScale = useTransform(scrollY, [0, 70], [1, 0.92]);
  const compactOpacity = useTransform(scrollY, [30, 70], [0, 1]);
  const compactY = useTransform(scrollY, [30, 70], [-6, 0]);

  // Warna dot status, reuse token text.* yang sama persis dipakai badge
  // lain di app -- bukan kombinasi warna baru, jadi tidak perlu entri
  // tokens.ts terpisah (hanya dipakai sebagai bg-current di dot kecil).
  const statusDotColor: Record<SubGreetingType, string> = {
    budget_danger: tokens.text.danger,
    budget_warning: tokens.text.warning,
    budget_ok: tokens.text.success,
    empty: tokens.text.faint,
    loading: tokens.text.faint,
  };

  return (
    <div className="md:hidden mb-6">
      {/* Judul besar -- selalu terlihat begitu halaman dibuka, tidak ikut
          ter-swipe carousel di bawahnya. */}
      <div className="pb-1">
        <motion.h1
          style={{ scale: heroScale, originX: 0 }}
          className={cx("font-sans font-bold text-3xl tracking-tight", tokens.text.primary)}
        >
          {greetingText}
        </motion.h1>
        <div className="flex items-center gap-1.5 mt-1">
          <span className={cx("w-1.5 h-1.5 rounded-full bg-current shrink-0", statusDotColor[subGreeting.type])} aria-hidden="true" />
          <p className={cx("font-sans text-xs leading-relaxed line-clamp-1 transition-colors", tokens.text.muted)}>
            {subGreeting.text}
          </p>
        </div>
      </div>

      {/* Compact bar -- menempel di bawah MobileTopBar, transparan &
          invisible di scroll=0 supaya tidak duplikat dengan judul besar
          di atas. Wrapper sticky diberi height:0 (SENGAJA, supaya tidak
          menyisakan jarak kosong sebelum carousel di bawah selama compact
          bar belum aktif) -- konten visualnya absolute positioned di
          dalam, jadi baru "menimpa" layout begitu opacity fade-in saat
          discroll, tanpa pernah mengubah tinggi dokumen. inset-x-0 saja
          (tanpa -mx-4/px-4 seperti ui/CollapsingHeader.tsx) karena di sini
          tidak ada container max-w terpisah yang perlu di-bleed -- lebar
          compact bar cukup mengikuti lebar konten halaman apa adanya. */}
      <motion.div
        className="sticky z-20"
        style={{ top: "var(--mobile-topbar-h)", height: 0 }}
      >
        <div className="absolute inset-x-0">
          <motion.div
            className={cx("absolute inset-0 backdrop-blur-md", tokens.surface.canvas)}
            style={{ opacity: compactOpacity }}
            aria-hidden="true"
          />
          <motion.div
            className={cx("absolute inset-x-0 bottom-0 h-px", tokens.dashboardTitleHeader.compactBarHairline)}
            style={{ opacity: compactOpacity }}
            aria-hidden="true"
          />
          <motion.div
            className="relative flex items-center gap-2 py-2"
            style={{ opacity: compactOpacity, y: compactY }}
          >
            <span className={cx("w-1.5 h-1.5 rounded-full bg-current shrink-0", statusDotColor[subGreeting.type])} aria-hidden="true" />
            <h2 className={cx("font-sans font-bold text-sm truncate", tokens.text.primary)}>
              {greetingText}
            </h2>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
};
