import { useEffect, useRef, useCallback } from "react";

/**
 * Menjebak tombol/gesture "back" milik browser atau OS (edge-swipe di
 * Android/Chrome, swipe-back di Safari iOS, tombol hardware back) supaya
 * MENUTUP modal/bottom-sheet yang sedang terbuka -- bukan malah
 * menavigasi halaman di baliknya.
 *
 * Kenapa perlu: overlay modal ("fixed inset-0 ...") hanya mengontrol
 * elemen DOM & event klik/keyboard di dalam React. Gesture back bawaan
 * OS/browser beroperasi di level history-stack browser, di LUAR jangkauan
 * listener klik biasa -- jadi tanpa penanganan khusus, swipe-back akan
 * tetap memicu navigasi route sebenarnya (atau riwayat sebelumnya) DI
 * BALIK overlay yang secara visual masih menutupi layar, membuat sheet
 * terlihat "nyangkut" sementara konten di baliknya sudah berpindah.
 *
 * Cara kerja: begitu modal terbuka, kita sisipkan satu history-entry semu
 * (path sama persis, cuma beda `state`) lewat `pushState`. Begitu user
 * melakukan gesture/tombol back, browser "memakan" entry semu itu dan
 * memicu event `popstate` -- inilah yang kita dengarkan untuk menutup
 * modal. Entry semu itu tidak mengubah URL sama sekali, jadi tidak
 * berpengaruh ke alamat/route sungguhan.
 *
 * `close()` yang dikembalikan dipakai untuk penutupan lewat UI (tombol X,
 * klik backdrop, Escape) -- ia membersihkan entry semu tsb (lewat
 * `history.back()`) supaya user tidak perlu menekan tombol back dua kali
 * di lain waktu untuk benar-benar keluar dari halaman. Untuk penutupan
 * yang DIIKUTI navigasi sungguhan (klik menu, logout), cukup panggil
 * `setIsOpen(false)` biasa -- entry semu itu otomatis "tertimbun" secara
 * wajar oleh entry rute baru dan tidak menimbulkan efek samping apa pun.
 */
export function useBackGestureTrap(
  isOpen: boolean,
  setIsOpen: (open: boolean) => void
): { close: () => void } {
  const pushedRef = useRef(false);

  useEffect(() => {
    if (!isOpen) return;

    window.history.pushState({ __sheetOpen: true }, "");
    pushedRef.current = true;

    const handlePopState = () => {
      pushedRef.current = false;
      setIsOpen(false);
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const close = useCallback(() => {
    setIsOpen(false);
    if (pushedRef.current) {
      pushedRef.current = false;
      window.history.back();
    }
  }, [setIsOpen]);

  return { close };
}
