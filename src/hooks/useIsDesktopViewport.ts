import { useEffect, useState } from "react";

/**
 * Melacak apakah viewport saat ini berada di breakpoint desktop (`md`,
 * >=768px) -- meniru breakpoint Tailwind `md:` yang dipakai di seluruh app
 * (lihat MobileTopBar.tsx, MobileBottomNav.tsx, Sidebar.tsx yang saling
 * eksklusif lewat `md:hidden` / `hidden md:flex`).
 *
 * Dipakai oleh halaman detail Profile/Akun (mis. `/settings/profile`,
 * `/settings/security`, dst) yang HANYA didesain ulang untuk tampilan
 * mobile -- di layar desktop, halaman grid `/settings` yang lama (belum
 * diubah) sudah mencakup semua kontrol yang sama sekaligus dalam satu
 * layar, jadi halaman detail per-menu ini tidak relevan lagi di sana.
 */
export function useIsDesktopViewport(): boolean {
  const [isDesktop, setIsDesktop] = useState(
    typeof window !== "undefined" ? window.matchMedia("(min-width: 768px)").matches : false
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 768px)");
    const handleChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    try {
      mediaQuery.addEventListener("change", handleChange);
    } catch (e) {
      try {
        mediaQuery.addListener(handleChange);
      } catch (err) {}
    }
    return () => {
      try {
        mediaQuery.removeEventListener("change", handleChange);
      } catch (e) {
        try {
          mediaQuery.removeListener(handleChange);
        } catch (err) {}
      }
    };
  }, []);

  return isDesktop;
}
