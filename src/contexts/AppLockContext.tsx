import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { useAuth } from "./AuthContext";
import { isAppLockEnabled, APP_LOCK_TIMEOUT_MS } from "../lib/appLock";
import { AppLockPrivacyCover } from "../components/AppLockPrivacyCover";

interface AppLockContextType {
  /** Apakah App Lock sedang aktif (fitur di-ON-kan) untuk user ini. */
  lockFeatureEnabled: boolean;
  /** Apakah layar kunci SEDANG ditampilkan (menutupi seluruh app). */
  isLocked: boolean;
  /** Dipanggil AppLockScreen setelah PIN/biometric terverifikasi. */
  unlock: () => void;
  /** Panggil setelah user mengaktifkan/menonaktifkan App Lock di Settings. */
  refreshLockFeatureState: () => void;
  /** Kunci ulang secara manual (mis. tombol "Kunci Sekarang"). */
  lockNow: () => void;
}

const AppLockContext = createContext<AppLockContextType>({
  lockFeatureEnabled: false,
  isLocked: false,
  unlock: () => {},
  refreshLockFeatureState: () => {},
  lockNow: () => {},
});

export const useAppLock = () => useContext(AppLockContext);

/**
 * Menjaga status "terkunci" seluruh app. Dipasang tinggi di tree (App.tsx,
 * di dalam AuthProvider) supaya bisa membaca `user.id` dan menggantikan
 * konten utama dengan <AppLockScreen/> sebelum apa pun yang sensitif
 * (saldo, riwayat transaksi) sempat dirender.
 *
 * Trigger re-lock (PIN penuh, <AppLockScreen/>):
 * 1. Saat pertama kali user diketahui login DAN fitur App Lock aktif
 *    (termasuk refresh halaman / buka app dari tertutup penuh).
 * 2. Saat tab/app kembali terlihat (`visibilitychange` -> "visible")
 *    SETELAH tersembunyi lebih lama dari `APP_LOCK_TIMEOUT_MS` -- meniru
 *    pola app finansial native yang tidak minta PIN untuk sekadar
 *    pindah-pindah app sebentar (mis. buka kamera lalu balik lagi),
 *    tapi tetap minta kalau app benar-benar ditinggal lama.
 *
 * Trigger cover instan (<AppLockPrivacyCover/>, BUKAN layar PIN):
 * Begitu `visibilitychange` -> "hidden" terdeteksi (app masuk ke
 * app-switcher OS / berpindah tab), SEBELUM tahu apakah nanti perlu PIN
 * atau tidak. Ini mencegah OS sempat meng-capture thumbnail berisi
 * saldo/nominal untuk app-switcher-nya -- provider ini memasangnya lewat
 * manipulasi DOM langsung (`ref.style`, bukan `setState`) supaya berubah
 * di frame yang sama dengan event, bukan menunggu React re-render.
 *
 * PENTING: cover ini SENGAJA TIDAK digantungkan ke `lockFeatureEnabled`
 * (App Lock/PIN). Menyembunyikan saldo dari thumbnail recent-apps adalah
 * proteksi privasi dasar yang harus berlaku untuk SEMUA user yang sedang
 * login, terlepas dari apakah mereka mengaktifkan PIN/biometric atau
 * tidak -- persis seperti Gopay/OVO/Dana yang tetap mem-blur konten di
 * app-switcher walau App Lock mereka mati. `lockFeatureEnabled` hanya
 * relevan untuk menentukan apakah PERLU minta PIN lagi (re-lock) setelah
 * cukup lama di background -- BUKAN untuk menentukan apakah cover-nya
 * boleh muncul sama sekali.
 */
export const AppLockProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [lockFeatureEnabled, setLockFeatureEnabled] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const hiddenAtRef = useRef<number | null>(null);
  const hasMountedLockRef = useRef(false);

  // Elemen cover instan (lihat AppLockPrivacyCover.tsx) -- disentuh lewat
  // `ref.style` langsung, BUKAN lewat state React, supaya tampil/hilang di
  // frame yang sama dengan event `visibilitychange`, bukan menunggu commit
  // React berikutnya (yang di frame app-switcher OS sudah kalah cepat).
  const coverRef = useRef<HTMLDivElement>(null);

  const showCoverInstantly = useCallback(() => {
    const el = coverRef.current;
    if (!el) return;
    el.style.transition = "none";
    el.style.opacity = "1";
    el.style.pointerEvents = "auto";
  }, []);

  const hideCover = useCallback(() => {
    const el = coverRef.current;
    if (!el) return;
    el.style.transition = "opacity 150ms ease-out";
    el.style.opacity = "0";
    el.style.pointerEvents = "none";
  }, []);

  const refreshLockFeatureState = useCallback(() => {
    setLockFeatureEnabled(isAppLockEnabled(userId));
  }, [userId]);

  // Saat user berganti (login/logout/switch akun), evaluasi ulang dari awal.
  useEffect(() => {
    hasMountedLockRef.current = false;
    if (!userId) {
      setLockFeatureEnabled(false);
      setIsLocked(false);
      return;
    }
    const enabled = isAppLockEnabled(userId);
    setLockFeatureEnabled(enabled);
    setIsLocked(enabled);
    hasMountedLockRef.current = true;
  }, [userId]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      // Cover privasi berlaku untuk SEMUA user yang login, bukan cuma yang
      // mengaktifkan App Lock -- lihat catatan "PENTING" di komentar block
      // provider ini. Hanya butuh `userId` (ada sesi login).
      if (!userId) return;

      if (document.visibilityState === "hidden") {
        hiddenAtRef.current = Date.now();
        // Pasang cover SEKARANG JUGA (manipulasi DOM langsung), bukan lewat
        // setState -- lihat komentar di AppLockPrivacyCover.tsx kenapa ini
        // harus instan dan tidak boleh menunggu re-render React.
        showCoverInstantly();
        return;
      }

      if (document.visibilityState === "visible") {
        const hiddenAt = hiddenAtRef.current;
        hiddenAtRef.current = null;
        if (lockFeatureEnabled && hiddenAt && Date.now() - hiddenAt >= APP_LOCK_TIMEOUT_MS) {
          // Cukup lama di background DAN App Lock aktif -> minta PIN lagi.
          // Cover instan tetap menutupi layar (opacity masih 1) sampai
          // <AppLockScreen/> (z-index lebih tinggi) selesai ter-render di
          // atasnya, jadi tidak ada celah frame yang menampilkan konten
          // sensitif.
          setIsLocked(true);
        } else {
          // App Lock nonaktif, atau cuma sebentar di background (mis. buka
          // kamera lalu balik) -- tidak perlu PIN, cukup buka lagi cover-nya.
          hideCover();
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [lockFeatureEnabled, userId, showCoverInstantly, hideCover]);

  // Kalau user logout saat cover sedang terpasang (mis. sesi berakhir
  // tepat setelah kembali dari background), pastikan cover ikut terbuka --
  // jangan sampai app "kejebak" tertutup tanpa jalan keluar. Sengaja TIDAK
  // dipicu oleh `lockFeatureEnabled` saja (App Lock off) -- cover privasi
  // harus tetap bisa terpasang untuk user yang login walau App Lock-nya
  // nonaktif; kalau digantungkan ke situ, mematikan App Lock akan diam-diam
  // ikut mematikan blur privasi juga.
  useEffect(() => {
    if (!userId) {
      hiddenAtRef.current = null;
      hideCover();
    }
  }, [userId, hideCover]);

  const unlock = useCallback(() => {
    setIsLocked(false);
    hideCover();
  }, [hideCover]);
  const lockNow = useCallback(() => {
    if (lockFeatureEnabled) setIsLocked(true);
  }, [lockFeatureEnabled]);

  return (
    <AppLockContext.Provider
      value={{ lockFeatureEnabled, isLocked, unlock, refreshLockFeatureState, lockNow }}
    >
      {children}
      {/* Selalu ter-mount (bukan conditional) supaya toggle opacity lewat
          ref.style di atas langsung berefek tanpa delay mount/unmount --
          lihat komentar di AppLockPrivacyCover.tsx. */}
      <AppLockPrivacyCover ref={coverRef} />
    </AppLockContext.Provider>
  );
};
