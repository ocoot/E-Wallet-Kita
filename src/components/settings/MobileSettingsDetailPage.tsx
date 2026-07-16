import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { motion } from "motion/react";
import { useThemeTokens } from "../../hooks/useThemeTokens";
import { useIsDesktopViewport } from "../../hooks/useIsDesktopViewport";
import { audioFeedback } from "../../lib/audio";

interface MobileSettingsDetailPageProps {
  title: string;
  description?: string;
  children: React.ReactNode;
}

/**
 * Shell halaman detail untuk tiap menu di Profile/Akun (mis. Kelola Profil,
 * Kata Sandi & Keamanan, Notifikasi, dst). Setiap menu di daftar
 * `/settings` (mobile) membuka route barunya sendiri yang dibungkus shell
 * ini -- header dengan tombol kembali + judul, konsisten di semua halaman.
 *
 * Ini murni redesign MOBILE: di breakpoint desktop, layar grid lama
 * `/settings` sudah menampilkan semua kontrol sekaligus, jadi kalau shell
 * ini somehow diakses dari layar desktop (mis. buka link langsung), kita
 * arahkan balik ke `/settings` alih-alih menampilkan halaman detail yang
 * tidak didesain untuk layar lebar.
 */
export const MobileSettingsDetailPage: React.FC<MobileSettingsDetailPageProps> = ({
  title,
  description,
  children,
}) => {
  const navigate = useNavigate();
  const { tokens, cx } = useThemeTokens();
  const isDesktop = useIsDesktopViewport();

  useEffect(() => {
    if (isDesktop) {
      navigate("/settings", { replace: true });
    }
  }, [isDesktop, navigate]);

  if (isDesktop) return null;

  const handleBack = () => {
    audioFeedback.playClick();
    navigate("/settings");
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -12 }}
      transition={{ duration: 0.18 }}
      className="max-w-3xl mx-auto space-y-5 pb-24 md:hidden"
    >
      <div className={cx("rounded-3xl border border-slate-800/60 light_sakura:border-rose-100/40 shadow-lg overflow-hidden", tokens.surface.card)}>
        <div className="h-1.5 w-full bg-gradient-to-r from-indigo-600 via-indigo-500 to-indigo-400" />
        <div className="p-5 space-y-5">
          {/* Header: back button + title */}
          <div className="flex items-center gap-3 border-b border-slate-800/50 pb-4 light_sakura:border-rose-100/30">
            <button
              type="button"
              onClick={handleBack}
              aria-label="back"
              className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center bg-slate-950/60 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer light_sakura:bg-rose-50 light_sakura:border-rose-100 light_sakura:text-slate-600 light_sakura:hover:bg-rose-100"
            >
              <ChevronLeft size={18} />
            </button>
            <div className="min-w-0">
              <h1 className={cx("font-sans font-bold text-lg tracking-tight truncate", tokens.text.primary)}>
                {title}
              </h1>
              {description && (
                <p className="font-sans text-xs text-slate-400 light_sakura:text-slate-500 truncate">
                  {description}
                </p>
              )}
            </div>
          </div>

          {children}
        </div>
      </div>
    </motion.div>
  );
};
