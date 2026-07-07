import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Wallet, TrendingUp, TrendingDown, Layers, Vault, Coins, ChevronDown } from "lucide-react";
import { useLanguage } from "../contexts/LanguageContext";
import { useAuth } from "../contexts/AuthContext";
import { dbService } from "../lib/db";
import { AccumulatedBalance, SavingsSummary, GoldHoldingsSummary } from "../types";
import { InfoTooltip } from "./InfoTooltip";
import { audioFeedback } from "../lib/audio";

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
  const [data, setData] = useState<AccumulatedBalance | null>(null);
  const [savings, setSavings] = useState<SavingsSummary | null>(null);
  const [gold, setGold] = useState<GoldHoldingsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [showDetails, setShowDetails] = useState(false);

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
    return (
      <div className="rounded-3xl border border-slate-800/60 bg-slate-900 light_sakura:bg-white light_sakura:border-rose-100/40 p-6 h-[280px] animate-pulse" />
    );
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

  const availableBalance = data.balance - savedAmount - goldCashLocked;
  const netWorth = data.balance + goldGainLoss;
  const isPositive = netWorth >= 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-3xl border border-indigo-500/20 bg-gradient-to-br from-indigo-500/10 via-slate-900 to-slate-900 shadow-xl shadow-indigo-900/10 light_sakura:from-rose-100/60 light_sakura:via-white light_sakura:to-white light_sakura:border-rose-200/50"
    >
      {/* Hero: Saldo Tersedia */}
      <div className="p-5 sm:p-6 pb-4">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-indigo-500/15 flex items-center justify-center text-indigo-400 shrink-0 light_sakura:bg-rose-500/15 light_sakura:text-rose-500">
            <Wallet size={20} />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 light_sakura:text-slate-500 flex items-center gap-1.5">
              {t("dashboard.available_balance_label")}
              <InfoTooltip text={t("dashboard.available_balance_tooltip")} align="left" />
            </p>
            <p className="font-sans font-bold text-2xl sm:text-3xl tracking-tight text-white light_sakura:text-slate-900">
              {formatIDR(availableBalance)}
            </p>
          </div>
        </div>

        {/* Total Kekayaan -- sekunder */}
        <div className="mt-3 flex items-center gap-1.5 pl-[3.4rem]">
          <Layers size={12} className="text-slate-500" />
          <span className="text-[11px] text-slate-500">{t("dashboard.accumulated_balance_label")}</span>
          <span className={`text-xs font-bold whitespace-nowrap tabular-nums ${isPositive ? "text-slate-300 light_sakura:text-slate-700" : "text-red-400"}`}>
            {formatIDR(netWorth)}
          </span>
          <InfoTooltip text={t("dashboard.net_worth_tooltip")} align="left" />
        </div>
      </div>

      {/* Strip Bulan Ini */}
      <div className="px-5 sm:px-6 pb-4">
        <div className="rounded-2xl border border-slate-800/60 bg-slate-950/30 light_sakura:bg-rose-50/20 light_sakura:border-rose-100/30 px-4 py-3 flex items-center justify-between gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 shrink-0">
            {t("dashboard.this_month")}
          </span>
          <div className="flex items-center gap-4 overflow-x-auto">
            <div className="flex items-center gap-1.5">
              <TrendingUp size={12} className="text-emerald-400 shrink-0" />
              <span className="text-xs font-bold text-emerald-400 whitespace-nowrap">{formatIDR(monthlySummary.income)}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <TrendingDown size={12} className="text-red-400 shrink-0" />
              <span className="text-xs font-bold text-red-400 whitespace-nowrap">{formatIDR(monthlySummary.expense)}</span>
            </div>
            <div className="flex items-center gap-1.5 pl-3 border-l border-slate-800 light_sakura:border-rose-100">
              <span className="text-[10px] text-slate-500 shrink-0">{t("dashboard.balance")}</span>
              <span className={`text-xs font-bold whitespace-nowrap ${monthlySummary.balance >= 0 ? "text-teal-400 light_sakura:text-rose-500" : "text-red-400"}`}>
                {formatIDR(monthlySummary.balance)}
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
            <span className="text-[11px] font-bold text-slate-400 group-hover:text-slate-300 light_sakura:text-slate-500 light_sakura:group-hover:text-slate-700 transition-colors">
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
                    <div className="flex items-center gap-2.5 rounded-2xl border border-emerald-500/15 bg-emerald-500/5 px-3.5 py-2.5 light_sakura:bg-emerald-50/40 light_sakura:border-emerald-100">
                      <div className="w-7 h-7 rounded-lg bg-emerald-500/15 flex items-center justify-center text-emerald-400 shrink-0">
                        <Vault size={13} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] text-slate-500 uppercase font-semibold">{t("dashboard.total_savings_label")}</p>
                        <p className="text-xs font-bold text-slate-100 light_sakura:text-slate-800 whitespace-nowrap tabular-nums tracking-tight">{formatIDR(savedAmount)}</p>
                      </div>
                    </div>
                  )}
                  {hasGold && (
                    <div className="flex items-center gap-2.5 rounded-2xl border border-amber-500/15 bg-amber-500/5 px-3.5 py-2.5 light_sakura:bg-amber-50/40 light_sakura:border-amber-100">
                      <div className="w-7 h-7 rounded-lg bg-amber-500/15 flex items-center justify-center text-amber-400 shrink-0">
                        <Coins size={13} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] text-slate-500 uppercase font-semibold flex items-center gap-1">
                          {t("dashboard.total_gold_label")}
                          <InfoTooltip text={t("dashboard.total_gold_tooltip")} align="right" />
                        </p>
                        <p className="text-xs font-bold text-slate-100 light_sakura:text-slate-800 whitespace-nowrap tabular-nums tracking-tight">{formatIDR(goldMarketValue)}</p>
                        <p className={`text-[9.5px] font-semibold ${goldGainLoss >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {goldGainLoss >= 0 ? "▲" : "▼"} {formatIDR(Math.abs(goldGainLoss))}
                        </p>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-2.5 rounded-2xl border border-slate-800/60 bg-slate-950/20 px-3.5 py-2.5 light_sakura:bg-slate-50 light_sakura:border-slate-200">
                    <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400 shrink-0">
                      <TrendingUp size={13} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] text-slate-500 uppercase font-semibold">{t("dashboard.accumulated_income_label")}</p>
                      <p className="text-xs font-bold text-slate-200 light_sakura:text-slate-700 whitespace-nowrap tabular-nums tracking-tight">{formatIDR(data.income_total)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5 rounded-2xl border border-slate-800/60 bg-slate-950/20 px-3.5 py-2.5 light_sakura:bg-slate-50 light_sakura:border-slate-200">
                    <div className="w-7 h-7 rounded-lg bg-red-500/10 flex items-center justify-center text-red-400 shrink-0">
                      <TrendingDown size={13} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] text-slate-500 uppercase font-semibold">{t("dashboard.accumulated_expense_label")}</p>
                      <p className="text-xs font-bold text-slate-200 light_sakura:text-slate-700 whitespace-nowrap tabular-nums tracking-tight">{formatIDR(data.expense_total)}</p>
                    </div>
                  </div>
                </div>
                {gold && gold.stale_pocket_count > 0 && (
                  <p className="text-[10.5px] text-amber-400/90 pb-2 leading-relaxed">{t("dashboard.gold_stale_note")}</p>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      <p className="px-5 sm:px-6 pb-4 -mt-1 text-[11px] text-slate-500 leading-relaxed">
        {hasAssets ? t("dashboard.savings_breakdown_hint") : t("dashboard.accumulated_balance_hint")}
      </p>
    </motion.div>
  );
};
