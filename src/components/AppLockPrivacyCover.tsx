import React, { forwardRef } from "react";
import { useThemeTokens } from "../hooks/useThemeTokens";
import logoUrl from "../assets/images/user_logo_transparent.png";

/**
 * Lapisan penutup instan yang menyembunyikan seluruh layar begitu app
 * masuk ke background (`visibilitychange` -> "hidden"), TERPISAH dari
 * <AppLockScreen/> (layar PIN penuh).
 *
 * Kenapa perlu komponen terpisah:
 * <AppLockScreen/> hanya muncul lewat re-render React biasa (state
 * `isLocked` di AppLockContext), yang baru "jadi" pada commit berikutnya.
 * Tapi OS (app-switcher iOS / Recents Android) mengambil thumbnail dari
 * frame yang SEDANG tampil PADA SAAT `visibilitychange` terjadi -- kalau
 * kita menunggu setState + re-render, saldo/nominal yang sedang terbuka
 * bisa keburu ke-capture di thumbnail itu, walau cuma sepersekian detik.
 *
 * Solusinya: elemen ini SELALU ter-mount (tidak conditional-render), dan
 * visibilitasnya di-toggle LANGSUNG lewat `ref.current.style` di dalam
 * event handler `visibilitychange` (lihat AppLockContext.tsx) -- manipulasi
 * DOM langsung, bukan lewat `setState`. Ini membuat perubahan terjadi di
 * frame yang SAMA dengan event, meniru pola native banking app
 * (`onPause` / `applicationWillResignActive`) yang memasang cover SEBELUM
 * sistem operasi sempat mengambil screenshot, bukan menunggu app dibuka
 * lagi baru menyembunyikan layar sebelumnya.
 *
 * `z-[190]` sengaja diletakkan SATU TINGKAT DI BAWAH <AppLockScreen/>
 * (`z-[200]`): kalau timeout terlampaui dan PIN screen ikut muncul, PIN
 * pad tetap di atas & bisa disentuh -- cover ini otomatis "tertutup" oleh
 * AppLockScreen tanpa perlu koordinasi tambahan. Kalau timeout belum
 * terlampaui (cuma sebentar pindah app), cover ini saja yang menutupi
 * konten sebelum akhirnya disembunyikan lagi saat kembali.
 */
export const AppLockPrivacyCover = forwardRef<HTMLDivElement>((_, ref) => {
  const { tokens, cx } = useThemeTokens();

  return (
    <div
      ref={ref}
      // State awal: tak terlihat & tidak menghalangi interaksi. SEMUA
      // perubahan setelah ini dilakukan lewat `ref.style` langsung di
      // AppLockContext -- BUKAN lewat prop/state React -- demi kecepatan.
      style={{ opacity: 0, pointerEvents: "none" }}
      aria-hidden="true"
      className={cx(
        // `tokens.surface.canvas` sengaja translucent di tema light_sakura
        // (dipakai sebagai lapisan tipis di atas elemen lain) -- untuk
        // cover privasi ini kita perlu solid 100% opaque, jadi pakai
        // `tokens.surface.card` yang solid di kedua tema.
        "fixed inset-0 z-[190] flex items-center justify-center",
        tokens.surface.card
      )}
    >
      <img
        src={logoUrl}
        alt=""
        className="w-16 h-16 rounded-2xl shadow-lg opacity-40 blur-[2px]"
      />
    </div>
  );
});

AppLockPrivacyCover.displayName = "AppLockPrivacyCover";
