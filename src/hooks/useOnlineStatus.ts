import { useEffect, useState } from "react";

/**
 * Melacak status koneksi browser (navigator.onLine + event online/offline).
 *
 * Sebelumnya app ini tidak punya state "offline" sama sekali di level UI --
 * kalau koneksi putus, permintaan data cuma gagal diam-diam
 * (`console.error`) tanpa pemberitahuan apapun ke pengguna. Hook ini jadi
 * dasar untuk `OfflineBanner` supaya pengguna tahu kenapa data tidak
 * termuat/tersimpan, alih-alih mengira app-nya rusak.
 */
export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return isOnline;
}
