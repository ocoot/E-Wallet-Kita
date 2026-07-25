import React, { useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import {
  MoreHorizontal,
  X,
  LogOut,
  Globe,
  SunMoon,
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
import { useBackGestureTrap } from "../hooks/useBackGestureTrap";
import { useNavItems, MOBILE_PRIMARY_NAV_IDS } from "../hooks/useNavItems";
import { useThemeTokens } from "../hooks/useThemeTokens";
import { SafeArea } from "./ui/SafeArea";
import { audioFeedback } from "../lib/audio";

interface MobileBottomNavProps {
  onLogoutClick: () => void;
  userDisplayName?: string;
  userAvatarUrl?: string | null;
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
 * tampil di breakpoint mobile & tablet (`lg:hidden`), sedangkan sidebar
 * lama kini hanya tampil di breakpoint desktop (`hidden lg:flex`).
 * Breakpoint switch: `lg` (1024px), bukan `md` (768px) -- supaya tablet
 * portrait tetap dapat navbar bawah, bukan sidebar desktop yang sempit.
 */
export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  onLogoutClick,
  userDisplayName,
  userAvatarUrl,
}) => {
  const { user } = useAuth();
  const { locale, setLocale, t } = useLanguage();
  const { theme, setTheme } = useTheme();
  const { tokens, cx } = useThemeTokens();
  const { isFeatureLocked } = useMaintenance();
  const location = useLocation();
  const menuItems = useNavItems();

  const [isMoreOpen, setIsMoreOpen] = useState(false);
  useLockBodyScroll(isMoreOpen);
  const sheetRef = useRef<HTMLDivElement>(null);
  // Menjebak swipe-back/tombol-back HP supaya menutup sheet ini, bukan
  // menavigasi halaman di baliknya (lihat useBackGestureTrap.ts).
  // `closeSheet` dipakai untuk semua jalur tutup yang TIDAK diikuti
  // navigasi lain (tombol X, klik backdrop, Escape) -- sedangkan klik
  // item menu / logout tetap pakai `setIsMoreOpen(false)` polos karena
  // langsung disusul navigasi/route baru.
  const { close: closeSheet } = useBackGestureTrap(isMoreOpen, setIsMoreOpen);
  useDialogA11y(isMoreOpen, sheetRef, closeSheet);

  const isGuest = user?.is_anonymous ?? false;
  const displayName = userDisplayName || user?.user_metadata?.full_name || user?.email || t("admin.guest_user");

  const primaryItems = MOBILE_PRIMARY_NAV_IDS
    .map((id) => menuItems.find((item) => item.id === id))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  const primaryIds = new Set(MOBILE_PRIMARY_NAV_IDS as readonly string[]);
  const moreItems = menuItems.filter((item) => !primaryIds.has(item.id));

  const activeId = menuItems.find((item) => location.pathname === item.path)?.id;
  const isMoreActive = !!activeId && !primaryIds.has(activeId);

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
          Tiga perubahan dari desain sebelumnya (mengikuti referensi):
          1) Navbar kini "mengambang" (floating pill): tidak menempel penuh
             di tepi layar lagi, melainkan diberi jarak (inset-x + bottom)
             di semua sisi, dengan sudut rounded-full dan bayangan menyebar
             ke segala arah supaya terlihat melayang di atas konten.
          2) Item "new_transaction" (tombol tambah) dirender sebagai tombol
             bulat "mengambang" (floating action button) yang menonjol di
             atas garis navbar -- bukan ikon flat sejajar item lain lagi.
          3) Judul/label menu HANYA muncul otomatis di menu yang sedang
             aktif; menu lain cuma tampil ikonnya saja, dan label itu
             muncul/hilang dgn animasi halus (framer-motion) saat pindah
             menu, bukan langsung tampil statis di semua item seperti
             sebelumnya. */}
      <nav
        className={cx(
          "lg:hidden fixed inset-x-4 z-40 flex items-stretch justify-around max-w-md mx-auto px-2",
          tokens.mobileBottomNav.navContainer,
          tokens.text.onSurface
        )}
        style={{ bottom: "calc(1.1rem + env(safe-area-inset-bottom))" }}
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
                onClick={() => audioFeedback.tapHaptic()}
                className="flex-1 flex flex-col items-center justify-center min-w-0 cursor-pointer select-none"
              >
                <div className="relative -translate-y-4">
                  <div
                    className={`w-14 h-14 rounded-full flex items-center justify-center
                      bg-gradient-to-br from-indigo-500 via-violet-500 to-indigo-600
                      shadow-lg shadow-indigo-600/40 ring-[5px] ring-slate-950
                      transition-transform duration-200 active:scale-95
                      ${locked ? "opacity-50 grayscale" : ""}`}
                  >
                    <Plus size={26} strokeWidth={2.5} className="text-white" />
                  </div>
                  {locked && (
                    <Lock
                      size={11}
                      className={cx("absolute -right-0.5 -top-0.5 text-amber-400 rounded-full p-0.5", tokens.surface.card)}
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
              onClick={() => audioFeedback.tapHaptic()}
              className="relative flex-1 flex flex-col items-center justify-center gap-0.5 py-3 min-w-0 cursor-pointer select-none transition-transform active:scale-90"
            >
              <div className="relative">
                <IconComp
                  size={20}
                  // P4 4.1: ikon aktif jadi "filled" (bukan cuma ganti warna)
                  // -- lucide-react tidak punya varian solid terpisah, tapi
                  // isi fill="currentColor" di ikon outline-nya membuat
                  // bentuknya terasa lebih "solid/aktif" ala native tab bar.
                  fill={isActive ? "currentColor" : "none"}
                  className={cx(
                    "transition-[fill] duration-150",
                    isActive
                      ? tokens.text.accent
                      : locked
                        ? tokens.text.faint
                        : tokens.text.muted
                  )}
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
                    className={cx(
                      "font-sans text-[clamp(0.5625rem,2.6vw,0.625rem)] font-medium truncate max-w-full px-0.5 overflow-hidden",
                      tokens.text.accent
                    )}
                  >
                    {item.label}
                  </motion.span>
                )}
              </AnimatePresence>
              {/* P4 4.2: indikator pill yang "meluncur" antar tab -- layoutId
                  yang sama dipakai lagi di tombol "Lainnya" di bawah, supaya
                  motion menganimasikan posisinya (bukan muncul instan) saat
                  tab aktif berpindah, termasuk saat pindah dari/ke "Lainnya". */}
              {isActive && (
                <motion.div
                  layoutId="mobile-bottom-nav-active-pill"
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  className={cx("absolute bottom-1 h-1 w-5 rounded-full", tokens.mobileBottomNav.navLinkActive)}
                />
              )}
            </Link>
          );
        })}

        {/* Tombol "Lainnya" -- membuka bottom-sheet berisi sisa menu */}
        <button
          onClick={() => { audioFeedback.tapHaptic(); setIsMoreOpen(true); }}
          className="relative flex-1 flex flex-col items-center justify-center gap-0.5 py-3 min-w-0 cursor-pointer select-none transition-transform active:scale-90"
        >
          <MoreHorizontal
            size={20}
            fill={isMoreActive ? "currentColor" : "none"}
            className={cx(
              "transition-[fill] duration-150",
              isMoreActive ? tokens.icon.accent : tokens.text.muted
            )}
          />
          <AnimatePresence initial={false}>
            {isMoreActive && (
              <motion.span
                key="label"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                className={cx(
                  "font-sans text-[clamp(0.5625rem,2.6vw,0.625rem)] font-medium truncate max-w-full px-0.5 overflow-hidden",
                  tokens.text.accent
                )}
              >
                {t("nav.more")}
              </motion.span>
            )}
          </AnimatePresence>
          {isMoreActive && (
            <motion.div
              layoutId="mobile-bottom-nav-active-pill"
              transition={{ type: "spring", stiffness: 380, damping: 30 }}
              className={cx("absolute bottom-1 h-1 w-5 rounded-full", tokens.mobileBottomNav.navLinkActive)}
            />
          )}
        </button>
      </nav>

      {/* Bottom-sheet "Lainnya" */}
      <AnimatePresence>
        {isMoreOpen && (
          <div className="fixed inset-0 z-50 flex lg:hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-black/70 backdrop-blur-xs"
              onClick={closeSheet}
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
              className={cx(
                "relative flex flex-col w-full max-h-[85vh] mt-auto rounded-t-3xl outline-none",
                tokens.mobileBottomNav.sheetContainer,
                tokens.text.onSurface
              )}
            >
              {/* Grip handle */}
              <div className="flex justify-center pt-3 pb-1 shrink-0">
                <div className={cx("w-10 h-1.5 rounded-full", tokens.mobileBottomNav.sheetGrip)} />
              </div>

              {/* Header */}
              <div className={cx("flex items-center justify-between px-6 py-3 shrink-0 border-b", tokens.border.accent)}>
                <span className={cx("font-sans font-bold text-base tracking-tight", tokens.text.primary)}>
                  {t("nav.more")}
                </span>
                <button
                  onClick={closeSheet}
                  className={cx(
                    "p-1 rounded-lg cursor-pointer transition-colors",
                    "hover:bg-white/10",
                    tokens.mobileBottomNav.closeBtn,
                    tokens.text.primary
                  )}
                >
                  <X size={20} />
                </button>
              </div>

              {/* Konten scrollable */}
              <div className="flex-1 overflow-y-auto overscroll-contain px-6 py-5 space-y-5">
                {/* Profil ringkas */}
                <div className={cx("p-4 rounded-xl border", tokens.surface.sunken, tokens.border.accent)}>
                  <div className="flex items-center gap-3">
                    {/* Avatar bulat -- render foto profil kalau ada (sinkron
                        dari App.tsx via prop `userAvatarUrl`, sama seperti
                        di Sidebar desktop), fallback ke inisial huruf kalau
                        belum pasang foto. */}
                    <div className={cx(
                      "w-10 h-10 shrink-0 rounded-full flex items-center justify-center overflow-hidden text-sm font-bold",
                      tokens.mobileBottomNav.profileBg,
                      tokens.text.accent
                    )}>
                      {userAvatarUrl ? (
                        <img src={userAvatarUrl} alt={displayName} className="w-full h-full object-cover" />
                      ) : (
                        displayName.charAt(0).toUpperCase()
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className={cx("font-mono text-[clamp(0.5625rem,2.6vw,0.625rem)] uppercase tracking-widest", tokens.text.accent)}>
                        {isGuest ? t("history.status_guest") : t("history.status_verified")}
                      </p>
                      <div className="flex items-center gap-2.5 mt-1">
                        {isGuest ? (
                          <ShieldAlert size={16} className="text-amber-400 shrink-0" />
                        ) : (
                          <ShieldCheck size={16} className={cx("shrink-0", tokens.text.success)} />
                        )}
                        <span className={cx("font-sans font-semibold text-sm truncate max-w-[220px]", tokens.text.primary)}>
                          {displayName}
                        </span>
                      </div>
                    </div>
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
                            ? tokens.mobileBottomNav.navLinkActive
                            : locked
                              ? tokens.text.faint
                              : cx(tokens.text.label, tokens.mobileBottomNav.navLinkInactive)
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
              <SafeArea inset="bottom" basePadding={16} className={cx("shrink-0 px-6 py-4 space-y-4 border-t", tokens.border.accent)}>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    onClick={toggleLanguage}
                    className={cx(
                      "flex flex-col items-center justify-center py-2 rounded-xl border font-sans text-[clamp(0.5625rem,2.6vw,0.625rem)] sm:text-xs font-semibold cursor-pointer transition-colors",
                      tokens.mobileBottomNav.footerBtn,
                      tokens.text.secondary
                    )}
                  >
                    <Globe size={13} className="mb-0.5" />
                    <span>{locale.toUpperCase()}</span>
                  </button>
                  <button
                    onClick={toggleTheme}
                    className={cx(
                      "flex flex-col items-center justify-center py-2 rounded-xl border font-sans text-[clamp(0.5625rem,2.6vw,0.625rem)] sm:text-xs font-semibold cursor-pointer transition-colors",
                      tokens.mobileBottomNav.footerBtn,
                      tokens.text.secondary
                    )}
                  >
                    <SunMoon size={13} className="mb-0.5" />
                    <span>{theme === "dark_obsidian" ? t("common.dark") : t("common.light")}</span>
                  </button>
                </div>

                <button
                  onClick={() => {
                    setIsMoreOpen(false);
                    onLogoutClick();
                  }}
                  className={cx("w-full flex items-center justify-center gap-2 py-3 rounded-xl border font-sans text-sm font-semibold transition-colors cursor-pointer", tokens.mobileBottomNav.logoutBtn)}
                >
                  <LogOut size={16} />
                  <span>{t("nav.logout")}</span>
                </button>
              </SafeArea>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};
