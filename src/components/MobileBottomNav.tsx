import React, { useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import {
  MoreHorizontal,
  X,
  LogOut,
  Globe,
  SunMoon,
  Volume2,
  VolumeX,
  ShieldCheck,
  ShieldAlert,
  Lock,
  Plus,
} from "lucide-react";
import { useLanguage } from "../contexts/LanguageContext";
import { useTheme } from "../contexts/ThemeContext";
import { useAuth } from "../contexts/AuthContext";
import { useMaintenance } from "../contexts/MaintenanceContext";
import { useLockBodyScroll } from "../hooks/useLockBodyScroll";
import { useDialogA11y } from "../hooks/useDialogA11y";
import { useNavItems, MOBILE_PRIMARY_NAV_IDS } from "../hooks/useNavItems";
import { audioFeedback } from "../lib/audio";

interface MobileBottomNavProps {
  onLogoutClick: () => void;
  userDisplayName?: string;
}

/**
 * Navbar bawah khusus tampilan handphone (menggantikan sidebar/drawer lama
 * di layar kecil). Menampilkan 4 menu paling sering dipakai sebagai ikon
 * langsung (Dashboard, Dompet, Catat Manual, Riwayat), dan 1 tombol
 * "Lainnya" yang membuka bottom-sheet berisi sisa menu yang tidak muat
 * ditampilkan di navbar (Anggaran, Tagihan, Cicilan, Tabungan, Tabungan
 * Emas, Pengaturan, Admin Panel) plus profil, kontrol bahasa/tema/suara,
 * dan tombol keluar.
 *
 * Sidebar desktop (`Sidebar.tsx`) tidak diubah -- komponen ini hanya
 * tampil di breakpoint mobile (`md:hidden`), sedangkan sidebar lama kini
 * hanya tampil di breakpoint desktop (`hidden md:flex`).
 */
export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  onLogoutClick,
  userDisplayName,
}) => {
  const { user } = useAuth();
  const { locale, setLocale, t } = useLanguage();
  const { theme, setTheme } = useTheme();
  const { isFeatureLocked } = useMaintenance();
  const location = useLocation();
  const menuItems = useNavItems();

  const [isMoreOpen, setIsMoreOpen] = useState(false);
  useLockBodyScroll(isMoreOpen);
  const sheetRef = useRef<HTMLDivElement>(null);
  useDialogA11y(isMoreOpen, sheetRef, () => setIsMoreOpen(false));

  const [isMuted, setIsMuted] = useState(audioFeedback.getIsMuted());

  const isGuest = user?.is_anonymous ?? false;
  const displayName = userDisplayName || user?.user_metadata?.full_name || user?.email || t("admin.guest_user");

  const primaryItems = MOBILE_PRIMARY_NAV_IDS
    .map((id) => menuItems.find((item) => item.id === id))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  const primaryIds = new Set(MOBILE_PRIMARY_NAV_IDS as readonly string[]);
  const moreItems = menuItems.filter((item) => !primaryIds.has(item.id));

  const activeId = menuItems.find((item) => location.pathname === item.path)?.id;
  const isMoreActive = !!activeId && !primaryIds.has(activeId);

  const toggleMute = () => {
    const nextMute = audioFeedback.toggleMute();
    setIsMuted(nextMute);
    if (!nextMute) {
      audioFeedback.playChime();
    } else {
      audioFeedback.playClick();
    }
  };

  const toggleLanguage = () => {
    audioFeedback.playClick();
    setLocale(locale === "id" ? "en" : "id");
  };

  const toggleTheme = () => {
    audioFeedback.playClick();
    setTheme(theme === "dark_obsidian" ? "light_sakura" : "dark_obsidian");
  };

  return (
    <>
      {/* Navbar bawah -- hanya tampil di layar mobile.
          Dua perubahan dari desain sebelumnya (mengikuti referensi):
          1) Item "new_transaction" (tombol tambah) dirender sebagai tombol
             bulat "mengambang" (floating action button) yang menonjol di
             atas garis navbar -- bukan ikon flat sejajar item lain lagi.
          2) Judul/label menu HANYA muncul otomatis di menu yang sedang
             aktif; menu lain cuma tampil ikonnya saja, dan label itu
             muncul/hilang dgn animasi halus (framer-motion) saat pindah
             menu, bukan langsung tampil statis di semua item seperti
             sebelumnya. */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-40 flex items-stretch justify-around
          bg-slate-950/50 backdrop-blur-2xl backdrop-saturate-150 border-t border-white/10 text-white
          shadow-[0_-8px_32px_rgba(0,0,0,0.35)]
          dark_obsidian:bg-slate-950/50 dark_obsidian:border-white/10
          light_sakura:bg-white/40 light_sakura:border-white/60 light_sakura:text-slate-800 light_sakura:shadow-[0_-8px_32px_rgba(244,63,94,0.1)]"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {primaryItems.map((item) => {
          const IconComp = item.icon;
          const isActive = activeId === item.id;
          const locked = !!item.featureKey && isFeatureLocked(item.featureKey);

          // Tombol tengah "Catat Mandiri" -- dibuat menonjol/mengambang
          // (elevated) meniru referensi UX, bukan flat seperti item lain.
          // Sengaja tanpa label (sama seperti pola di referensi), karena
          // bentuk & posisinya sudah cukup jadi penanda visual sendiri.
          if (item.id === "new_transaction") {
            return (
              <Link
                key={item.id}
                to={item.path}
                aria-label={item.label}
                className="flex-1 flex flex-col items-center justify-start pt-0 min-w-0 cursor-pointer"
              >
                <div className="relative -translate-y-5">
                  <div
                    className={`w-14 h-14 rounded-full flex items-center justify-center
                      bg-gradient-to-br from-indigo-500 via-violet-500 to-indigo-600
                      shadow-lg shadow-indigo-600/40 ring-[5px] ring-slate-950
                      light_sakura:ring-white
                      transition-transform duration-200 active:scale-95
                      ${locked ? "opacity-50 grayscale" : ""}`}
                  >
                    <Plus size={26} strokeWidth={2.5} className="text-white" />
                  </div>
                  {locked && (
                    <Lock
                      size={11}
                      className="absolute -right-0.5 -top-0.5 text-amber-400 bg-slate-950 light_sakura:bg-white rounded-full p-0.5"
                    />
                  )}
                </div>
              </Link>
            );
          }

          return (
            <Link
              key={item.id}
              to={item.path}
              className="flex-1 flex flex-col items-center gap-0.5 pt-2.5 pb-1.5 min-w-0 cursor-pointer"
            >
              <div className="relative">
                <IconComp
                  size={20}
                  className={
                    isActive
                      ? "text-indigo-400 light_sakura:text-rose-500"
                      : locked
                        ? "text-slate-600 light_sakura:text-slate-300"
                        : "text-slate-400 light_sakura:text-slate-500"
                  }
                />
                {locked && (
                  <Lock size={9} className="absolute -right-1.5 -top-1 text-amber-400" />
                )}
              </div>
              <AnimatePresence initial={false}>
                {isActive && (
                  <motion.span
                    key="label"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.18, ease: "easeOut" }}
                    className="font-sans text-[10px] font-medium truncate max-w-full px-0.5
                      overflow-hidden text-indigo-400 light_sakura:text-rose-500"
                  >
                    {item.label}
                  </motion.span>
                )}
              </AnimatePresence>
            </Link>
          );
        })}

        {/* Tombol "Lainnya" -- membuka bottom-sheet berisi sisa menu */}
        <button
          onClick={() => setIsMoreOpen(true)}
          className="flex-1 flex flex-col items-center gap-0.5 pt-2.5 pb-1.5 min-w-0 cursor-pointer"
        >
          <MoreHorizontal
            size={20}
            className={
              isMoreActive
                ? "text-indigo-400 light_sakura:text-rose-500"
                : "text-slate-400 light_sakura:text-slate-500"
            }
          />
          <AnimatePresence initial={false}>
            {isMoreActive && (
              <motion.span
                key="label"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                className="font-sans text-[10px] font-medium truncate max-w-full px-0.5
                  overflow-hidden text-indigo-400 light_sakura:text-rose-500"
              >
                {t("nav.more")}
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </nav>

      {/* Bottom-sheet "Lainnya" */}
      <AnimatePresence>
        {isMoreOpen && (
          <div className="fixed inset-0 z-50 flex md:hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-black/70 backdrop-blur-xs"
              onClick={() => setIsMoreOpen(false)}
            />

            <motion.div
              ref={sheetRef}
              role="dialog"
              aria-modal="true"
              aria-label={t("nav.more")}
              tabIndex={-1}
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 260 }}
              className="relative flex flex-col w-full max-h-[85vh] mt-auto rounded-t-3xl
                bg-slate-900/70 backdrop-blur-2xl backdrop-saturate-150 border-t border-white/10 text-white
                shadow-[0_-8px_40px_rgba(0,0,0,0.4)]
                dark_obsidian:bg-slate-900/70 dark_obsidian:border-white/10
                light_sakura:bg-rose-50/70 light_sakura:text-slate-800 light_sakura:border-white/60
                outline-none"
            >
              {/* Grip handle */}
              <div className="flex justify-center pt-3 pb-1 shrink-0">
                <div className="w-10 h-1.5 rounded-full bg-slate-700 light_sakura:bg-rose-200" />
              </div>

              {/* Header */}
              <div className="flex items-center justify-between px-6 py-3 shrink-0 border-b border-slate-800/60 light_sakura:border-rose-100">
                <span className="font-sans font-bold text-base tracking-tight text-white dark_obsidian:text-white light_sakura:text-slate-900">
                  {t("nav.more")}
                </span>
                <button
                  onClick={() => setIsMoreOpen(false)}
                  className="p-1 rounded-lg hover:bg-white/10 light_sakura:hover:bg-slate-200 cursor-pointer text-white dark_obsidian:text-white light_sakura:text-slate-800"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Konten scrollable */}
              <div className="flex-1 overflow-y-auto overscroll-contain px-6 py-5 space-y-5">
                {/* Profil ringkas */}
                <div className="p-4 rounded-xl border bg-slate-950/40 border-slate-800 light_sakura:bg-rose-100/50 light_sakura:border-rose-200">
                  <p className="font-mono text-[clamp(0.5625rem,2.6vw,0.625rem)] text-slate-400 light_sakura:text-rose-600 uppercase tracking-widest">
                    {isGuest ? t("history.status_guest") : t("history.status_verified")}
                  </p>
                  <div className="flex items-center gap-2.5 mt-1">
                    {isGuest ? (
                      <ShieldAlert size={16} className="text-amber-400" />
                    ) : (
                      <ShieldCheck size={16} className="text-emerald-400 light_sakura:text-emerald-600" />
                    )}
                    <span className="font-sans font-semibold text-sm truncate max-w-[220px] dark_obsidian:text-slate-200 light_sakura:text-slate-900">
                      {displayName}
                    </span>
                  </div>
                </div>

                {/* Sisa menu navigasi */}
                <nav className="space-y-1.5">
                  {moreItems.map((item) => {
                    const IconComp = item.icon;
                    const isActive = activeId === item.id;
                    const locked = !!item.featureKey && isFeatureLocked(item.featureKey);
                    return (
                      <Link
                        key={item.id}
                        to={item.path}
                        onClick={() => setIsMoreOpen(false)}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-sans text-sm font-medium transition-all duration-150 cursor-pointer
                          ${isActive
                            ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/10 light_sakura:bg-rose-500 light_sakura:text-white"
                            : locked
                              ? "text-slate-500 light_sakura:text-slate-400"
                              : "text-slate-300 hover:bg-slate-800 light_sakura:text-slate-600 light_sakura:hover:bg-rose-100"
                          }`}
                      >
                        <IconComp size={18} />
                        <span className="flex-1">{item.label}</span>
                        {locked && <Lock size={14} className="text-amber-400 shrink-0" />}
                      </Link>
                    );
                  })}
                </nav>
              </div>

              {/* Footer -- kontrol bahasa/tema/suara + keluar */}
              <div className="shrink-0 px-6 py-4 space-y-4 border-t border-slate-800 light_sakura:border-rose-100"
                style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
              >
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    onClick={toggleLanguage}
                    className="flex flex-col items-center justify-center py-2 rounded-xl border border-slate-800 hover:bg-slate-800 font-sans text-[clamp(0.5625rem,2.6vw,0.625rem)] sm:text-xs font-semibold cursor-pointer text-slate-300 light_sakura:border-rose-200 light_sakura:text-slate-700 light_sakura:hover:bg-rose-100"
                  >
                    <Globe size={13} className="mb-0.5" />
                    <span>{locale.toUpperCase()}</span>
                  </button>
                  <button
                    onClick={toggleTheme}
                    className="flex flex-col items-center justify-center py-2 rounded-xl border border-slate-800 hover:bg-slate-800 font-sans text-[clamp(0.5625rem,2.6vw,0.625rem)] sm:text-xs font-semibold cursor-pointer text-slate-300 light_sakura:border-rose-200 light_sakura:text-slate-700 light_sakura:hover:bg-rose-100"
                  >
                    <SunMoon size={13} className="mb-0.5" />
                    <span>{theme === "dark_obsidian" ? t("common.dark") : t("common.light")}</span>
                  </button>
                  <button
                    onClick={toggleMute}
                    className="flex flex-col items-center justify-center py-2 rounded-xl border border-slate-800 hover:bg-slate-800 font-sans text-[clamp(0.5625rem,2.6vw,0.625rem)] sm:text-xs font-semibold cursor-pointer text-slate-300 light_sakura:border-rose-200 light_sakura:text-slate-700 light_sakura:hover:bg-rose-100"
                    title="Mute / Unmute"
                  >
                    {isMuted ? (
                      <VolumeX size={13} className="text-red-400 light_sakura:text-red-500 mb-0.5" />
                    ) : (
                      <Volume2 size={13} className="text-indigo-400 light_sakura:text-rose-500 mb-0.5" />
                    )}
                    <span>{isMuted ? t("common.muted") : t("common.sound")}</span>
                  </button>
                </div>

                <button
                  onClick={() => {
                    setIsMoreOpen(false);
                    onLogoutClick();
                  }}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border bg-slate-950/40 border-red-500/20 text-red-400 hover:bg-red-500/10 font-sans text-sm font-semibold transition-colors cursor-pointer light_sakura:bg-red-50 light_sakura:border-red-200 light_sakura:text-red-600 light_sakura:hover:bg-red-100"
                >
                  <LogOut size={16} />
                  <span>{t("nav.logout")}</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};
