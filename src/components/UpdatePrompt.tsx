import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { RefreshCw, X, Sparkles, Loader2 } from "lucide-react";
import { useLanguage } from "../contexts/LanguageContext";
import { useLockBodyScroll } from "../hooks/useLockBodyScroll";
import { supabase } from "../lib/supabase";
import { CHANGELOG_TABLE, type ChangelogEntry } from "../data/changelog";

/**
 * Banner "Versi baru tersedia" yang muncul otomatis saat service worker
 * mendeteksi ada build baru yang sudah di-deploy ke Vercel.
 *
 * Alur:
 *  1. main.tsx memanggil registerSW({ onNeedRefresh }) dari vite-plugin-pwa
 *  2. Callback itu dispatch custom event "pwa-update-available" + simpan
 *     fungsi updateSW ke window.__pwaUpdateSW
 *  3. Komponen ini mendengarkan event tersebut dan tampil sebagai banner
 *  4. Saat user klik "Perbarui", panggil window.__pwaUpdateSW(true) yang
 *     meminta service worker baru skip waiting lalu reload halaman
 *
 * CATATAN PENTING soal isi "Yang Baru": saat event ini terjadi, halaman
 * MASIH menjalankan kode bundle LAMA (belum reload) -- jadi changelog TIDAK
 * boleh diambil dari import statis (itu akan selalu menampilkan changelog
 * versi yang SEDANG berjalan, bukan versi baru yang baru di-deploy).
 * Makanya di sini di-query langsung ke tabel Supabase `changelog_entries`
 * (bukan lewat bundler / bukan file statis di public/) supaya selalu dapat
 * isi yang benar-benar terbaru di database saat itu. Lihat komentar
 * lengkap di `src/data/changelog.ts`.
 */
export const UpdatePrompt: React.FC = () => {
  const { t, locale } = useLanguage();
  const [visible, setVisible] = useState(false);
  const [latestEntry, setLatestEntry] = useState<ChangelogEntry | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    const handler = () => {
      setVisible(true);
      supabase
        .from(CHANGELOG_TABLE)
        .select("version, release_date, changes")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
        .then(({ data, error }) => {
          if (error) throw error;
          if (data) {
            setLatestEntry({
              version: data.version,
              date: data.release_date,
              changes: data.changes,
            });
          }
        })
        .catch((err) => {
          // Best-effort saja -- kalau gagal, dialog tetap tampil normal
          // dengan teks generik (tanpa daftar "Yang Baru").
          console.warn("[UpdatePrompt] Gagal memuat changelog:", err);
        });
    };
    window.addEventListener("pwa-update-available", handler);
    return () => window.removeEventListener("pwa-update-available", handler);
  }, []);

  const handleUpdate = () => {
    if (isUpdating) return; // cegah klik ganda
    setIsUpdating(true);

    // Jaring pengaman: kalau karena suatu sebab service worker tidak
    // pernah memicu reload (mis. updateSW gagal diam-diam), paksa reload
    // manual setelah beberapa detik supaya user tidak terjebak selamanya
    // di layar loading.
    const fallbackTimer = window.setTimeout(() => {
      window.location.reload();
    }, 8000);

    const updateSW = (window as any).__pwaUpdateSW;
    if (typeof updateSW === "function") {
      updateSW(true); // true = reload setelah SW aktif
    } else {
      window.clearTimeout(fallbackTimer);
      window.location.reload();
    }
  };

  const handleDismiss = () => {
    if (isUpdating) return; // jangan biarkan modal ditutup saat sedang update
    setVisible(false);
  };

  useLockBodyScroll(visible);

  return (
    <AnimatePresence>
      {visible && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={isUpdating ? undefined : handleDismiss}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />

          {/* Modal — di tengah layar, ukuran menyesuaikan mobile/tablet/desktop */}
          <motion.div
            initial={{ scale: 0.92, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 12 }}
            transition={{ type: "spring", stiffness: 300, damping: 28 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="update-prompt-title"
            className="relative w-full max-w-[22rem] sm:max-w-sm md:max-w-md my-auto max-h-[85vh] overflow-y-auto"
          >
            <div className="relative flex flex-col gap-4 p-5 sm:p-6 rounded-2xl shadow-2xl border bg-slate-900 border-indigo-500/30 text-white light_sakura:bg-white light_sakura:border-rose-300/50 light_sakura:text-slate-800">
              <button
                onClick={handleDismiss}
                disabled={isUpdating}
                className="absolute top-3 right-3 p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-white/5 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent light_sakura:hover:text-slate-700 light_sakura:hover:bg-black/5"
                aria-label="Tutup"
              >
                <X size={16} />
              </button>

              <div className="flex flex-col items-center text-center gap-3 pt-1">
                <div className="p-3 rounded-2xl bg-indigo-500/15 text-indigo-400 light_sakura:bg-rose-500/10 light_sakura:text-rose-500">
                  {isUpdating ? (
                    <Loader2 size={22} className="animate-spin" />
                  ) : (
                    <RefreshCw size={22} />
                  )}
                </div>
                <div>
                  <p
                    id="update-prompt-title"
                    className="text-sm sm:text-base font-bold"
                  >
                    {isUpdating ? t("pwa.updating") : t("pwa.update_title")}
                  </p>
                  <p className="mt-1 text-xs sm:text-sm text-slate-400 light_sakura:text-slate-500">
                    {isUpdating ? t("pwa.updating_desc") : t("pwa.update_desc")}
                  </p>
                </div>
              </div>

              {!isUpdating && latestEntry && latestEntry.changes.length > 0 && (
                <div className="rounded-xl bg-white/5 p-3.5 text-left light_sakura:bg-black/[0.03]">
                  <p className="flex items-center gap-1.5 text-[clamp(0.6188rem,2.86vw,0.6875rem)] font-bold uppercase tracking-wider text-indigo-300 light_sakura:text-rose-500">
                    <Sparkles size={12} />
                    {t("pwa.whats_new")}
                  </p>
                  <ul className="mt-2 space-y-1.5 text-xs sm:text-sm text-slate-300 light_sakura:text-slate-600">
                    {latestEntry.changes.map((change, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="text-indigo-400 light_sakura:text-rose-400">•</span>
                        <span>{locale === "en" ? change.en : change.id}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-2 mt-1">
                <button
                  onClick={handleDismiss}
                  disabled={isUpdating}
                  className="flex-1 order-2 sm:order-1 px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs sm:text-sm font-bold transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white/5 light_sakura:bg-black/5 light_sakura:hover:bg-black/10 light_sakura:text-slate-600"
                >
                  {t("pwa.update_dismiss") || "Nanti"}
                </button>
                <button
                  onClick={handleUpdate}
                  disabled={isUpdating}
                  aria-busy={isUpdating}
                  className="flex-1 order-1 sm:order-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs sm:text-sm font-bold transition-colors cursor-pointer flex items-center justify-center gap-2 disabled:opacity-80 disabled:cursor-wait disabled:hover:bg-indigo-600 light_sakura:bg-rose-500 light_sakura:hover:bg-rose-400"
                >
                  {isUpdating && <Loader2 size={14} className="animate-spin shrink-0" />}
                  {isUpdating ? t("pwa.updating") : t("pwa.update_btn")}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
