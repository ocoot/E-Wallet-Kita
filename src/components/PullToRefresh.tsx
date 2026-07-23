import React from "react";
import { RefreshCw } from "lucide-react";
import { usePullToRefresh } from "../hooks/usePullToRefresh";
import { useThemeTokens } from "../hooks/useThemeTokens";

interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  children: React.ReactNode;
}

/**
 * Bungkus konten sebuah halaman (Dashboard, History) dengan gesture
 * pull-to-refresh. Lihat `usePullToRefresh.ts` untuk detail gesture &
 * kenapa ini perlu dibuat custom alih-alih pakai bawaan browser.
 */
export const PullToRefresh: React.FC<PullToRefreshProps> = ({ onRefresh, children }) => {
  const { tokens, cx } = useThemeTokens();
  const { pullDistance, isRefreshing, threshold } = usePullToRefresh(onRefresh);

  const progress = Math.min(1, pullDistance / threshold);
  const isReady = pullDistance >= threshold;

  return (
    <div className="relative">
      {/* Indikator -- posisinya "mengambang" di atas konten, terungkap
          begitu konten di bawahnya ikut tergeser turun oleh drag. */}
      <div
        className="absolute left-0 right-0 flex justify-center pointer-events-none"
        style={{
          top: -40,
          height: 40,
          opacity: isRefreshing ? 1 : progress,
          transform: `translateY(${Math.min(pullDistance, threshold + 8)}px)`,
        }}
        aria-hidden="true"
      >
        <div
          className={cx(
            "w-8 h-8 rounded-full flex items-center justify-center border shadow-sm",
            tokens.surface.card,
            tokens.border.accent,
            isReady || isRefreshing ? tokens.text.accent : tokens.text.muted
          )}
        >
          <RefreshCw
            size={15}
            className={isRefreshing ? "animate-spin" : ""}
            style={isRefreshing ? undefined : { transform: `rotate(${progress * 220}deg)` }}
          />
        </div>
      </div>

      {/* Konten asli -- ikut tergeser turun mengikuti jari selama drag,
          kembali/menetap dengan easing begitu jari dilepas. */}
      <div
        style={{
          transform: `translateY(${pullDistance}px)`,
          transition: pullDistance === 0 || isRefreshing ? "transform 0.25s ease-out" : "none",
        }}
      >
        {children}
      </div>
    </div>
  );
};
