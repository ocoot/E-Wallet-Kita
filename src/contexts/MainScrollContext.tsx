import React, { createContext, useContext, useRef } from "react";

/**
 * Seluruh halaman (Dashboard, History, dst) di-render sebagai children dari
 * SATU elemen `<main overflow-y-auto>` di App.tsx (lihat komentar "Main
 * active subview frame") -- bukan tiap halaman punya scroll container
 * sendiri. Supaya gesture pull-to-refresh (lihat `usePullToRefresh.ts`)
 * bisa mendeteksi `scrollTop === 0` dan touch move dari elemen yang BENAR-
 * BENAR scroll (bukan div halaman yang cuma "numpang" di dalamnya), ref ke
 * `<main>` itu perlu bisa diakses dari komponen halaman manapun -- context
 * kecil ini yang menjembataninya, supaya tidak perlu prop-drilling ref
 * lewat React Router.
 */
const MainScrollContext = createContext<React.RefObject<HTMLElement | null> | null>(null);

export const MainScrollProvider: React.FC<{
  scrollRef: React.RefObject<HTMLElement | null>;
  children: React.ReactNode;
}> = ({ scrollRef, children }) => (
  <MainScrollContext.Provider value={scrollRef}>{children}</MainScrollContext.Provider>
);

/** Dipakai dari dalam `usePullToRefresh` -- return `null` kalau dipanggil di luar provider (aman, hook itu no-op). */
export function useMainScrollRef(): React.RefObject<HTMLElement | null> | null {
  return useContext(MainScrollContext);
}

// ─────────────────────────────────────────────────────────────────────────
// FIX (UI/UX, Agu 2026): kontainer portal untuk header sticky/fixed halaman
// (dipakai pertama oleh CollapsingPageHeader).
//
// Root cause kenapa CollapsingPageHeader sebelumnya TIDAK PERNAH kelihatan
// menempel walau state `isCollapsed`-nya sudah `true`: di App.tsx, seluruh
// konten route dibungkus `motion.div` untuk animasi transisi push/pop-nya
// (variants pakai `x`, termasuk di state diam "center" yaitu `x: 0`).
// Framer Motion tetap menulis `transform: translateX(0px)` inline walau
// nilainya nol -- dan menurut spec CSS, ancestor APA PUN dengan `transform`
// selain `none` (termasuk translateX(0px)) membentuk *containing block*
// baru untuk descendant `position: sticky`/`fixed`. Akibatnya `position:
// sticky; top: 0` di dalam motion.div itu tidak lagi dihitung relatif ke
// scrollport `<main overflow-y-auto>`, melainkan relatif ke box motion.div
// itu sendiri -- efektif berperilaku seperti `position: relative` yang diam
// di posisi flow normalnya (paling atas halaman, langsung terscroll lewat
// begitu saja), BUKAN menempel ke viewport.
//
// Perbaikannya: sediakan satu node portal yang dipasang sebagai anak
// LANGSUNG `<main>`, SEBELUM motion.div transisi mana pun (lihat App.tsx).
// Komponen seperti CollapsingPageHeader me-render dirinya lewat
// `createPortal` ke node ini, sehingga posisi DOM efektifnya berada di LUAR
// containing block manapun kecuali `<main>` sendiri -- `position: sticky`
// pun kembali menempel dengan benar ke scrollport `<main>`.
const HeaderPortalContext = createContext<HTMLDivElement | null>(null);

export const HeaderPortalProvider: React.FC<{
  node: HTMLDivElement | null;
  children: React.ReactNode;
}> = ({ node, children }) => (
  <HeaderPortalContext.Provider value={node}>{children}</HeaderPortalContext.Provider>
);

/** Dipakai dari CollapsingPageHeader (dan komponen sticky header sejenis ke depannya). Return `null` kalau dipanggil di luar provider -- caller wajib fallback ke render biasa (tanpa portal) di kondisi itu. */
export function useHeaderPortalNode(): HTMLDivElement | null {
  return useContext(HeaderPortalContext);
}
