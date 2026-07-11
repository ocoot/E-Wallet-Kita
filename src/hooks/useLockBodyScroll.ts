import { useLayoutEffect } from "react";

// Dijaga di level modul (bukan per-komponen) supaya beberapa pemanggil
// `useLockBodyScroll` yang aktif BERSAMAAN -- mis. dialog konfirmasi hapus
// yang masih terbuka SEKALIGUS state "sedang menghapus" di komponen
// induknya -- saling "bertumpuk" dengan aman alih-alih saling menimpa
// snapshot gaya asli <body> milik satu sama lain.
let lockCount = 0;
let savedScrollY = 0;
let anchorEl: Element | null = null;
let anchorOffset = 0;
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
 * browser mobile (khususnya iOS Safari). Posisi scroll dikembalikan saat
 * modal ditutup dengan cara "menjangkar" ke elemen DOM nyata yang ada di
 * bagian atas viewport saat dialog dibuka -- BUKAN sekadar angka piksel
 * mentah (`window.scrollY`). Kenapa: kalau aksi di dalam dialog mengubah
 * tinggi konten sebelum dialog ditutup (mis. dialog konfirmasi hapus yang,
 * setelah berhasil, me-refresh list sehingga 1 kartu hilang SELAGI dialog
 * masih terkunci), angka piksel lama itu sudah tidak valid -- ia bisa
 * menunjuk ke bagian konten yang sudah berbeda entah di atas atau di
 * bawah titik itu. Menjangkar ke elemen sungguhan benar di kedua arah
 * karena kita mengembalikan scroll ke POSISI ELEMEN ITU SEKARANG, bukan
 * ke koordinat lama yang mungkin sudah tidak relevan.
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

      // Cari elemen sungguhan yang sedang duduk di dekat bagian atas
      // viewport (bukan pojok paling atas -- kalau ada header/nav yang
      // sticky di titik (x, 0), elementFromPoint bisa mengembalikan
      // elemen sticky itu alih-alih konten di baliknya). y=80 kira-kira
      // aman di bawah header pada kebanyakan halaman.
      const probeX = Math.floor(window.innerWidth / 2);
      const probeY = 80;
      const candidate = document.elementFromPoint(probeX, probeY);
      if (candidate && candidate !== document.body && candidate !== document.documentElement) {
        anchorEl = candidate;
        anchorOffset = candidate.getBoundingClientRect().top;
      } else {
        anchorEl = null;
      }

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
        // Kembalikan scroll dengan menjangkar ke elemen nyata (lihat
        // catatan di atas fungsi). Kalau elemen jangkarnya sudah tidak ada
        // lagi di dokumen (mis. justru itu yang terhapus), fallback ke
        // `savedScrollY` mentah tapi dibatasi ke tinggi dokumen yang
        // tersisa supaya tidak overscroll ke area kosong.
        const maxScrollY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
        if (anchorEl && document.body.contains(anchorEl)) {
          const currentTop = anchorEl.getBoundingClientRect().top;
          const targetScrollY = window.scrollY + currentTop - anchorOffset;
          window.scrollTo(0, Math.min(Math.max(0, targetScrollY), maxScrollY));
        } else {
          window.scrollTo(0, Math.min(savedScrollY, maxScrollY));
        }
        anchorEl = null;
        savedBodyStyles = null;
      }
    };
  }, [isLocked]);
}
