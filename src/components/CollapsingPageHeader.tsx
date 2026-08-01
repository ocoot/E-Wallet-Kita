import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { useThemeTokens } from "../hooks/useThemeTokens";
import { useMainScrollRef, useHeaderPortalNode } from "../contexts/MainScrollContext";
import { useIsDesktopViewport } from "../hooks/useIsDesktopViewport";
import { audioFeedback } from "../lib/audio";

interface CollapsingPageHeaderProps {
  /** Judul singkat yang muncul di sticky bar maupun header halaman */
  title: string;
  /** Judul besar alternatif jika ingin beda dengan title di sticky bar */
  largeTitle?: string;
  /** Subtitle opsional di bawah judul besar */
  subtitle?: string;
  /** Path tujuan tombol back. Jika diisi, tombol back otomatis muncul */
  backTo?: string;
  /** Custom handler saat tombol back diklik */
  onBack?: () => void;
  /** Paksa tampilkan/sembunyikan tombol back (default true jika backTo/onBack diisi) */
  showBack?: boolean;
  /** Elemen aksi opsional di sisi kanan header (mis. tombol filter, export, tambah) */
  actions?: React.ReactNode;
  /** Jarak scroll (px) sebelum header mengecil penuh ke sticky bar. Default 48 */
  threshold?: number;
  /** Konten halaman jika digunakan sebagai wrapper layout */
  children?: React.ReactNode;
}

/**
 * Pola "Large Title collapse ke compact sticky header" ala native iOS / Android Material.
 * - Saat scrollTop = 0: Judul besar tampil penuh di dalam flow halaman.
 * - Saat di-scroll: Ukuran font mengecil, opacity judul besar memudar, translateY naik,
 *   dan compact sticky bar di portal atas perlahan muncul (opacity 0 -> 1) dengan backdrop blur.
 * - Mobile-only: Di desktop (>=1024px) bar sticky disembunyikan agar navigasi Sidebar tetap konsisten.
 */
export const CollapsingPageHeader: React.FC<CollapsingPageHeaderProps> = ({
  title,
  largeTitle,
  subtitle,
  backTo,
  onBack,
  showBack,
  actions,
  threshold = 48,
  children,
}) => {
  const navigate = useNavigate();
  const { tokens, cx } = useThemeTokens();
  const scrollRef = useMainScrollRef();
  const portalNode = useHeaderPortalNode();
  const isDesktop = useIsDesktopViewport();
  const [scrollTop, setScrollTop] = useState(0);

  const shouldShowBack = showBack ?? (Boolean(backTo) || Boolean(onBack));

  useEffect(() => {
    if (isDesktop) {
      setScrollTop(0);
      return;
    }

    const el = scrollRef?.current;
    if (!el) return;

    const handleScroll = () => {
      setScrollTop(el.scrollTop);
    };

    handleScroll();
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [scrollRef, isDesktop]);

  const handleBack = () => {
    audioFeedback.playClick();
    if (onBack) {
      onBack();
    } else if (backTo) {
      navigate(backTo);
    } else {
      navigate(-1);
    }
  };

  const progress = isDesktop ? 0 : Math.min(Math.max(0, scrollTop / threshold), 1);
  const displayLargeTitle = largeTitle || title;

  // Compact Sticky Navbar (Mobile Only, Portal ke <main>)
  const stickyContent = !isDesktop && (
    <div
      style={{
        opacity: progress,
        pointerEvents: progress > 0.2 ? "auto" : "none",
        transition: "opacity 100ms ease-out",
      }}
      className={cx(
        "sticky top-0 z-30 w-full px-4 sm:px-6 lg:px-8 py-2.5 relative flex items-center border-b backdrop-blur-md",
        "bg-slate-900/85 light_sakura:bg-white/85",
        tokens.border.default
      )}
    >
      {shouldShowBack && (
        <button
          type="button"
          onClick={handleBack}
          aria-label="Back"
          className="relative z-10 shrink-0 -ml-1.5 p-1.5 rounded-full cursor-pointer active:scale-[0.92] transition-transform"
        >
          <ChevronLeft size={18} className={tokens.text.secondary} />
        </button>
      )}

      <h2
        className={cx(
          "absolute inset-x-0 px-12 text-center font-sans font-semibold text-sm truncate pointer-events-none",
          tokens.text.heading
        )}
      >
        {title}
      </h2>

      {actions && (
        <div className="ml-auto relative z-10 shrink-0 flex items-center gap-2">
          {actions}
        </div>
      )}
    </div>
  );

  const portalElement = portalNode && stickyContent ? createPortal(stickyContent, portalNode) : null;

  // In-Flow Large Title (Mengecil & memudar saat scroll)
  const inFlowHeader = (
    <div className="relative mb-4 sm:mb-6">
      <div
        style={{
          opacity: 1 - progress,
          transform: `translateY(${-progress * 14}px) scale(${1 - progress * 0.05})`,
          transformOrigin: "left center",
          willChange: "transform, opacity",
          transition: "transform 100ms ease-out, opacity 100ms ease-out",
        }}
        className="flex items-center justify-between gap-4"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {shouldShowBack && isDesktop && (
              <button
                type="button"
                onClick={handleBack}
                className="p-1 rounded-lg hover:bg-slate-800/40 cursor-pointer"
              >
                <ChevronLeft size={20} className={tokens.text.secondary} />
              </button>
            )}
            <h1 className={cx("font-sans text-2xl sm:text-3xl font-extrabold tracking-tight truncate", tokens.text.heading)}>
              {displayLargeTitle}
            </h1>
          </div>
          {subtitle && (
            <p className={cx("font-sans text-xs sm:text-sm mt-0.5 truncate", tokens.text.muted)}>
              {subtitle}
            </p>
          )}
        </div>

        {actions && (
          <div className="shrink-0 flex items-center gap-2">
            {actions}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      {portalElement}
      {children ? (
        <div className="w-full">
          {inFlowHeader}
          {children}
        </div>
      ) : (
        // Untuk penggunaan standalone (mis. halaman Admin yang sudah punya layout sendiri)
        !portalNode ? stickyContent : null
      )}
    </>
  );
};
