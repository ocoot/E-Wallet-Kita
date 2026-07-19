import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { TrendingUp, TrendingDown, Layers, Vault, Coins, ChevronDown } from "lucide-react";
import { useLanguage } from "../contexts/LanguageContext";
import { useAuth } from "../contexts/AuthContext";
import { dbService } from "../lib/db";
import { AccumulatedBalance, SavingsSummary, GoldHoldingsSummary } from "../types";
import { InfoTooltip } from "./InfoTooltip";
import { audioFeedback } from "../lib/audio";
import { useBalanceVisibility, maskCurrency } from "../contexts/BalanceVisibilityContext";
import { Card } from "./ui/Card";
import { useThemeTokens } from "../hooks/useThemeTokens";

interface DashboardOverviewCardProps {
  /** Berubah setiap kali ada transaksi baru/diubah, dipakai untuk trigger refetch. */
  refreshTrigger: number;
  formatIDR: (num: number) => string;
  /** Ikhtisar bulan berjalan (dihitung di Dashboard.tsx dari transaksi bulan ini). */
  monthlySummary: { income: number; expense: number; balance: number };
}

/**
 * Kartu ringkasan keuangan TUNGGAL di Dashboard -- gabungan dari 2 komponen
 * lama (DashboardAccumulatedBalance + DashboardStats) yang sebelumnya
 * menampilkan total 8 angka Rupiah terpisah di 2 grup kartu berbeda,
 * terbukti membingungkan (lihat diskusi redesign sebelumnya).
 *
 * Prinsip desain:
 * 1. HERO = Saldo Tersedia (paling besar) -- ini angka yang paling sering
 *    dibutuhkan untuk keputusan sehari-hari ("bisa belanja berapa
 *    sekarang"), bukan Total Kekayaan yang abstrak.
 * 2. Total Kekayaan jadi baris sekunder (lebih kecil), dengan tooltip.
 * 3. "Bulan Ini" (pemasukan/pengeluaran/saldo bulan berjalan) jadi strip
 *    ringkas horizontal -- lensa berbeda dari akumulasi, tapi tidak perlu
 *    3 kartu besar terpisah.
 * 4. Rincian Aset (Tabungan, Emas, Total Pemasukan/Pengeluaran sepanjang
 *    waktu) disembunyikan di balik expand/collapse -- detail yang jarang
 *    dibutuhkan sekilas, tapi tetap satu tap untuk diakses.
 *
 * Akuntansi PENTING: Total Kekayaan TIDAK BOLEH cuma
 * accumulated_balance.balance (income-expense) lagi -- itu buta terhadap
 * untung/rugi emas (karena beli emas tidak pernah tercatat sebagai
 * transaksi expense, cuma memindahkan cash_locked_amount di gold_pockets).
 * Rumus yang benar:
 *   Total Kekayaan  = balance + (nilai_pasar_emas - cash_locked_emas)
 *                    = balance + gold.unrealized_gain_loss
 *   Saldo Tersedia   = balance - total_tabungan - cash_locked_emas
 * Lihat migration 20260803000000_gold_savings.sql untuk penjelasan
 * cash_locked_amount lebih lengkap.
 */
export const DashboardOverviewCard: React.FC<DashboardOverviewCardProps> = ({
  refreshTrigger,
  formatIDR,
  monthlySummary
}) => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { tokens, cx } = useThemeTokens();
  const [data, setData] = useState<AccumulatedBalance | null>(null);
  const [savings, setSavings] = useState<SavingsSummary | null>(null);
  const [gold, setGold] = useState<GoldHoldingsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [showDetails, setShowDetails] = useState(false);
  // Baca saja -- toggle mata TUNGGAL ada di DashboardHeader.
  const { visible: balanceVisible } = useBalanceVisibility();

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      dbService.getAccumulatedBalance(),
      dbService.getSavingsSummary().catch(() => ({ total_saved: 0, pocket_count: 0 })),
      dbService.getGoldHoldingsSummary().catch(() => ({
        total_grams: 0, total_cash_locked: 0, total_market_value: 0,
        unrealized_gain_loss: 0, pocket_count: 0, stale_pocket_count: 0
      }))
    ])
      .then(([balanceRes, savingsRes, goldRes]) => {
        if (cancelled) return;
        setData(balanceRes);
        setSavings(savingsRes);
        setGold(goldRes);
      })
      .catch(err => console.error("DashboardOverviewCard error:", err))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [user?.id, refreshTrigger]);

  if (loading && !data) {
    return <Card padding="lg" elevation="flat" className="h-[280px] animate-pulse" />;
  }

  if (!data || (data.income_total === 0 && data.expense_total === 0)) {
    return null; // Belum ada transaksi sama sekali -- tidak perlu tampilkan kartu kosong
  }

  const hasSavings = !!savings && savings.pocket_count > 0;
  const hasGold = !!gold && gold.pocket_count > 0;
  const hasAssets = hasSavings || hasGold;

  const savedAmount = savings?.total_saved ?? 0;
  const goldCashLocked = gold?.total_cash_locked ?? 0;
  const goldMarketValue = gold?.total_market_value ?? 0;
  const goldGainLoss = gold?.unrealized_gain_loss ?? 0;

  const netWorth = data.balance + goldGainLoss;
  const isPositive = netWorth >= 0;

  return (
    // NOTE: sengaja TIDAK memakai <Card> primitive di sini -- background-nya
    // gradient kustom (bg-gradient-to-br ...), bukan bg-slate-900 polos, dan
    // project ini tidak memakai tailwind-merge sehingga override background
    // lewat className tidak reliable (lihat catatan di Input.tsx/Card.tsx).
    // Memaksakan migrasi mekanis di sini berisiko menghilangkan gradient-nya.
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cx(
        "relative overflow-hidden rounded-3xl border shadow-xl",
        tokens.dashboardOverviewCard.heroCardGradient
      )}
    >
      {/* Total Kekayaan -- sekarang jadi angka utama kartu ini, karena
          "Saldo Tersedia" tunggal sudah dipindah jadi kartu-kartu Pos Dompet
          terpisah di Dashboard (lihat DashboardWalletCarousel.tsx). */}
      <div className="p-5 sm:p-6 pb-4">
        <div className="flex items-center gap-2 mb-4">
          <Layers size={14} className={tokens.icon.accent} />
          <h3 className={cx("text-xs font-bold uppercase tracking-wider", tokens.text.muted)}>
            {t("dashboard.overall_summary_label")}
          </h3>
        </div>
        <div className="flex items-center gap-3.5">
          <div className={cx(
            "w-11 h-11 rounded-2xl flex items-center justify-center shrink-0",
            tokens.chip.accentIndigo,
            tokens.icon.accent
          )}>
            <Layers size={20} />
          </div>
          <div className="min-w-0">
            <p className={cx("text-[clamp(0.6188rem,2.86vw,0.6875rem)] font-bold uppercase tracking-wider flex items-center gap-1.5", tokens.text.muted)}>
              {t("dashboard.accumulated_balance_label")}
              <InfoTooltip text={t("dashboard.net_worth_tooltip")} align="left" />
            </p>
            <p className={`font-mono tabular-nums font-bold text-2xl sm:text-3xl tracking-tight ${isPositive ? tokens.text.primary : "text-red-400"}`}>
              {balanceVisible ? formatIDR(netWorth) : maskCurrency(formatIDR(netWorth))}
            </p>
          </div>
        </div>
      </div>

      {/* Strip Bulan Ini */}
      <div className="px-5 sm:px-6 pb-4">
        <div className={cx(
          "rounded-2xl border px-4 py-3 flex items-center justify-between gap-2",
          tokens.surface.sunken,
          tokens.border.accent
        )}>
          <span className="text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold uppercase tracking-wider text-slate-500 shrink-0">
            {t("dashboard.this_month")}
          </span>
          <div className="flex items-center gap-4 overflow-x-auto scrollbar-hide">
            <div className="flex items-center gap-1.5">
              <TrendingUp size={12} className="text-emerald-400 shrink-0" />
              <span className="font-mono tabular-nums text-xs font-bold text-emerald-400 whitespace-nowrap">{balanceVisible ? formatIDR(monthlySummary.income) : maskCurrency(formatIDR(monthlySummary.income))}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <TrendingDown size={12} className="text-red-400 shrink-0" />
              <span className="font-mono tabular-nums text-xs font-bold text-red-400 whitespace-nowrap">{balanceVisible ? formatIDR(monthlySummary.expense) : maskCurrency(formatIDR(monthlySummary.expense))}</span>
            </div>
            <div className={cx("flex items-center gap-1.5 pl-3 border-l", tokens.border.accent)}>
              <span className="text-[clamp(0.5625rem,2.6vw,0.625rem)] text-slate-500 shrink-0">{t("dashboard.balance")}</span>
              <span className={`font-mono tabular-nums text-xs font-bold whitespace-nowrap ${monthlySummary.balance >= 0 ? tokens.text.success : "text-red-400"}`}>
                {balanceVisible ? formatIDR(monthlySummary.balance) : maskCurrency(formatIDR(monthlySummary.balance))}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Rincian Aset -- expand/collapse */}
      {hasAssets && (
        <div className="px-5 sm:px-6 pb-2">
          <button
            onClick={() => { audioFeedback.playClick(); setShowDetails(v => !v); }}
            className="w-full flex items-center justify-between py-2 cursor-pointer group"
          >
            <span className={cx("text-[clamp(0.6188rem,2.86vw,0.6875rem)] font-bold transition-colors", tokens.dashboardOverviewCard.labelHoverText, tokens.text.muted)}>
              {t("dashboard.asset_breakdown_label")}
            </span>
            <ChevronDown size={14} className={`text-slate-500 transition-transform ${showDetails ? "rotate-180" : ""}`} />
          </button>

          <AnimatePresence>
            {showDetails && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="grid grid-cols-2 gap-2.5 pb-3">
                  {hasSavings && (
                    <div className={cx("flex items-center gap-2.5 rounded-2xl px-3.5 py-2.5", tokens.dashboardOverviewCard.statChipEmerald)}>
                      <div className="w-7 h-7 rounded-lg bg-emerald-500/15 flex items-center justify-center text-emerald-400 shrink-0">
                        <Vault size={13} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[clamp(0.5625rem,2.6vw,0.625rem)] text-slate-500 uppercase font-semibold flex items-center gap-1">
                          {t("dashboard.total_savings_label")}
                          <InfoTooltip text={t("dashboard.earmarked_note_tooltip")} align="right" />
                        </p>
                        <p className={cx("font-mono text-xs font-bold whitespace-nowrap tabular-nums tracking-tight", tokens.text.primary)}>{balanceVisible ? formatIDR(savedAmount) : maskCurrency(formatIDR(savedAmount))}</p>
                      </div>
                    </div>
                  )}
                  {hasGold && (
                    <div className={cx("flex items-center gap-2.5 rounded-2xl px-3.5 py-2.5", tokens.dashboardOverviewCard.statChipAmber)}>
                      <div className="w-7 h-7 rounded-lg bg-amber-500/15 flex items-center justify-center text-amber-400 shrink-0">
                        <Coins size={13} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[clamp(0.5625rem,2.6vw,0.625rem)] text-slate-500 uppercase font-semibold flex items-center gap-1">
                          {t("dashboard.total_gold_label")}
                          <InfoTooltip text={t("dashboard.total_gold_tooltip")} align="right" />
                        </p>
                        <p className={cx("font-mono text-xs font-bold whitespace-nowrap tabular-nums tracking-tight", tokens.text.primary)}>{balanceVisible ? formatIDR(goldMarketValue) : maskCurrency(formatIDR(goldMarketValue))}</p>
                        <p className={`font-mono tabular-nums text-[clamp(0.5344rem,2.47vw,0.5938rem)] font-semibold ${goldGainLoss >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {goldGainLoss >= 0 ? "▲" : "▼"} {balanceVisible ? formatIDR(Math.abs(goldGainLoss)) : maskCurrency(formatIDR(Math.abs(goldGainLoss)))}
                        </p>
                      </div>
                    </div>
                  )}
                  <div className={cx("flex items-center gap-2.5 rounded-2xl border px-3.5 py-2.5", tokens.surface.sunken, tokens.border.accent)}>
                    <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400 shrink-0">
                      <TrendingUp size={13} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[clamp(0.5625rem,2.6vw,0.625rem)] text-slate-500 uppercase font-semibold">{t("dashboard.accumulated_income_label")}</p>
                      <p className={cx("font-mono text-xs font-bold whitespace-nowrap tabular-nums tracking-tight", tokens.text.primary)}>{balanceVisible ? formatIDR(data.income_total) : maskCurrency(formatIDR(data.income_total))}</p>
                    </div>
                  </div>
                  <div className={cx("flex items-center gap-2.5 rounded-2xl border px-3.5 py-2.5", tokens.surface.sunken, tokens.border.accent)}>
                    <div className="w-7 h-7 rounded-lg bg-red-500/10 flex items-center justify-center text-red-400 shrink-0">
                      <TrendingDown size={13} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[clamp(0.5625rem,2.6vw,0.625rem)] text-slate-500 uppercase font-semibold">{t("dashboard.accumulated_expense_label")}</p>
                      <p className={cx("font-mono text-xs font-bold whitespace-nowrap tabular-nums tracking-tight", tokens.text.primary)}>{balanceVisible ? formatIDR(data.expense_total) : maskCurrency(formatIDR(data.expense_total))}</p>
                    </div>
                  </div>
                </div>
                {gold && gold.stale_pocket_count > 0 && (
                  <p className="text-[clamp(0.5906rem,2.73vw,0.6562rem)] text-amber-400/90 pb-2 leading-relaxed">{t("dashboard.gold_stale_note")}</p>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      <p className="px-5 sm:px-6 pb-4 -mt-1 text-[clamp(0.6188rem,2.86vw,0.6875rem)] text-slate-500 leading-relaxed">
        {t("dashboard.accumulated_balance_hint")}
      </p>
    </motion.div>
  );
};
