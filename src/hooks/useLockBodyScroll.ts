import { useLayoutEffect } from "react";

// Dijaga di level modul (bukan per-komponen) supaya beberapa pemanggil
// `useLockBodyScroll` yang aktif BERSAMAAN -- mis. dialog konfirmasi hapus
// yang masih terbuka SEKALIGUS state "sedang menghapus" di komponen
// induknya -- saling "bertumpuk" dengan aman alih-alih saling menimpa
// snapshot gaya asli <body> milik satu sama lain.
let lockCount = 0;
let savedScrollY = 0;
let savedBodyStyles: {
  position: string;
  top: string;
  left: string;
  right: string;
  width: string;
  overflowY: string;
} | null = null;

/**
 * Mengunci scroll pada <body> selama modal/dialog konfirmasi terbuka.
 *
 * Kenapa perlu: sebelumnya TIDAK ADA mekanisme scroll-lock sama sekali di
 * app ini. Overlay modal ("fixed inset-0 ...") secara visual menutupi
 * konten di belakangnya, tapi elemen-elemen di belakang overlay itu masih
 * bisa di-scroll (terutama lewat touch-scroll di mobile), sehingga user
 * melihat konten background ikut bergeser padahal modal-nya sendiri diam.
 *
 * Pendekatan yang dipakai: `position: fixed` pada <body> (bukan sekadar
 * `overflow: hidden`), karena `overflow: hidden` saja terbukti tidak cukup
 * untuk mencegah touch-scroll "tembus" ke belakang overlay di banyak
 * browser mobile (khususnya iOS Safari). Posisi scroll disimpan sebelum
 * dikunci dan dikembalikan persis saat modal ditutup, supaya halaman tidak
 * "melompat" ke atas.
 *
 * PENTING -- reference counting: kalau dua pemanggil sama-sama mengunci di
 * saat bersamaan (mis. modal konfirmasi hapus transaksi MASIH terbuka lalu
 * proses hapusnya sendiri juga memicu satu pengunci lain lewat state
 * loading terpisah), hanya PENGUNCI PERTAMA yang menyimpan posisi/scroll
 * asli <body>, dan hanya PEMBUKA KUNCI TERAKHIR yang mengembalikannya.
 * Tanpa ini, pengunci kedua akan menyimpan snapshot <body> yang SUDAH
 * dalam kondisi terkunci (position: fixed) sebagai "kondisi asli"-nya, lalu
 * saat dia melepas kunci duluan, <body> malah dikembalikan ke kondisi
 * terkunci itu secara permanen -- inilah yang menyebabkan halaman tidak
 * bisa discroll lagi setelah dialog ditutup.
 *
 * Dipakai oleh SEMUA komponen modal/dialog konfirmasi di app ini supaya
 * perilakunya konsisten satu sama lain.
 */
export function useLockBodyScroll(isLocked: boolean): void {
  useLayoutEffect(() => {
    if (!isLocked) return;

    lockCount += 1;

    if (lockCount === 1) {
      savedScrollY = window.scrollY;
      const { body } = document;
      savedBodyStyles = {
        position: body.style.position,
        top: body.style.top,
        left: body.style.left,
        right: body.style.right,
        width: body.style.width,
        overflowY: body.style.overflowY,
      };

      body.style.position = "fixed";
      body.style.top = `-${savedScrollY}px`;
      body.style.left = "0";
      body.style.right = "0";
      body.style.width = "100%";
      body.style.overflowY = "scroll";
    }

    return () => {
      lockCount = Math.max(0, lockCount - 1);

      if (lockCount === 0 && savedBodyStyles) {
        const { body } = document;
        body.style.position = savedBodyStyles.position;
        body.style.top = savedBodyStyles.top;
        body.style.left = savedBodyStyles.left;
        body.style.right = savedBodyStyles.right;
        body.style.width = savedBodyStyles.width;
        body.style.overflowY = savedBodyStyles.overflowY;
        window.scrollTo(0, savedScrollY);
        savedBodyStyles = null;
      }
    };
  }, [isLocked]);
}
