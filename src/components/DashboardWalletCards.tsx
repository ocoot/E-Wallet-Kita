import React, { useState } from "react";
import { motion } from "motion/react";
import { useNavigate } from "react-router-dom";
import { Wallet as WalletIcon, Eye, EyeOff, Plus, Layers, Banknote } from "lucide-react";
import { useLanguage } from "../contexts/LanguageContext";
import { useWallets } from "../hooks/useWallets";
import { useBalanceVisibility, maskCurrency } from "../contexts/BalanceVisibilityContext";
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
 */
export const DashboardWalletCards: React.FC<DashboardWalletCardsProps> = ({ formatIDR }) => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { activeWallets, isLoading } = useWallets();
  const [visibleContactIds, setVisibleContactIds] = useState<Set<string>>(new Set());
  // Baca saja -- toggle mata TUNGGAL untuk semua nominal ada di
  // BalanceVisibilityToggle.tsx (bar sticky di puncak Dashboard), supaya
  // tidak ada ikon mata berulang di tiap kartu (lihat catatan di file itu).
  const { visible: balanceVisible } = useBalanceVisibility();

  const toggleContact = (id: string) => {
    setVisibleContactIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  if (isLoading) {
    return <div className="h-28 rounded-3xl border border-slate-800/60 bg-slate-900 light_sakura:bg-white light_sakura:border-rose-100/40 animate-pulse" />;
  }

  if (activeWallets.length === 0) return null;

  return (
    <Card padding="sm" elevation="sm" className="space-y-3">
      <div className="flex items-center gap-2">
        <WalletIcon size={14} className="text-indigo-400 light_sakura:text-rose-500" />
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 light_sakura:text-slate-500">
          {t("wallet.title")}
        </h3>
        <button
          onClick={() => { audioFeedback.playClick(); navigate("/wallets"); }}
          className="ml-auto flex items-center gap-1 text-[11px] font-bold text-indigo-400 hover:text-indigo-300 cursor-pointer light_sakura:text-rose-500"
        >
          <Plus size={12} /> {t("wallet.title")}
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
              className="shrink-0 w-[168px] snap-start text-left rounded-2xl border p-4 space-y-2 cursor-pointer transition-colors bg-slate-950/40 border-slate-800/60 hover:bg-slate-800/60 light_sakura:bg-rose-50/30 light_sakura:border-rose-100/50 light_sakura:hover:bg-rose-50/60"
            >
              <div className="flex items-center gap-1.5">
                <span className="text-sm">{WALLET_TYPE_ICON[w.type]}</span>
                <span className="font-sans text-[11px] font-bold text-slate-300 truncate light_sakura:text-slate-600">{w.name}</span>
                {w.type === "general" && (
                  <InfoTooltip text={t("wallet.general_desc")} align="left" className="shrink-0" />
                )}
              </div>
              <p className="font-sans font-black text-lg tabular-nums text-white leading-tight light_sakura:text-slate-900">
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
                <div className="flex items-center gap-1 text-[10px] text-slate-500 light_sakura:text-slate-400">
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
