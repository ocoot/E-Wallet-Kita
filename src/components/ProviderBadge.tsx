import React from "react";
import { Wallet as WalletIcon, Landmark, Banknote, Layers } from "lucide-react";
import { WalletType } from "../types";
import { matchProvider } from "../data/walletProviders";
import { useThemeTokens } from "../hooks/useThemeTokens";

interface ProviderBadgeProps {
  type: WalletType;
  provider: string | null | undefined;
  size?: number;
  className?: string;
}

/**
 * Badge bulat kecil untuk logo provider (dari katalog di
 * data/walletProviders.ts -- e-wallet maupun bank) atau, kalau tidak match
 * katalog (mis. "Lainnya" or wallet lama), inisial/ikon generik sebagai
 * fallback. Dipakai di Wallets.tsx (list pos) supaya identitas visual
 * provider tetap terlihat di baris pengelolaan pos.
 *
 * Aset logo yang ada berbentuk lockup/banner (rasio bukan 1:1) -- makanya
 * dipakai `object-contain` + padding tipis (bukan `object-cover`) supaya
 * logo utuh terlihat letterboxed, tidak terpotong aneh. Untuk versi
 * "membungkus" seluruh kartu (background penuh + logoBgColor per brand),
 * lihat DashboardWalletCarousel.tsx yang me-render <img> langsung, bukan
 * lewat badge ini.
 */
export const ProviderBadge: React.FC<ProviderBadgeProps> = ({ type, provider, size = 36, className = "" }) => {
  const { tokens, cx } = useThemeTokens();
  const matched = matchProvider(type, provider);
  const dim = { width: size, height: size };

  if (matched?.logo) {
    return (
      <span
        className={`inline-flex items-center justify-center rounded-xl overflow-hidden shrink-0 bg-white ${className}`}
        style={dim}
      >
        <img src={matched.logo} alt={matched.name} className="w-full h-full object-contain" style={{ padding: Math.round(size * 0.12) }} />
      </span>
    );
  }

  if (matched) {
    // Bank yang match katalog tapi belum ada aset logo -- pakai inisial di atas warna brand.
    const initials = matched.name.replace(/^Bank\s+/i, "").slice(0, 3).toUpperCase();
    return (
      <span
        className={`inline-flex items-center justify-center rounded-xl shrink-0 text-white font-sans font-bold ${className}`}
        style={{ ...dim, backgroundColor: matched.color, fontSize: size * 0.32 }}
      >
        {initials}
      </span>
    );
  }

  const Icon = type === "bank" ? Landmark : type === "cash" ? Banknote : type === "ewallet" ? WalletIcon : Layers;
  return (
    <span
      className={cx(
        "inline-flex items-center justify-center rounded-xl shrink-0",
        tokens.providerBadge.iconChipBg,
        tokens.text.accent,
        className
      )}
      style={dim}
    >
      <Icon size={size * 0.5} />
    </span>
  );
};
