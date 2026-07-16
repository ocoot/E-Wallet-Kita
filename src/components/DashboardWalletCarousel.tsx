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
  /**
   * Kartu "dashboard dinamis" (greeting/cuaca -- DashboardHeader) sekarang
   * digeser jadi item PERTAMA di strip carousel yang sama dengan kartu Pos
   * Dompet, bukan ditumpuk terpisah di atasnya lagi. Dilempar dari
   * Dashboard.tsx lewat prop ini supaya seluruh logic cuaca/greeting tetap
   * hidup di DashboardHeader.tsx (tidak diduplikasi di sini) -- komponen
   * ini hanya membungkusnya jadi satu snap-item di antara kartu-kartu
   * lainnya. Efeknya: satu strip horizontal, satu jari, geser satu-satu
   * (kartu dashboard -> Saldo Umum -> kartu wallet lain -> ...), masing-
   * masing kartu adalah snap-point sendiri (lihat class `snap-center` di
   * bawah), jadi "mudah discroll per-kartu" untuk keduanya sekaligus.
   */
  headerSlot?: React.ReactNode;
}

/**
 * Strip carousel dashboard -- gabungan kartu "dashboard dinamis" (greeting +
 * cuaca, dilempar lewat `headerSlot`) dan kartu Pos Dompet (Saldo Umum, tiap
 * E-Wallet/Rekening yang diisi user, Cash), semuanya jadi SATU baris yang
 * digeser (swipe) horizontal, snap satu-per-satu -- bukan dua blok terpisah
 * yang ditumpuk vertikal seperti sebelumnya. Kartu E-Wallet/Bank yang
 * provider-nya cocok katalog (Gopay/OVO/ShopeePay/Dana/Mandiri/BCA/BRI/BNI)
 * pakai warna brand + logo dengan background transparan (lihat
 * data/walletProviders.ts). Kelola penuh (nomor HP/rekening, saldo manual,
 * arsip) ada di /wallets.
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
export const DashboardWalletCarousel: React.FC<DashboardWalletCarouselProps> = ({ formatIDR, headerSlot }) => {
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

  // Dulu: loading/kosong -> return skeleton/null lebih awal, jadi kartu
  // dashboard dinamis (headerSlot) ikut tidak tampil kalau wallet masih
  // loading atau belum ada. Sekarang headerSlot HARUS selalu tampil (dia
  // snap-item pertama di strip), jadi skeleton/empty-state wallet dirender
  // di DALAM strip yang sama, bukan menggantikan seluruh komponen.
  const showWalletSkeleton = isLoading;
  const showWalletCards = !isLoading && activeWallets.length > 0;
  const totalSnapItems = (headerSlot ? 1 : 0) + (showWalletCards ? activeWallets.length : 0);

  if (!headerSlot && !showWalletSkeleton && !showWalletCards) return null;

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
    // `sm:max-w-[440px]`: di layar >= 640px kartu-kartu di dalam strip pakai
    // lebar tetap (420px/360px, lihat di bawah), BUKAN w-full seperti versi
    // mobile. Tanpa pembatas ini, area strip mengikuti lebar kolom dashboard
    // (bisa ratusan px lebih lebar dari satu kartu), sehingga kartu
    // berikutnya ikut kepampang penuh di sebelahnya alih-alih tersembunyi di
    // luar viewport carousel -- persis masalah yang dilaporkan (kartu
    // sebelum/sesudahnya ikut tampil). Dengan strip dibatasi selebar satu
    // kartu (+ sedikit ruang), sisanya otomatis di-scroll/swipe seperti
    // carousel semestinya, dan hanya SATU kartu yang terlihat pada satu
    // waktu -- sama seperti perilaku di mobile.
    <div className="space-y-2.5 sm:max-w-[440px]">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-1 -mx-1 px-1 scroll-smooth [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
      >
        {/* Kartu dashboard dinamis (greeting + cuaca) -- snap-item pertama
            di strip yang sama dengan kartu Pos Dompet, supaya bisa digeser
            satu jari dari sini langsung ke kartu Saldo Umum / wallet lain. */}
        {headerSlot && (
          <div className="shrink-0 w-full sm:w-[420px] snap-center">
            {headerSlot}
          </div>
        )}

        {showWalletSkeleton && (
          <div
            className={cx(
              "shrink-0 w-full sm:w-[360px] h-40 rounded-3xl border animate-pulse snap-center",
              tokens.surface.card,
              "border-slate-800/60 light_sakura:border-rose-100/40"
            )}
          />
        )}

        {showWalletCards && activeWallets.map((w) => {
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
              className="relative shrink-0 w-full sm:w-[360px] snap-center overflow-hidden rounded-3xl border cursor-pointer transition-transform active:scale-[0.98]"
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

      {totalSnapItems > 1 && (
        <div className="flex items-center justify-center gap-1 pt-0.5">
          {headerSlot && (
            <button
              type="button"
              aria-label="1"
              onClick={() => scrollToIndex(0)}
              // `btn-exact`: lolos dari rule global tap-target mobile yang
              // memaksa min-height 44px ke semua <button> (lihat index.css).
              // Tanpa ini, titik dot yang seharusnya cuma h-1 (4px) ikut
              // "digelembungkan" jadi bar tinggi 44px di mobile -- itulah
              // "sliding" besar yang dilaporkan, padahal di web/tablet (yang
              // tidak kena media query mobile itu) dot-nya sudah kecil rapi.
              className={cx(
                // `relative before:-inset-y-3.5 ...`: dot-nya sendiri tetap
                // kecil (h-1) secara visual, tapi area sentuh diperlebar
                // secara transparan lewat pseudo-element ::before (pola yang
                // sama dipakai widget kecil lain) supaya tetap nyaman
                // disentuh di layar mobile walau sudah lolos dari
                // min-height 44px paksaan.
                "btn-exact relative h-1 rounded-full transition-all cursor-pointer before:absolute before:-inset-y-3.5 before:-inset-x-1 before:content-['']",
                activeIndex === 0 ? "w-3.5 bg-indigo-400 light_sakura:bg-rose-400" : "w-1 bg-slate-700 light_sakura:bg-rose-200"
              )}
            />
          )}
          {showWalletCards && activeWallets.map((w, idx) => {
            const dotIndex = (headerSlot ? 1 : 0) + idx;
            return (
              <button
                key={w.id}
                type="button"
                aria-label={`${dotIndex + 1}`}
                onClick={() => scrollToIndex(dotIndex)}
                // `btn-exact`: sama seperti dot pertama di atas -- cegah
                // min-height 44px global membuat dot ini jadi bar tinggi di
                // mobile.
                className={cx(
                  // Sama seperti dot pertama -- area sentuh diperlebar lewat
                  // ::before transparan, visual dot tetap kecil.
                  "btn-exact relative h-1 rounded-full transition-all cursor-pointer before:absolute before:-inset-y-3.5 before:-inset-x-1 before:content-['']",
                  dotIndex === activeIndex ? "w-3.5 bg-indigo-400 light_sakura:bg-rose-400" : "w-1 bg-slate-700 light_sakura:bg-rose-200"
                )}
              />
            );
          })}
        </div>
      )}
    </div>
  );
};
