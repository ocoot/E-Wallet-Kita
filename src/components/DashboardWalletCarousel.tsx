import React, { useRef, useState, useCallback } from "react";
import { motion } from "motion/react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff, ChevronRight, Banknote, Layers } from "lucide-react";
import { useLanguage } from "../contexts/LanguageContext";
import { useWallets } from "../hooks/useWallets";
import { useThemeTokens } from "../hooks/useThemeTokens";
import { audioFeedback } from "../lib/audio";
import { ProviderBadge } from "./ProviderBadge";
import { matchProvider, NEUTRAL_PROVIDER_COLOR } from "../data/walletProviders";
import { WalletWithBalance } from "../types";

const maskContact = (value: string) => {
  const v = value.trim();
  if (v.length <= 4) return "•".repeat(Math.max(v.length, 3));
  return "•".repeat(v.length - 4) + " " + v.slice(-4);
};

interface DashboardWalletCarouselProps {
  formatIDR: (num: number) => string;
  refreshTrigger: number;
}

/**
 * Kartu Pos Dompet -- pengganti DashboardWalletCards (baris chip kecil
 * berjejer). Sekarang tiap Pos Dompet (Saldo Umum, tiap E-Wallet/Rekening
 * yang diisi user, Cash) dirender sebagai KARTU PENUH bergaya kartu
 * e-wallet sungguhan, satu per satu, dan digeser (swipe) horizontal --
 * bukan discroll berjejer kecil.
 *
 * REVISI: logo provider (Gopay/OVO/ShopeePay/Dana) sebelumnya dipasang
 * sebagai badge kecil (di-crop object-cover ke kotak 40px) -- karena aset
 * logo yang ada berbentuk lockup/banner (bukan mark persegi), hasil crop-nya
 * terlihat terpotong aneh. Sekarang logo dipakai sebagai BACKGROUND yang
 * membungkus seluruh kartu (object-cover mengisi penuh area kartu, bukan
 * kotak kecil), dengan lapisan gradient gelap di atasnya supaya teks saldo
 * tetap terbaca. Kartu Bank/Cash/Saldo Umum/"Lainnya" (belum ada aset logo)
 * tetap pakai gradient warna brand + badge inisial seperti sebelumnya.
 *
 * Toggle "sembunyikan nominal" yang dulu ada di header komponen ini SUDAH
 * DIHAPUS -- saldo selalu ditampilkan apa adanya di sini. Toggle show/hide
 * nomor HP/rekening per-kartu tetap ada (fitur privasi berbeda, bukan
 * "nominal").
 */
export const DashboardWalletCarousel: React.FC<DashboardWalletCarouselProps> = ({ formatIDR }) => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { activeWallets, isLoading } = useWallets();
  const { tokens, cx, theme } = useThemeTokens();
  const [visibleContactIds, setVisibleContactIds] = useState<Set<string>>(new Set());
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const toggleContact = (id: string) => {
    setVisibleContactIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || el.children.length === 0) return;
    const cardWidth = (el.children[0] as HTMLElement).offsetWidth + 12; // + gap-3
    const idx = Math.round(el.scrollLeft / cardWidth);
    setActiveIndex(Math.max(0, Math.min(idx, el.children.length - 1)));
  }, []);

  const scrollToIndex = (idx: number) => {
    const el = scrollRef.current;
    if (!el || !el.children[idx]) return;
    const card = el.children[idx] as HTMLElement;
    el.scrollTo({ left: card.offsetLeft - el.offsetLeft, behavior: "smooth" });
  };

  if (isLoading) {
    return (
      <div
        className={cx(
          "h-40 rounded-3xl border animate-pulse",
          tokens.surface.card,
          "border-slate-800/60 light_sakura:border-rose-100/40"
        )}
      />
    );
  }

  if (activeWallets.length === 0) return null;

  const isDark = theme === "dark_obsidian";

  const cardVisual = (wallet: WalletWithBalance) => {
    const matched = matchProvider(wallet.type, wallet.provider);
    const color = matched?.color || NEUTRAL_PROVIDER_COLOR;
    const hasLogoBg = !!matched?.logo;
    return {
      color,
      hasLogoBg,
      logo: matched?.logo,
      backgroundStyle: hasLogoBg
        ? undefined // background berupa <img>, bukan gradient -- lihat render di bawah
        : ({
            background: isDark
              ? `linear-gradient(135deg, ${color}33 0%, ${color}0D 60%, transparent 100%)`
              : `linear-gradient(135deg, ${color}26 0%, ${color}0A 60%, transparent 100%)`,
          } as React.CSSProperties),
      borderStyle: { borderColor: hasLogoBg ? `${color}55` : `${color}40` } as React.CSSProperties,
    };
  };

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between px-1">
        <h3 className={cx("text-xs font-bold uppercase tracking-wider", tokens.text.muted)}>
          {t("wallet.title")}
        </h3>
        <span className={cx("text-[10px] font-medium", tokens.text.faint)}>
          {t("dashboard.wallet_carousel_hint")}
        </span>
      </div>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-1 -mx-1 px-1 scroll-smooth [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
      >
        {activeWallets.map((w) => {
          const contactValue = w.type === "ewallet" ? w.phone_number : w.type === "bank" ? w.account_number : null;
          const isContactVisible = visibleContactIds.has(w.id);
          const { color, hasLogoBg, logo, backgroundStyle, borderStyle } = cardVisual(w);
          const typeCaption =
            w.type === "ewallet" ? t("wallet.group_ewallet") :
            w.type === "bank" ? t("wallet.group_bank") :
            w.type === "cash" ? t("wallet.group_cash") : t("wallet.group_general");
          // Kartu berlogo (background foto) selalu pakai teks terang -- scrim
          // gradasi gelap di atasnya butuh kontras tetap, tidak boleh ikut
          // switching text-gelap saat tema light_sakura seperti kartu lain.
          const primaryTextClass = hasLogoBg ? "text-white" : tokens.text.primary;
          const mutedTextClass = hasLogoBg ? "text-white/70" : tokens.text.muted;
          const faintTextClass = hasLogoBg ? "text-white/60" : tokens.text.faint;

          return (
            <motion.div
              key={w.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              role="button"
              tabIndex={0}
              onClick={() => { audioFeedback.playClick(); navigate("/wallets"); }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  audioFeedback.playClick();
                  navigate("/wallets");
                }
              }}
              style={borderStyle}
              className="relative shrink-0 w-[88%] sm:w-[360px] snap-center overflow-hidden rounded-3xl border cursor-pointer transition-transform active:scale-[0.98]"
            >
              {/* Layer background: kartu berlogo dibungkus penuh oleh gambar
                  logo provider (bukan badge kecil) + scrim gelap di atasnya
                  supaya teks tetap terbaca; kartu tanpa aset logo pakai
                  gradient warna brand transparan seperti sebelumnya. */}
              {hasLogoBg ? (
                <>
                  <img src={logo} alt="" aria-hidden="true" className="absolute inset-0 w-full h-full object-cover" />
                  <div
                    className="absolute inset-0"
                    style={{ background: `linear-gradient(180deg, ${color}66 0%, rgba(0,0,0,0.55) 45%, rgba(0,0,0,0.82) 100%)` }}
                  />
                </>
              ) : (
                <div className="absolute inset-0 backdrop-blur-xl" style={backgroundStyle} />
              )}

              <div className="relative z-10 p-5 space-y-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {!hasLogoBg && (
                      w.type === "ewallet" || w.type === "bank" ? (
                        <ProviderBadge type={w.type} provider={w.provider} size={40} />
                      ) : (
                        <span
                          className="inline-flex items-center justify-center rounded-xl shrink-0 text-white"
                          style={{ width: 40, height: 40, backgroundColor: `${color}CC` }}
                        >
                          {w.type === "cash" ? <Banknote size={19} /> : <Layers size={19} />}
                        </span>
                      )
                    )}
                    <div className="min-w-0">
                      <p className={cx("font-sans font-bold text-sm truncate drop-shadow-sm", primaryTextClass)}>{w.name}</p>
                      <p className={cx("font-sans text-[10px] uppercase tracking-wide truncate", mutedTextClass)}>
                        {typeCaption}
                      </p>
                    </div>
                  </div>
                  <ChevronRight size={16} className={cx("shrink-0 mt-1", faintTextClass)} />
                </div>

                <div>
                  <p className={cx("font-sans text-[10px] uppercase tracking-wider font-bold", mutedTextClass)}>
                    {t("wallet.label_pos")}
                  </p>
                  <p className={cx("font-sans font-black text-2xl tabular-nums leading-tight drop-shadow-sm", primaryTextClass)}>
                    {formatIDR(w.balance)}
                  </p>
                </div>

                {contactValue ? (
                  <div
                    onClick={(e) => { e.stopPropagation(); toggleContact(w.id); }}
                    className={cx(
                      "flex items-center gap-1.5 text-[11px] tabular-nums cursor-pointer w-fit px-2 py-1 rounded-lg",
                      mutedTextClass,
                      hasLogoBg ? "bg-black/25 hover:bg-black/35" : "bg-black/10 hover:bg-black/15 light_sakura:bg-white/40 light_sakura:hover:bg-white/60"
                    )}
                  >
                    <span className="truncate">{isContactVisible ? contactValue : maskContact(contactValue)}</span>
                    {isContactVisible ? <EyeOff size={11} className="shrink-0" /> : <Eye size={11} className="shrink-0" />}
                  </div>
                ) : (
                  <p className={cx("font-sans text-[11px]", faintTextClass)}>
                    {w.type === "cash" ? t("wallet.card_caption_cash") : t("wallet.card_caption_general")}
                  </p>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      {activeWallets.length > 1 && (
        <div className="flex items-center justify-center gap-1.5 pt-0.5">
          {activeWallets.map((w, idx) => (
            <button
              key={w.id}
              type="button"
              aria-label={`${idx + 1}`}
              onClick={() => scrollToIndex(idx)}
              className={cx(
                "h-1.5 rounded-full transition-all cursor-pointer",
                idx === activeIndex ? "w-5 bg-indigo-400 light_sakura:bg-rose-400" : "w-1.5 bg-slate-700 light_sakura:bg-rose-200"
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
};
