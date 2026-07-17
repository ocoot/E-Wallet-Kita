import React, { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useNavigate } from "react-router-dom";
import { TrendingUp, TrendingDown, ChevronRight, Banknote, Layers, Eye, EyeOff, Wallet as WalletIcon } from "lucide-react";
import { useLanguage } from "../contexts/LanguageContext";
import { useWallets } from "../hooks/useWallets";
import { useThemeTokens } from "../hooks/useThemeTokens";
import { useBalanceVisibility, maskCurrency } from "../contexts/BalanceVisibilityContext";
import { audioFeedback } from "../lib/audio";
import { ProviderBadge } from "./ProviderBadge";
import { DropdownField, DropdownOption } from "./DropdownField";
import { matchProvider, NEUTRAL_PROVIDER_COLOR } from "../data/walletProviders";
import { Transaction, WalletWithBalance } from "../types";

const maskContact = (value: string) => {
  const v = value.trim();
  if (v.length <= 4) return "•".repeat(Math.max(v.length, 3));
  return "•".repeat(v.length - 4) + " " + v.slice(-4);
};

interface DashboardWalletSelectorCardProps {
  formatIDR: (num: number) => string;
  /**
   * Transaksi BULAN BERJALAN milik user (sudah termasuk `wallet_id` --
   * lihat Dashboard.tsx `loadData()`). Setiap transaksi SELALU punya
   * wallet_id terisi (fallback ke pos Saldo Umum saat disimpan tanpa
   * memilih pos -- lihat `dbService.saveTransaction`), jadi cukup di-filter
   * per `wallet_id` di sini tanpa perlu query terpisah per pos.
   */
  transactions: Transaction[];
  /** Berubah setiap kali ada transaksi baru/diubah -- dipakai untuk trigger refetch saldo pos (lewat useWallets().refresh()). */
  refreshTrigger?: number;
}

/**
 * Kartu "Pos Dompet" dashboard -- versi SELECTOR (dropdown), menggantikan
 * strip carousel lama yang menampilkan semua kartu pos sekaligus lewat
 * swipe (lihat DashboardWalletCarousel.tsx, sekarang sudah tidak dipakai
 * di Dashboard.tsx). Alih-alih menggeser satu-satu, user memilih pos lewat
 * dropdown di header kartu (Saldo Umum / Bank BCA / Gopay / Tunai / dst),
 * dan kartu ini menampilkan SATU pos yang dipilih: saldo pos tersebut, plus
 * ringkasan Pemasukan & Pengeluaran BULAN INI khusus pos itu (dihitung dari
 * `transactions` yang di-filter by `wallet_id`, pola yang sama seperti
 * referensi desain "Total Saldo + Bank BCA + Pemasukan/Pengeluaran").
 *
 * Visual kartu (gradient warna brand / logo provider membungkus kartu)
 * meniru `cardVisual()` di DashboardWalletCarousel.tsx supaya identitas
 * visual per-provider tetap konsisten dengan halaman /wallets, cuma
 * sekarang cuma satu kartu yang tampil pada satu waktu (crossfade lewat
 * AnimatePresence saat pilihan diganti, bukan pindah snap-point).
 */
export const DashboardWalletSelectorCard: React.FC<DashboardWalletSelectorCardProps> = ({
  formatIDR,
  transactions,
  refreshTrigger,
}) => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { activeWallets, generalWallet, isLoading, refresh } = useWallets();
  const { tokens, cx, theme } = useThemeTokens();
  const { visible: balanceVisible } = useBalanceVisibility();
  const [selectedId, setSelectedId] = useState<string>("");
  const [contactVisible, setContactVisible] = useState(false);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (refreshTrigger !== undefined) refresh(); }, [refreshTrigger]);

  // Default pilihan: Saldo Umum kalau ada, kalau tidak pos pertama yang
  // ada. Cuma di-set SEKALI saat data pertama kali datang (atau kalau pos
  // yang lagi dipilih ternyata sudah diarsipkan/dihapus dari pos lain).
  useEffect(() => {
    if (activeWallets.length === 0) return;
    const stillExists = activeWallets.some((w) => w.id === selectedId);
    if (!selectedId || !stillExists) {
      setSelectedId((generalWallet && activeWallets.some((w) => w.id === generalWallet.id) ? generalWallet.id : activeWallets[0].id));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWallets, generalWallet]);

  const selectedWallet: WalletWithBalance | null =
    activeWallets.find((w) => w.id === selectedId) || activeWallets[0] || null;

  const typeCaption = (w: WalletWithBalance) =>
    w.type === "ewallet" ? t("wallet.group_ewallet") :
    w.type === "bank" ? t("wallet.group_bank") :
    w.type === "cash" ? t("wallet.group_cash") : t("wallet.group_general");

  // Normalisasi longgar untuk bandingkan nama pos vs provider -- huruf
  // kecil semua, buang spasi/simbol, dan buang prefix "bank " supaya
  // "BCA" vs "BCA", atau "Bank Mandiri" (nama) vs "Mandiri" (provider),
  // tetap dianggap "sama" walau penulisannya sedikit beda.
  const normalizeForCompare = (s: string) =>
    s.trim().toLowerCase().replace(/^bank\s+/, "").replace(/[^a-z0-9]/g, "");

  // Label dropdown: provider CUMA ditambahkan kalau memang memberi info
  // baru dibanding nama pos -- kalau user menamai pos-nya persis sama
  // dengan provider (mis. nama "BCA" + provider "BCA"), tampilkan nama
  // pos-nya saja supaya tidak muncul duplikat aneh seperti "BCA · BCA".
  const walletDisplayLabel = (w: WalletWithBalance) => {
    if (!w.provider) return w.name;
    const sameAsName = normalizeForCompare(w.provider) === normalizeForCompare(w.name);
    return sameAsName ? w.name : `${w.name} · ${w.provider}`;
  };

  const options: DropdownOption[] = useMemo(
    () =>
      activeWallets.map((w) => ({
        value: w.id,
        label: walletDisplayLabel(w),
      })),
    [activeWallets]
  );

  // Pemasukan & Pengeluaran BULAN INI khusus untuk pos yang sedang dipilih.
  const { income, expense } = useMemo(() => {
    if (!selectedWallet) return { income: 0, expense: 0 };
    let inc = 0;
    let exp = 0;
    for (const tr of transactions) {
      if (tr.wallet_id !== selectedWallet.id) continue;
      if (tr.type === "income") inc += tr.amount;
      else exp += tr.amount;
    }
    return { income: inc, expense: exp };
  }, [transactions, selectedWallet]);

  useEffect(() => setContactVisible(false), [selectedId]);

  const isDark = theme === "dark_obsidian";

  if (isLoading) {
    return (
      <div
        className={cx(
          "w-full h-[19rem] rounded-3xl border animate-pulse",
          tokens.surface.card,
          "border-slate-800/60 light_sakura:border-rose-100/40"
        )}
      />
    );
  }

  if (!selectedWallet) {
    return (
      <div
        className={cx(
          "w-full rounded-3xl border p-6 flex items-center gap-3.5",
          tokens.surface.card,
          "border-slate-800/60 light_sakura:border-rose-100/40"
        )}
      >
        <span className="inline-flex items-center justify-center w-11 h-11 rounded-2xl bg-indigo-500/15 text-indigo-400 shrink-0 light_sakura:bg-rose-500/15 light_sakura:text-rose-500">
          <WalletIcon size={20} />
        </span>
        <p className={cx("text-xs leading-relaxed", tokens.text.muted)}>{t("wallet.selector_card_empty")}</p>
      </div>
    );
  }

  const matched = matchProvider(selectedWallet.type, selectedWallet.provider);
  const color = matched?.color || NEUTRAL_PROVIDER_COLOR;
  const hasLogoBg = !!matched?.logo;
  const logo = matched?.cardLogo || matched?.logo;
  const logoBgColor = matched?.logoBgColor || color;

  const backgroundStyle: React.CSSProperties = {
    background: isDark
      ? `linear-gradient(135deg, ${color}33 0%, ${color}0D 60%, transparent 100%)`
      : `linear-gradient(135deg, ${color}26 0%, ${color}0A 60%, transparent 100%)`,
  };
  const borderStyle: React.CSSProperties = { borderColor: hasLogoBg ? `${logoBgColor}55` : `${color}40` };

  const primaryTextClass = hasLogoBg ? "text-white" : tokens.text.primary;
  const mutedTextClass = hasLogoBg ? "text-white/75" : tokens.text.muted;

  const contactValue =
    selectedWallet.type === "ewallet" ? selectedWallet.phone_number :
    selectedWallet.type === "bank" ? selectedWallet.account_number : null;

  return (
    <div className="space-y-2.5 w-full">
      <AnimatePresence mode="wait">
        <motion.div
          key={selectedWallet.id}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.2 }}
          style={borderStyle}
          className="relative w-full overflow-hidden rounded-3xl border"
        >
          {hasLogoBg ? (
            <>
              <div className="absolute inset-0" style={{ backgroundColor: logoBgColor }} />
              <img src={logo} alt="" aria-hidden="true" className="absolute inset-0 w-full h-full object-contain p-9" />
              <div
                className="absolute inset-0"
                style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.45) 55%, rgba(0,0,0,0.82) 100%)" }}
              />
            </>
          ) : (
            <div className="absolute inset-0 backdrop-blur-xl" style={backgroundStyle} />
          )}

          <div className="relative z-10 p-5 sm:p-6 space-y-5">
            {/* Header: identitas pos + dropdown pemilih pos */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                {!hasLogoBg && (
                  selectedWallet.type === "ewallet" || selectedWallet.type === "bank" ? (
                    <ProviderBadge type={selectedWallet.type} provider={selectedWallet.provider} size={38} />
                  ) : (
                    <span
                      className="inline-flex items-center justify-center rounded-xl shrink-0 text-white"
                      style={{ width: 38, height: 38, backgroundColor: `${color}CC` }}
                    >
                      {selectedWallet.type === "cash" ? <Banknote size={17} /> : <Layers size={17} />}
                    </span>
                  )
                )}
                <div className="min-w-0">
                  <p className={cx("font-sans font-bold text-sm truncate drop-shadow-sm", primaryTextClass)}>
                    {selectedWallet.name}
                  </p>
                  <p className={cx("font-sans text-[10px] uppercase tracking-wide truncate", mutedTextClass)}>
                    {typeCaption(selectedWallet)}
                  </p>
                </div>
              </div>

              {options.length > 1 ? (
                <DropdownField
                  options={options}
                  value={selectedWallet.id}
                  onChange={(v) => { audioFeedback.playClick(); setSelectedId(v); }}
                  accent="indigo"
                  className="w-[10.5rem] sm:w-[13rem] shrink-0"
                  panelClassName="max-w-[16rem]"
                />
              ) : (
                <ChevronRight
                  size={16}
                  className={cx("shrink-0 mt-2 cursor-pointer", mutedTextClass)}
                  onClick={() => { audioFeedback.playClick(); navigate("/wallets"); }}
                />
              )}
            </div>

            {/* Saldo pos terpilih */}
            <div>
              <p className={cx("font-sans text-[10px] uppercase tracking-wider font-bold", mutedTextClass)}>
                {t("wallet.label_pos")}
              </p>
              <p className={cx("font-sans font-black text-3xl tabular-nums leading-tight drop-shadow-sm", primaryTextClass)}>
                {balanceVisible ? formatIDR(selectedWallet.balance) : maskCurrency(formatIDR(selectedWallet.balance))}
              </p>
              {contactValue ? (
                <div
                  onClick={(e) => { e.stopPropagation(); setContactVisible((v) => !v); }}
                  className={cx(
                    "mt-2 inline-flex items-center gap-1.5 text-[11px] tabular-nums cursor-pointer w-fit px-2 py-1 rounded-lg",
                    mutedTextClass,
                    hasLogoBg ? "bg-black/25 hover:bg-black/35" : "bg-black/10 hover:bg-black/15 light_sakura:bg-white/40 light_sakura:hover:bg-white/60"
                  )}
                >
                  <span className="truncate">{contactVisible ? contactValue : maskContact(contactValue)}</span>
                  {contactVisible ? <EyeOff size={11} className="shrink-0" /> : <Eye size={11} className="shrink-0" />}
                </div>
              ) : (
                <p className={cx("font-sans text-[11px] mt-1", mutedTextClass)}>
                  {selectedWallet.type === "cash" ? t("wallet.card_caption_cash") : t("wallet.card_caption_general")}
                </p>
              )}
            </div>

            {/* Pemasukan & Pengeluaran bulan ini khusus pos ini */}
            <div>
              <div
                className={cx(
                  "grid grid-cols-2 gap-2.5 rounded-2xl border p-3",
                  hasLogoBg ? "border-white/10 bg-black/20" : "border-slate-800/60 bg-slate-950/25 light_sakura:bg-white/30 light_sakura:border-rose-100/40"
                )}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-emerald-500/15 text-emerald-400 shrink-0">
                    <TrendingUp size={13} />
                  </span>
                  <div className="min-w-0">
                    <p className={cx("text-[9.5px] uppercase font-bold tracking-wide truncate", mutedTextClass)}>
                      {t("dashboard.income")}
                    </p>
                    <p className="text-xs font-bold text-emerald-400 tabular-nums truncate">
                      {balanceVisible ? formatIDR(income) : maskCurrency(formatIDR(income))}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 min-w-0">
                  <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-red-500/15 text-red-400 shrink-0">
                    <TrendingDown size={13} />
                  </span>
                  <div className="min-w-0">
                    <p className={cx("text-[9.5px] uppercase font-bold tracking-wide truncate", mutedTextClass)}>
                      {t("dashboard.expense")}
                    </p>
                    <p className="text-xs font-bold text-red-400 tabular-nums truncate">
                      {balanceVisible ? formatIDR(expense) : maskCurrency(formatIDR(expense))}
                    </p>
                  </div>
                </div>
              </div>
              <p className={cx("text-[10px] mt-1.5 px-0.5", mutedTextClass)}>
                {t("wallet.selector_card_this_month")}
              </p>
            </div>

            <button
              type="button"
              onClick={() => { audioFeedback.playClick(); navigate("/wallets"); }}
              className={cx(
                "flex items-center gap-1 text-[11px] font-semibold cursor-pointer transition-colors",
                hasLogoBg ? "text-white/80 hover:text-white" : "text-indigo-400 hover:text-indigo-300 light_sakura:text-rose-500 light_sakura:hover:text-rose-600"
              )}
            >
              <span>{t("wallet.selector_card_view_all")}</span>
              <ChevronRight size={12} />
            </button>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
};
