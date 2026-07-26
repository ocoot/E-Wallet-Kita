import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { useAuth } from "./AuthContext";
import { isAppLockEnabled, isPrivacyBlurEnabled, APP_LOCK_TIMEOUT_MS } from "../lib/appLock";
import { AppLockPrivacyCover } from "../components/AppLockPrivacyCover";

interface AppLockContextType {
  /** Apakah App Lock sedang aktif (fitur di-ON-kan) untuk user ini. */
  lockFeatureEnabled: boolean;
  /**
   * Apakah toggle "Blur Privasi" aktif untuk user ini -- INDEPENDEN dari
   * `lockFeatureEnabled` (lihat catatan "PENTING" di bawah). Dipakai
   * murni untuk menentukan apakah <AppLockPrivacyCover/> boleh tampil,
   * bukan untuk PIN/biometric.
   */
  privacyBlurEnabled: boolean;
  /** Apakah layar kunci SEDANG ditampilkan (menutupi seluruh app). */
  isLocked: boolean;
  /** Dipanggil AppLockScreen setelah PIN/biometric terverifikasi. */
  unlock: () => void;
  /** Panggil setelah user mengaktifkan/menonaktifkan App Lock di Settings. */
  refreshLockFeatureState: () => void;
  /** Panggil setelah user mengaktifkan/menonaktifkan toggle Blur Privasi di Settings. */
  refreshPrivacyBlurState: () => void;
  /** Kunci ulang secara manual (mis. tombol "Kunci Sekarang"). */
  lockNow: () => void;
}

const AppLockContext = createContext<AppLockContextType>({
  lockFeatureEnabled: false,
  privacyBlurEnabled: true,
  isLocked: false,
  unlock: () => {},
  refreshLockFeatureState: () => {},
  refreshPrivacyBlurState: () => {},
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
 * (App Lock/PIN) -- ditentukan oleh toggle TERPISAH `privacyBlurEnabled`
 * (Settings > Kunci Aplikasi > "Blur Privasi", state disimpan lewat
 * `isPrivacyBlurEnabled`/`setPrivacyBlurEnabled` di lib/appLock.ts, key
 * localStorage berbeda dari AppLockState). Menyembunyikan saldo dari
 * thumbnail recent-apps adalah proteksi privasi dasar yang defaultnya ON
 * untuk SEMUA user yang sedang login, terlepas dari apakah mereka
 * mengaktifkan PIN/biometric atau tidak -- persis seperti Gopay/OVO/Dana
 * yang tetap mem-blur konten di app-switcher walau App Lock mereka mati.
 * `lockFeatureEnabled` hanya relevan untuk menentukan apakah PERLU minta
 * PIN lagi (re-lock) setelah cukup lama di background -- BUKAN untuk
 * menentukan apakah cover-nya boleh muncul sama sekali. User tetap boleh
 * mematikan blur privasi ini sendiri lewat toggle-nya, terlepas dari
 * status App Lock -- keduanya sengaja tidak saling mengunci satu sama
 * lain.
 */
export const AppLockProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [lockFeatureEnabled, setLockFeatureEnabled] = useState(false);
  const [privacyBlurEnabled, setPrivacyBlurEnabledState] = useState(true);
  const [isLocked, setIsLocked] = useState(false);
  const hiddenAtRef = useRef<number | null>(null);
  const hasMountedLockRef = useRef(false);
  // Dibaca SINKRON di dalam event handler DOM (`handleVisibilityChange`/
  // `handleWindowBlur`) yang harus tampil instan -- state React biasa bisa
  // "telat" satu render dibanding ref ini, jadi selalu disinkronkan lewat
  // effect di bawah setiap kali `privacyBlurEnabled` berubah.
  const privacyBlurEnabledRef = useRef(true);

  // Elemen cover instan (lihat AppLockPrivacyCover.tsx) -- disentuh lewat
  // `ref.style` langsung, BUKAN lewat state React, supaya tampil/hilang di
  // frame yang sama dengan event `visibilitychange`, bukan menunggu commit
  // React berikutnya (yang di frame app-switcher OS sudah kalah cepat).
  const coverRef = useRef<HTMLDivElement>(null);

  const showCoverInstantly = useCallback(() => {
    // Hormati toggle "Blur Privasi" user -- kalau dimatikan, cover tidak
    // pernah dipasang sama sekali (bukan cuma di-skip di beberapa jalur).
    if (!privacyBlurEnabledRef.current) return;
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

  const refreshPrivacyBlurState = useCallback(() => {
    setPrivacyBlurEnabledState(isPrivacyBlurEnabled(userId));
  }, [userId]);

  useEffect(() => {
    privacyBlurEnabledRef.current = privacyBlurEnabled;
    // Kalau user mematikan blur privasi SAAT cover sedang terpasang (mis.
    // toggle dimatikan lalu langsung pindah app), pastikan cover ikut
    // terbuka -- jangan sampai layar "kejebak" tertutup tanpa penyebab
    // yang jelas ke user.
    if (!privacyBlurEnabled) hideCover();
  }, [privacyBlurEnabled, hideCover]);

  // Saat user berganti (login/logout/switch akun), evaluasi ulang dari awal.
  useEffect(() => {
    hasMountedLockRef.current = false;
    if (!userId) {
      setLockFeatureEnabled(false);
      setIsLocked(false);
      setPrivacyBlurEnabledState(true);
      return;
    }
    const enabled = isAppLockEnabled(userId);
    setLockFeatureEnabled(enabled);
    setIsLocked(enabled);
    setPrivacyBlurEnabledState(isPrivacyBlurEnabled(userId));
    hasMountedLockRef.current = true;
  }, [userId]);

  useEffect(() => {
    // CATATAN riwayat: sempat dicoba menambah `window blur`/`pagehide`
    // sebagai trigger cover instan (untuk memenangkan race melawan
    // capture thumbnail recent-apps Android), lalu di-revert karena
    // `blur` ikut mengubah `hiddenAtRef` tanpa event pasangan yang
    // membersihkannya -- overlay dalam-app yang bukan backgrounding
    // sungguhan (file/photo picker, kamera, dialog update) memicu
    // `blur` tanpa `visibilitychange`, jadi timestamp-nya "nyangkut" dan
    // salah memicu PIN di siklus berikutnya. Setelah revert total, cover
    // jadi kalah race lagi saat pindah app sungguhan.
    //
    // Solusinya: PISAHKAN dua tanggung jawab yang sebelumnya tercampur.
    // - `visibilitychange` (di bawah) SEPENUHNYA yang memegang
    //   `hiddenAtRef`/`isLocked` -- satu-satunya sumber kebenaran untuk
    //   "apakah PIN perlu diminta lagi". Tidak berubah dari sebelumnya.
    // - `blur`/`focus` (window, bukan document) HANYA mengontrol visual
    //   cover -- showCoverInstantly()/hideCover() semata, TIDAK PERNAH
    //   menyentuh `hiddenAtRef` atau `isLocked`. Ini aman dipakai untuk
    //   menang race lebih awal karena kalaupun overlay sesaat (file
    //   picker/kamera) memicu `blur` tanpa `visibilitychange` yang
    //   menyertai, `focus` yang mengembalikan fokus akan membuka cover
    //   itu lagi TANPA pernah mengira-ngira durasi background -- jadi
    //   tidak mungkin salah memicu PIN.
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

    const handleWindowBlur = () => {
      // HANYA visual, sengaja TIDAK menyentuh hiddenAtRef -- lihat catatan
      // di atas. Kalau ternyata ini memang backgrounding sungguhan,
      // `visibilitychange` di atas akan menyusul dan mengambil alih
      // bookkeeping timeout PIN seperti biasa.
      if (!userId) return;
      showCoverInstantly();
    };

    const handleWindowFocus = () => {
      // Pasangan `handleWindowBlur` -- membuka lagi cover yang mungkin
      // terpasang gara-gara overlay sesaat (file/photo picker, kamera)
      // yang TIDAK memicu siklus `visibilitychange` (app tidak pernah
      // benar-benar "hidden"). Aman dipanggil kapan pun: kalau saat ini
      // <AppLockScreen/> sedang tampil (isLocked true, z-index lebih
      // tinggi dari cover ini), membuka cover di baliknya tidak
      // membocorkan apa pun.
      hideCover();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleWindowBlur);
    window.addEventListener("focus", handleWindowFocus);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleWindowBlur);
      window.removeEventListener("focus", handleWindowFocus);
    };
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
      value={{ lockFeatureEnabled, privacyBlurEnabled, isLocked, unlock, refreshLockFeatureState, refreshPrivacyBlurState, lockNow }}
    >
      {children}
      {/* Selalu ter-mount (bukan conditional) supaya toggle opacity lewat
          ref.style di atas langsung berefek tanpa delay mount/unmount --
          lihat komentar di AppLockPrivacyCover.tsx. */}
      <AppLockPrivacyCover ref={coverRef} />
    </AppLockContext.Provider>
  );
};
