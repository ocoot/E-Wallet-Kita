import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Menyatukan 3 kebutuhan aksesibilitas standar untuk modal/dialog:
 *
 * 1. Focus trap -- saat dialog terbuka, tombol Tab / Shift+Tab hanya
 *    berputar di antara elemen fokusabel DI DALAM dialog, tidak "bocor"
 *    ke konten di belakangnya (yang secara visual memang tertutup overlay,
 *    tapi tanpa trap ini screen-reader/keyboard user tetap bisa
 *    ter-navigasi ke sana).
 * 2. Escape untuk menutup -- konvensi standar WAI-ARIA Dialog Pattern.
 * 3. Pengelolaan fokus -- begitu dialog dibuka, fokus dipindah ke dalam
 *    dialog (ke container-nya sendiri kalau tidak ada elemen fokusabel
 *    lain); begitu ditutup, fokus dikembalikan ke elemen yang tadinya
 *    aktif sebelum dialog dibuka (mis. tombol yang memicunya).
 *
 * Sebelumnya TIDAK ADA satupun dari 3 hal ini di modal manapun di app ini.
 */
export function useDialogA11y(
  isOpen: boolean,
  containerRef: RefObject<HTMLElement | null>,
  onClose?: () => void
): void {
  const previouslyFocused = useRef<HTMLElement | null>(null);

  // Simpan onClose terbaru di ref, BUKAN di dependency array useEffect di
  // bawah. Sebelumnya onClose ada di deps -- karena hampir semua caller
  // mengoper inline arrow function (`() => setIsFormOpen(false)`) yang
  // dibuat ulang setiap render, efek ini bongkar-pasang ULANG setiap kali
  // parent re-render. Untuk form yang sedang diketik, itu berarti SETIAP
  // KETUKAN HURUF: cleanup memindahkan fokus balik ke tombol pemicu dialog
  // (mematikan keyboard HP), lalu efek jalan lagi memindahkan fokus ke
  // input pertama. Dengan onClose di ref, efek hanya jalan saat `isOpen`
  // benar-benar berubah, bukan setiap keystroke.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;

    // Pindahkan fokus ke dalam dialog begitu dibuka. Delay 1 frame supaya
    // elemen dialog (yang baru saja di-mount lewat AnimatePresence) sudah
    // ada di DOM saat kita coba fokuskan.
    const focusTimer = window.setTimeout(() => {
      const container = containerRef.current;
      if (!container) return;
      const firstFocusable = container.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      (firstFocusable ?? container).focus({ preventScroll: true });
    }, 0);

    const handleKeyDown = (e: KeyboardEvent) => {
      const container = containerRef.current;
      if (!container) return;

      if (e.key === "Escape" && onCloseRef.current) {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }

      if (e.key !== "Tab") return;

      const nodeList = container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      const focusable: HTMLElement[] = Array.prototype.filter.call(
        nodeList,
        (el: HTMLElement) => el.offsetParent !== null // skip elemen yang lagi disembunyikan
      );

      if (focusable.length === 0) {
        e.preventDefault();
        return;
      }

      const first: HTMLElement = focusable[0];
      const last: HTMLElement = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);

    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", handleKeyDown, true);
      // Kembalikan fokus ke elemen pemicu dialog (mis. tombol "Hapus" yang
      // dulu ditekan), supaya keyboard/screen-reader user tidak "kehilangan
      // posisi" begitu dialog ditutup. TAPI hanya kalau elemen itu masih
      // ada di DOM -- kalau dialognya ditutup karena aksi yang menghapus
      // elemen tsb dari list (mis. hapus pos anggaran), elemen pemicu
      // sudah lenyap/posisinya bergeser, dan memaksa focus() ke situ justru
      // memicu browser scroll balik ke posisi lama meski preventScroll.
      const prev = previouslyFocused.current;
      if (prev && document.body.contains(prev)) {
        prev.focus({ preventScroll: true });
      }
    };
  }, [isOpen, containerRef]);
}
