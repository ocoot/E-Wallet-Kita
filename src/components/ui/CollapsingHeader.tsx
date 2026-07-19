import React from "react";
import { motion, useScroll, useTransform } from "motion/react";
import { useThemeTokens } from "../../hooks/useThemeTokens";

interface CollapsingHeaderProps {
  /** Judul besar halaman (mis. "Dashboard", "Riwayat", "Pengaturan"). */
  title: string;
  /** Deskripsi singkat di bawah judul, ikut memudar saat discroll. */
  description?: string;
  className?: string;
}

/**
 * Item 2.3 (P2) -- Collapsing large-title header.
 *
 * Murni efek visual (scroll-listener + interpolasi ukuran/opacity via
 * `motion`), TIDAK menyentuh logika bisnis / struktur data apa pun.
 * Meniru pola large-title iOS Settings & Material apps: judul besar di
 * awal halaman, lalu mengecil + latar belakang menempel (blur + shadow
 * tipis) begitu halaman mulai discroll, supaya terasa seperti nav bar
 * native yang "collapse", bukan judul statis ala web.
 *
 * Sengaja HANYA dipakai di breakpoint mobile (md:hidden) -- versi desktop
 * tiap halaman sudah punya header kartu sendiri yang tidak diubah.
 *
 * Dipasang di bawah `MobileTopBar` (lihat App.tsx) yang sudah sticky
 * duluan; scroll yang dipakai di sini scroll dokumen/window yang sama
 * (`useScroll` tanpa target = window), jadi tetap akurat walau berada di
 * page manapun.
 */
export const CollapsingHeader: React.FC<CollapsingHeaderProps> = ({
  title,
  description,
  className = "",
}) => {
  const { tokens, cx } = useThemeTokens();
  const { scrollY } = useScroll();

  // Rentang scroll 0-70px dipakai sebagai "jarak collapse" -- cukup pendek
  // supaya efeknya langsung terasa begitu jari mulai menggeser, seperti
  // large-title native, bukan baru muncul setelah scroll jauh.
  const titleScale = useTransform(scrollY, [0, 70], [1, 0.8]);
  const descOpacity = useTransform(scrollY, [0, 36], [1, 0]);
  const descMarginTop = useTransform(scrollY, [0, 36], [4, 0]);
  const bgOpacity = useTransform(scrollY, [0, 60], [0, 1]);
  const shadowOpacity = useTransform(scrollY, [0, 60], [0, 1]);

  return (
    <div className={cx("md:hidden sticky top-0 z-20 -mx-4 px-4", className)}>
      {/* Layer latar belakang + shadow terpisah dari teks, supaya blur/
          shadow bisa fade-in independen tanpa ikut menskalakan judul. */}
      <motion.div
        className={cx("absolute inset-0 backdrop-blur-md", tokens.surface.canvas)}
        style={{ opacity: bgOpacity }}
        aria-hidden="true"
      />
      <motion.div
        className="absolute inset-x-0 bottom-0 h-px bg-black/10 dark:bg-white/10"
        style={{ opacity: shadowOpacity }}
        aria-hidden="true"
      />

      <div className="relative py-2.5">
        <motion.h1
          style={{ scale: titleScale, originX: 0 }}
          className={cx("font-sans font-bold text-2xl tracking-tight", tokens.text.primary)}
        >
          {title}
        </motion.h1>
        {description && (
          <motion.p
            style={{ opacity: descOpacity, marginTop: descMarginTop }}
            className={cx("font-sans text-xs overflow-hidden", tokens.text.muted)}
          >
            {description}
          </motion.p>
        )}
      </div>
    </div>
  );
};
