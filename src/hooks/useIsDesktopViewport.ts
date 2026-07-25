import { useEffect, useState } from "react";

/**
 * Melacak apakah viewport saat ini berada di breakpoint desktop (`lg`,
 * >=1024px) -- meniru breakpoint Tailwind `lg:` yang dipakai di seluruh app
 * (lihat MobileBottomNav.tsx, Sidebar.tsx yang saling eksklusif lewat
 * `lg:hidden` / `hidden lg:flex`).
 *
 * REVISI breakpoint (768px -> 1024px): sebelumnya memakai `md`, tapi itu
 * membuat tablet portrait (768-1023px) diperlakukan sebagai "desktop"
 * padahal navigasinya sendiri (Sidebar/MobileBottomNav) sudah dipindah ke
 * breakpoint `lg`. Kalau hook ini dibiarkan di 768px, di lebar tablet
 * navbar bawah akan tampil (mode mobile) tapi halaman ini & `ModalShell`
 * tetap berpikir "desktop" -- dua sistem jadi tidak sinkron. Diseragamkan
 * ke `lg` supaya satu breakpoint tunggal dipakai konsisten di semua
 * tempat yang bergantung ke hook ini.
 *
 * Dipakai oleh halaman detail Profile/Akun (mis. `/settings/profile`,
 * `/settings/security`, dst) yang HANYA didesain ulang untuk tampilan
 * mobile -- di layar desktop, halaman grid `/settings` yang lama (belum
 * diubah) sudah mencakup semua kontrol yang sama sekaligus dalam satu
 * layar, jadi halaman detail per-menu ini tidak relevan lagi di sana.
 */
export function useIsDesktopViewport(): boolean {
  const [isDesktop, setIsDesktop] = useState(
    typeof window !== "undefined" ? window.matchMedia("(min-width: 1024px)").matches : false
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 1024px)");
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
