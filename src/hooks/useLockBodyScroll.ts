import { useLayoutEffect } from "react";

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
 * Dipakai oleh SEMUA komponen modal/dialog konfirmasi di app ini supaya
 * perilakunya konsisten satu sama lain.
 */
export function useLockBodyScroll(isLocked: boolean): void {
  useLayoutEffect(() => {
    if (!isLocked) return;

    const scrollY = window.scrollY;
    const { body } = document;
    const previousStyles = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      overflowY: body.style.overflowY,
    };

    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    body.style.overflowY = "scroll";

    return () => {
      body.style.position = previousStyles.position;
      body.style.top = previousStyles.top;
      body.style.left = previousStyles.left;
      body.style.right = previousStyles.right;
      body.style.width = previousStyles.width;
      body.style.overflowY = previousStyles.overflowY;
      window.scrollTo(0, scrollY);
    };
  }, [isLocked]);
}
