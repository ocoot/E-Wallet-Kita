import React, { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Loader2 } from "lucide-react";
import { useLanguage } from "../contexts/LanguageContext";
import { useThemeTokens } from "../hooks/useThemeTokens";

/**
 * Pill kecil non-modal yang muncul saat kita TAHU sebuah pembaruan sedang
 * dalam proses dicek/di-install oleh service worker, tapi popup
 * <UpdatePrompt/> (yang butuh "onNeedRefresh" selesai) belum tentu tampil
 * dalam beberapa detik ke depan.
 *
 * Kenapa ini perlu: alur normal registerSW (lihat main.tsx) butuh waktu
 * beberapa detik (fetch sw.js baru -> install -> cache semua precache
 * asset -> baru "waiting" -> baru onNeedRefresh terpanggil) SEBELUM
 * <UpdatePrompt/> muncul. Kalau user baru saja tap notifikasi push
 * "Ada pembaruan tersedia" lalu buka/refresh app, mereka akan melihat
 * layar app biasa selama 5-10 detik tanpa indikasi apa pun sedang
 * terjadi -- terlihat seperti tidak ada respons.
 *
 * Komponen ini diberi tahu lewat 2 jalur (lihat firebase-messaging-sw.js):
 *  1. Query param `?ewk_update=1` di URL saat app dibuka BARU dari
 *     notifikasi (tab belum ada sebelumnya).
 *  2. postMessage `{ type: "ewk-update-notification-clicked" }` dari SW
 *     kalau user tap notifikasi saat tab APLIKASI SUDAH terbuka (SW cukup
 *     fokus-kan tab itu, tidak perlu navigate ulang).
 *
 * Begitu <UpdatePrompt/> benar-benar muncul (event "pwa-update-available"),
 * indikator ini otomatis disembunyikan supaya tidak tumpang tindih.
 * Ada juga fallback timeout supaya tidak "menggantung" selamanya kalau
 * ternyata tidak ada pembaruan baru (mis. push telat / SW sudah update).
 */
const AUTO_HIDE_MS = 20000;

export const UpdateCheckingIndicator: React.FC = () => {
  const { tokens, cx } = useThemeTokens();
  const { t } = useLanguage();
  const [visible, setVisible] = useState(false);
  const hideTimerRef = useRef<number | null>(null);

  const clearHideTimer = () => {
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  };

  const show = () => {
    setVisible(true);
    clearHideTimer();
    hideTimerRef.current = window.setTimeout(() => {
      setVisible(false);
    }, AUTO_HIDE_MS);
  };

  useEffect(() => {
    // 1) Cek query param dari notifikasi yang membuka tab baru.
    const params = new URLSearchParams(window.location.search);
    if (params.get("ewk_update") === "1") {
      show();
      // Bersihkan param dari URL supaya tidak ikut ter-share/reload lagi.
      params.delete("ewk_update");
      const cleanUrl =
        window.location.pathname +
        (params.toString() ? `?${params.toString()}` : "") +
        window.location.hash;
      window.history.replaceState({}, "", cleanUrl);
    }

    // 2) Pesan dari SW saat notifikasi diklik ketika tab sudah terbuka.
    const onSWMessage = (event: MessageEvent) => {
      if (event.data?.type === "ewk-update-notification-clicked") {
        show();
      }
    };
    navigator.serviceWorker?.addEventListener?.("message", onSWMessage);

    // 3) Begitu popup update sungguhan muncul, indikator ini tidak
    //    diperlukan lagi -- sembunyikan supaya tidak tumpang tindih.
    const onUpdateAvailable = () => {
      clearHideTimer();
      setVisible(false);
    };
    window.addEventListener("pwa-update-available", onUpdateAvailable);

    return () => {
      navigator.serviceWorker?.removeEventListener?.("message", onSWMessage);
      window.removeEventListener("pwa-update-available", onUpdateAvailable);
      clearHideTimer();
    };
  }, []);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -16 }}
          transition={{ type: "spring", stiffness: 300, damping: 26 }}
          role="status"
          aria-live="polite"
          className={cx(
            "fixed top-3 left-1/2 -translate-x-1/2 z-[95] flex items-center gap-2 rounded-full border px-4 py-2 shadow-xl backdrop-blur-sm",
            tokens.updateCheckingIndicator.panelBg
          )}
        >
          <Loader2 size={14} className={cx("animate-spin shrink-0", tokens.text.accent)} />
          <span className={cx("text-xs font-semibold whitespace-nowrap", tokens.text.onSurface)}>
            {t("pwa.checking_update") || "Memeriksa pembaruan..."}
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
