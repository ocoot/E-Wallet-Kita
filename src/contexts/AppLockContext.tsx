import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { useAuth } from "./AuthContext";
import { isAppLockEnabled, APP_LOCK_TIMEOUT_MS } from "../lib/appLock";

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
 * Trigger re-lock:
 * 1. Saat pertama kali user diketahui login DAN fitur App Lock aktif
 *    (termasuk refresh halaman / buka app dari tertutup penuh).
 * 2. Saat tab/app kembali terlihat (`visibilitychange` -> "visible")
 *    SETELAH tersembunyi lebih lama dari `APP_LOCK_TIMEOUT_MS` -- meniru
 *    pola app finansial native yang tidak minta PIN untuk sekadar
 *    pindah-pindah app sebentar (mis. buka kamera lalu balik lagi),
 *    tapi tetap minta kalau app benar-benar ditinggal lama.
 */
export const AppLockProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [lockFeatureEnabled, setLockFeatureEnabled] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const hiddenAtRef = useRef<number | null>(null);
  const hasMountedLockRef = useRef(false);

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
      if (!lockFeatureEnabled || !userId) return;

      if (document.visibilityState === "hidden") {
        hiddenAtRef.current = Date.now();
        return;
      }

      if (document.visibilityState === "visible") {
        const hiddenAt = hiddenAtRef.current;
        hiddenAtRef.current = null;
        if (hiddenAt && Date.now() - hiddenAt >= APP_LOCK_TIMEOUT_MS) {
          setIsLocked(true);
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [lockFeatureEnabled, userId]);

  const unlock = useCallback(() => setIsLocked(false), []);
  const lockNow = useCallback(() => {
    if (lockFeatureEnabled) setIsLocked(true);
  }, [lockFeatureEnabled]);

  return (
    <AppLockContext.Provider
      value={{ lockFeatureEnabled, isLocked, unlock, refreshLockFeatureState, lockNow }}
    >
      {children}
    </AppLockContext.Provider>
  );
};
