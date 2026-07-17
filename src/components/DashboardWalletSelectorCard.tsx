import React, { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useNavigate } from "react-router-dom";
import { TrendingUp, TrendingDown, ChevronRight, Eye, EyeOff, Wallet as WalletIcon, Plus, Send, History } from "lucide-react";
import { useLanguage } from "../contexts/LanguageContext";
import { useWallets } from "../hooks/useWallets";
import { useThemeTokens } from "../hooks/useThemeTokens";
import { useBalanceVisibility, maskCurrency } from "../contexts/BalanceVisibilityContext";
import { audioFeedback } from "../lib/audio";
import { DropdownField, DropdownOption } from "./DropdownField";
import { matchProvider, NEUTRAL_PROVIDER_COLOR } from "../data/walletProviders";
import { walletDisplayLabel } from "../lib/walletLabel";
import { Transaction, WalletWithBalance } from "../types";
import { WalletTopUpModal } from "./WalletTopUpModal";
import { WalletTransferModal } from "./WalletTransferModal";

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
  /**
   * Dipanggil setiap kali Top Up Saldo atau Transfer Saldo (lihat
   * WalletTopUpModal / WalletTransferModal) berhasil menyimpan transaksi
   * baru -- membubble ke Dashboard.tsx -> App.tsx `handleTransactionChange`,
   * supaya `transactionsUpdatedTrigger` global naik dan SELURUH bagian
   * dashboard (ringkasan bulan ini, riwayat transaksi terbaru, saldo pos
   * lain) ikut refresh, bukan cuma kartu ini. Tanpa ini, transaksi baru
   * dari 2 aksi ini akan "hilang" dari tampilan lain sampai user reload.
   */
  onTransactionAdded?: () => void;
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
  onTransactionAdded,
}) => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { activeWallets, generalWallet, isLoading, refresh } = useWallets();
  const { tokens, cx, theme } = useThemeTokens();
  const { visible: balanceVisible, toggle: toggleBalanceVisible } = useBalanceVisibility();
  const [selectedId, setSelectedId] = useState<string>("");
  const [contactVisible, setContactVisible] = useState(false);
  const [isTopUpOpen, setIsTopUpOpen] = useState(false);
  const [isTransferOpen, setIsTransferOpen] = useState(false);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (refreshTrigger !== undefined) refresh({ silent: true }); }, [refreshTrigger]);

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

  // Normalisasi & label dropdown pos sekarang datang dari helper bersama
  // di lib/walletLabel.ts (lihat komentar di sana) -- supaya konsisten
  // dengan WalletTransferModal.tsx dan tidak drift lagi.

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
            <>
              {/* Lapisan dasar solid bertema (putih di light_sakura, slate
                  gelap di dark_obsidian) -- WAJIB ada di bawah gradient tint
                  transparan di bawah ini. Tanpa lapisan ini, kartu cuma
                  mengandalkan warna apa pun yang kebetulan ada DI BELAKANG-
                  nya (lewat backdrop-blur + gradient tipis yang berakhir
                  "transparent"), yang menyebabkan kartu terlihat gelap
                  walau tema aktif adalah Light Sakura. */}
              <div className={cx("absolute inset-0", tokens.surface.card)} />
              <div className="absolute inset-0 backdrop-blur-xl" style={backgroundStyle} />
            </>
          )}

          <div className="relative z-10 p-5 sm:p-6 space-y-5">
            {/* Header: label "Saldo Anda" + toggle mata (menggantikan posisi
                caption tipe pos "Saldo Umum"/"Dompet E-Wallet"/dst yang
                dihapus -- info tipe pos itu sudah cukup terwakili lewat
                dropdown/nama pos di sisi kanan, jadi tidak perlu baris
                terpisah lagi) + dropdown pemilih pos di kanan. */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-1.5 min-w-0">
                <p className={cx("font-sans text-[10px] uppercase tracking-wider font-bold truncate", mutedTextClass)}>
                  {t("wallet.your_balance")}
                </p>
                <button
                  type="button"
                  onClick={() => { audioFeedback.playClick(); toggleBalanceVisible(); }}
                  aria-pressed={!balanceVisible}
                  aria-label={balanceVisible ? t("common.hide_balance") : t("common.show_balance")}
                  className={cx(
                    "shrink-0 p-1 -m-1 rounded-md cursor-pointer transition-colors",
                    hasLogoBg ? "text-white/70 hover:text-white" : cx(mutedTextClass, "hover:text-indigo-400 light_sakura:hover:text-rose-500")
                  )}
                >
                  {balanceVisible ? <Eye size={12} /> : <EyeOff size={12} />}
                </button>
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

            {/* Nominal saldo pos terpilih -- label & toggle mata sudah
                dipindah ke baris header di atas, jadi di sini cuma angka
                besarnya saja. */}
            <div>
              <p className={cx("font-sans font-black text-3xl tabular-nums leading-tight drop-shadow-sm", primaryTextClass)}>
                {balanceVisible ? formatIDR(selectedWallet.balance) : maskCurrency(formatIDR(selectedWallet.balance))}
              </p>
              {contactValue && (
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
              )}
            </div>

            {/* Pemasukan & Pengeluaran bulan ini khusus pos ini -- masing-
                masing sekarang jadi kotak terpisah (bukan satu kotak yang
                dibagi 2 kolom), supaya kedua angka lebih jelas sebagai dua
                metrik berbeda. */}
            <div className="grid grid-cols-2 gap-2.5">
              <div
                className={cx(
                  "flex items-center gap-2 min-w-0 rounded-2xl border p-3",
                  hasLogoBg ? "border-white/10 bg-black/20" : cx("border-slate-800/60 light_sakura:border-rose-100/60", tokens.surface.sunken)
                )}
              >
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
              <div
                className={cx(
                  "flex items-center gap-2 min-w-0 rounded-2xl border p-3",
                  hasLogoBg ? "border-white/10 bg-black/20" : cx("border-slate-800/60 light_sakura:border-rose-100/60", tokens.surface.sunken)
                )}
              >
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

            <div className="flex items-center justify-between gap-2 pt-0.5">
              <button
                type="button"
                onClick={() => {
                  audioFeedback.playClick();
                  navigate("/transactions", { state: { filterWalletId: selectedWallet.id } });
                }}
                aria-label={t("wallet.action_history")}
                className={cx(
                  "flex flex-col items-center gap-1 px-3 py-2 rounded-xl cursor-pointer transition-colors",
                  hasLogoBg ? "bg-black/20 text-white/85 hover:bg-black/30" : cx("border border-slate-800/60 light_sakura:border-rose-100/60 hover:border-indigo-400/50 light_sakura:hover:border-rose-300", tokens.surface.sunken, mutedTextClass)
                )}
              >
                <History size={16} />
                <span className="text-[10px] font-semibold leading-none whitespace-nowrap">{t("wallet.action_history_short")}</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => { audioFeedback.playClick(); setIsTopUpOpen(true); }}
                  aria-label={t("wallet.action_topup")}
                  className="flex flex-col items-center gap-1 px-3 py-2 rounded-xl cursor-pointer bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 transition-colors"
                >
                  <Plus size={16} />
                  <span className="text-[10px] font-semibold leading-none whitespace-nowrap">{t("wallet.action_topup_short")}</span>
                </button>
                <button
                  type="button"
                  onClick={() => { audioFeedback.playClick(); setIsTransferOpen(true); }}
                  aria-label={t("wallet.action_transfer")}
                  className={cx(
                    "flex flex-col items-center gap-1 px-3 py-2 rounded-xl cursor-pointer transition-colors bg-indigo-500/15 hover:bg-indigo-500/25 light_sakura:bg-rose-500/15 light_sakura:hover:bg-rose-500/25",
                    tokens.icon.accent
                  )}
                >
                  <Send size={15} />
                  <span className="text-[10px] font-semibold leading-none whitespace-nowrap">{t("wallet.action_transfer_short")}</span>
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>

      <WalletTopUpModal
        isOpen={isTopUpOpen}
        wallet={selectedWallet}
        formatIDR={formatIDR}
        onClose={() => setIsTopUpOpen(false)}
        onSuccess={() => {
          // JANGAN tutup dialog di sini -- WalletTopUpModal sendiri yang
          // menampilkan layar "Top up berhasil!" begitu status jadi
          // "success", dan baru tertutup saat user menekan tombol Selesai
          // (yang memanggil onClose di atas). Kalau ditutup dari sini,
          // dialog langsung hilang sebelum sempat menampilkan layar sukses.
          //
          // refresh({ silent: true }) -- BUKAN refresh() biasa -- supaya
          // `isLoading` di useWallets() tidak sempat balik true, yang kalau
          // terjadi akan membuat komponen ini return early (skeleton) dan
          // meng-unmount WalletTopUpModal di tengah jalan, menghapus state
          // "success" internalnya sebelum sempat terlihat oleh user.
          refresh({ silent: true });
          onTransactionAdded?.();
        }}
      />

      <WalletTransferModal
        isOpen={isTransferOpen}
        sourceWallet={selectedWallet}
        wallets={activeWallets}
        formatIDR={formatIDR}
        onClose={() => setIsTransferOpen(false)}
        onSuccess={() => {
          // Sama seperti WalletTopUpModal di atas -- biarkan dialog tetap
          // terbuka menampilkan layar sukses/gagal miliknya sendiri, dan
          // pakai refresh silent agar tidak memicu unmount di tengah jalan.
          refresh({ silent: true });
          onTransactionAdded?.();
        }}
      />
    </div>
  );
};
