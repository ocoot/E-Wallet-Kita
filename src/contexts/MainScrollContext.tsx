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
