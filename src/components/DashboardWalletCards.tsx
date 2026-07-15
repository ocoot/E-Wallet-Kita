import React, { useState } from "react";
import { motion } from "motion/react";
import { useNavigate } from "react-router-dom";
import { Wallet as WalletIcon, Eye, EyeOff, Layers, Banknote } from "lucide-react";
import { useLanguage } from "../contexts/LanguageContext";
import { useWallets } from "../hooks/useWallets";
import { useBalanceVisibility, maskCurrency } from "../contexts/BalanceVisibilityContext";
import { useThemeTokens } from "../hooks/useThemeTokens";
import { audioFeedback } from "../lib/audio";
import { InfoTooltip } from "./InfoTooltip";
import { Card } from "./ui/Card";

const WALLET_TYPE_ICON: Record<string, string> = { ewallet: "", bank: "", cash: "", general: "" };

const maskContact = (value: string) => {
  const v = value.trim();
  if (v.length <= 4) return "•".repeat(Math.max(v.length, 3));
  return "•".repeat(v.length - 4) + " " + v.slice(-4);
};

interface DashboardWalletCardsProps {
  formatIDR: (num: number) => string;
  refreshTrigger: number;
}

/**
 * Menampilkan tiap Pos Dompet milik user (E-Wallet/Rekening/Cash/Saldo Total)
 * sebagai kartu terpisah -- menggantikan kartu tunggal "Saldo Tersedia" lama
 * yang menggabungkan semuanya jadi satu angka. Lihat Wallets.tsx untuk kelola
 * penuh (tambah pos, edit saldo manual, arsipkan, nomor HP/rekening).
 *
 * REFACTOR (theme tokens, 2026-07-15): pasangan class dark/light_sakura yang
 * exact match dengan token semantik di lib/theme/tokens.ts sudah dipindah ke
 * `tokens.*` lewat useThemeTokens(). Yang SENGAJA tetap literal (tombol
 * show/hide header, opacity /60 /50 pada kartu wallet) karena kombinasinya
 * spesifik untuk komponen ini (opacity berbeda dari token generik) -- lihat
 * komentar inline di tiap titik. Jangan paksa jadi token generik hanya demi
 * "semua harus pakai tokens" kalau nilainya beda dari pola yang sudah umum;
 * itu justru bikin token drift dari nama semantiknya.
 */
export const DashboardWalletCards: React.FC<DashboardWalletCardsProps> = ({ formatIDR }) => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { activeWallets, isLoading } = useWallets();
  const { tokens, cx } = useThemeTokens();
  const [visibleContactIds, setVisibleContactIds] = useState<Set<string>>(new Set());
  // Toggle mata TUNGGAL untuk semua nominal di Dashboard kini ditaruh di sini,
  // menggantikan tombol "+ Pos Dompet" yang sebelumnya ada di header ini --
  // tombol itu cuma navigate("/wallets"), fungsinya identik dengan tap kartu
  // Pos Dompet apa pun di bawah, jadi murni duplikat & memakan slot header.
  // Slot itu sekarang dipakai untuk kontrol show/hide nominal, supaya ada di
  // dekat angka yang dikontrolnya (lihat juga BalanceVisibilityContext.tsx).
  const { visible: balanceVisible, toggle: toggleBalanceVisible } = useBalanceVisibility();

  const toggleContact = (id: string) => {
    setVisibleContactIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  if (isLoading) {
    return (
      <div
        className={cx(
          "h-28 rounded-3xl border animate-pulse",
          tokens.surface.card,
          "border-slate-800/60 light_sakura:border-rose-100/40" // opacity spesifik skeleton, bukan token generik
        )}
      />
    );
  }

  if (activeWallets.length === 0) return null;

  return (
    <Card padding="sm" elevation="sm" className="space-y-3">
      <div className="flex items-center gap-2">
        <WalletIcon size={14} className={tokens.icon.accent} />
        <h3 className={cx("text-xs font-bold uppercase tracking-wider", tokens.text.muted)}>
          {t("wallet.title")}
        </h3>
        <button
          type="button"
          onClick={() => { audioFeedback.playClick(); toggleBalanceVisible(); }}
          aria-pressed={!balanceVisible}
          aria-label={balanceVisible ? t("common.hide_balance") : t("common.show_balance")}
          className={cx(
            "ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors cursor-pointer",
            tokens.surface.sunken,
            // Kombinasi border/text/hover di pill ini spesifik (border/50, text-rose-600
            // saat light, hover:text-white) -- tidak match 1:1 ke token lain, tetap literal.
            "border border-slate-800/60 text-slate-300 hover:bg-slate-800/60 hover:text-white",
            "light_sakura:border-rose-100/50 light_sakura:text-rose-600 light_sakura:hover:bg-rose-50"
          )}
        >
          {balanceVisible ? <Eye size={12} className="shrink-0" /> : <EyeOff size={12} className="shrink-0" />}
          <span className="whitespace-nowrap">
            {balanceVisible ? t("common.hide_balance") : t("common.show_balance")}
          </span>
        </button>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1 snap-x">
        {activeWallets.map((w) => {
          const contactValue = w.type === "ewallet" ? w.phone_number : w.type === "bank" ? w.account_number : null;
          const isVisible = visibleContactIds.has(w.id);
          return (
            <motion.div
              key={w.id}
              initial={{ opacity: 0, y: 6 }}
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
              className={cx(
                "shrink-0 w-[168px] snap-start text-left rounded-2xl border p-4 space-y-2 cursor-pointer transition-colors",
                tokens.surface.sunken,
                tokens.hover.sunken,
                // border/60 + rose-100/50 -- opacity spesifik kartu ini, literal.
                "border-slate-800/60 light_sakura:border-rose-100/50"
              )}
            >
              <div className="flex items-center gap-1.5">
                <span className="text-sm">{WALLET_TYPE_ICON[w.type]}</span>
                <span className={cx("font-sans text-[11px] font-bold truncate", tokens.text.label)}>{w.name}</span>
                {w.type === "general" && (
                  <InfoTooltip text={t("wallet.general_desc")} align="left" className="shrink-0" />
                )}
              </div>
              <p className={cx("font-sans font-black text-lg tabular-nums leading-tight", tokens.text.primary)}>
                {balanceVisible ? formatIDR(w.balance) : maskCurrency(formatIDR(w.balance))}
              </p>
              {contactValue ? (
                <div
                  onClick={(e) => { e.stopPropagation(); toggleContact(w.id); }}
                  className="flex items-center gap-1 text-[10px] text-slate-500 tabular-nums cursor-pointer hover:text-slate-300"
                >
                  <span className="truncate">{isVisible ? contactValue : maskContact(contactValue)}</span>
                  {isVisible ? <EyeOff size={10} className="shrink-0" /> : <Eye size={10} className="shrink-0" />}
                </div>
              ) : (
                // REVISI: dulu baris ini kosong (&nbsp;), membuat kartu tanpa
                // nomor kontak (general/cash) terasa "kosong" dan tidak
                // sepadan secara visual dengan kartu bank yang punya baris
                // nomor rekening. Sekarang diisi caption singkat sesuai tipe
                // pos, supaya kepadatan visual antar kartu konsisten.
                <div className={cx("flex items-center gap-1 text-[10px]", tokens.text.faint)}>
                  {w.type === "cash" ? (
                    <Banknote size={10} className="shrink-0" />
                  ) : (
                    <Layers size={10} className="shrink-0" />
                  )}
                  <span className="truncate">
                    {w.type === "cash" ? t("wallet.card_caption_cash") : t("wallet.card_caption_general")}
                  </span>
                </div>
              )}
            </motion.div>
          );
        })}
      </div>
    </Card>
  );
};
