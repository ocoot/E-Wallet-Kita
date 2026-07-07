import React, { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Wallet, TrendingUp, TrendingDown, Layers, PiggyBank, Vault } from "lucide-react";
import { useLanguage } from "../contexts/LanguageContext";
import { useAuth } from "../contexts/AuthContext";
import { dbService } from "../lib/db";
import { AccumulatedBalance, SavingsSummary } from "../types";
import { InfoTooltip } from "./InfoTooltip";

interface DashboardAccumulatedBalanceProps {
  /** Berubah setiap kali ada transaksi baru/diubah, dipakai untuk trigger refetch. */
  refreshTrigger: number;
  formatIDR: (num: number) => string;
}

/**
 * Menampilkan saldo yang SUDAH TERAKUMULASI dari seluruh bulan sebelumnya
 * hingga bulan berjalan (bukan cuma saldo bulan ini seperti di
 * DashboardStats). Dihitung lewat RPC get_accumulated_balance (SUM agregat
 * di server) supaya user langsung tahu "total uang saya sebenarnya berapa"
 * tanpa harus menjumlahkan manual dari riwayat.
 *
 * Sejak fitur Tabungan (savings pockets) ada, angka ini juga dipecah jadi:
 * - Total Kekayaan (accumulated balance, TIDAK berubah saat dana dipindah
 *   ke/dari pocket -- itu murni reklasifikasi internal, bukan pengeluaran).
 * - Saldo Tersedia = Total Kekayaan - Total Tabungan (yang benar-benar
 *   bebas dibelanjakan).
 * - Total Tabungan = jumlah semua pocket aktif (dari get_savings_summary).
 * Breakdown hanya ditampilkan kalau user punya minimal 1 pocket aktif,
 * supaya tidak menambah noise buat user yang belum pakai fitur Tabungan.
 */
export const DashboardAccumulatedBalance: React.FC<DashboardAccumulatedBalanceProps> = ({
  refreshTrigger,
  formatIDR
}) => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [data, setData] = useState<AccumulatedBalance | null>(null);
  const [savings, setSavings] = useState<SavingsSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      dbService.getAccumulatedBalance(),
      dbService.getSavingsSummary().catch(() => ({ total_saved: 0, pocket_count: 0 }))
    ])
      .then(([balanceRes, savingsRes]) => {
        if (cancelled) return;
        setData(balanceRes);
        setSavings(savingsRes);
      })
      .catch(err => console.error("DashboardAccumulatedBalance error:", err))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [user?.id, refreshTrigger]);

  if (loading && !data) {
    return (
      <div className="rounded-3xl border border-slate-800/60 bg-slate-900 light_sakura:bg-white light_sakura:border-rose-100/40 p-6 h-[104px] animate-pulse" />
    );
  }

  if (!data || (data.income_total === 0 && data.expense_total === 0)) {
    return null; // Belum ada transaksi sama sekali -- tidak perlu tampilkan kartu kosong
  }

  const isPositive = data.balance >= 0;
  const hasSavings = !!savings && savings.pocket_count > 0;
  const availableBalance = hasSavings ? data.balance - savings!.total_saved : data.balance;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-3xl border border-indigo-500/20 bg-gradient-to-br from-indigo-500/10 via-slate-900 to-slate-900 shadow-xl shadow-indigo-900/10 light_sakura:from-rose-100/60 light_sakura:via-white light_sakura:to-white light_sakura:border-rose-200/50"
    >
      <div className="p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-indigo-500/15 flex items-center justify-center text-indigo-400 shrink-0 light_sakura:bg-rose-500/15 light_sakura:text-rose-500">
            <Layers size={20} />
          </div>
          <div>
            <p className="text-[clamp(0.6188rem,2.86vw,0.6875rem)] font-bold uppercase tracking-wider text-slate-400 light_sakura:text-slate-500 flex items-center gap-1.5">
              {t("dashboard.accumulated_balance_label")}
              <InfoTooltip text={t("dashboard.accumulated_balance_tooltip")} align="left" />
            </p>
            <p className={`font-sans font-bold text-2xl sm:text-3xl tracking-tight ${isPositive ? "text-white light_sakura:text-slate-900" : "text-red-400"}`}>
              {formatIDR(data.balance)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 sm:ml-auto sm:pl-6 sm:border-l sm:border-slate-800/60 light_sakura:sm:border-rose-100">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400 shrink-0">
              <TrendingUp size={13} />
            </div>
            <div>
              <p className="text-[clamp(0.5625rem,2.6vw,0.625rem)] text-slate-500 uppercase font-semibold">{t("dashboard.accumulated_income_label")}</p>
              <p className="text-xs font-bold text-slate-200 light_sakura:text-slate-700">{formatIDR(data.income_total)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-red-500/10 flex items-center justify-center text-red-400 shrink-0">
              <TrendingDown size={13} />
            </div>
            <div>
              <p className="text-[clamp(0.5625rem,2.6vw,0.625rem)] text-slate-500 uppercase font-semibold">{t("dashboard.accumulated_expense_label")}</p>
              <p className="text-xs font-bold text-slate-200 light_sakura:text-slate-700">{formatIDR(data.expense_total)}</p>
            </div>
          </div>
        </div>
      </div>

      {hasSavings && (
        <div className="px-5 sm:px-6 pb-4 -mt-1 flex flex-col sm:flex-row gap-3">
          <div className="flex-1 flex items-center gap-2.5 rounded-2xl border border-indigo-500/15 bg-indigo-500/5 px-4 py-2.5 light_sakura:bg-indigo-50/40 light_sakura:border-indigo-100">
            <div className="w-7 h-7 rounded-lg bg-indigo-500/15 flex items-center justify-center text-indigo-400 shrink-0">
              <Wallet size={13} />
            </div>
            <div className="min-w-0">
              <p className="text-[clamp(0.5625rem,2.6vw,0.625rem)] text-slate-500 uppercase font-semibold flex items-center gap-1">
                {t("dashboard.available_balance_label")}
                <InfoTooltip text={t("dashboard.available_balance_tooltip")} align="left" />
              </p>
              <p className="text-sm font-bold text-slate-100 light_sakura:text-slate-800 whitespace-nowrap tabular-nums tracking-tight">{formatIDR(availableBalance)}</p>
            </div>
          </div>
          <div className="flex-1 flex items-center gap-2.5 rounded-2xl border border-emerald-500/15 bg-emerald-500/5 px-4 py-2.5 light_sakura:bg-emerald-50/40 light_sakura:border-emerald-100">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/15 flex items-center justify-center text-emerald-400 shrink-0">
              <Vault size={13} />
            </div>
            <div className="min-w-0">
              <p className="text-[clamp(0.5625rem,2.6vw,0.625rem)] text-slate-500 uppercase font-semibold">{t("dashboard.total_savings_label")}</p>
              <p className="text-sm font-bold text-slate-100 light_sakura:text-slate-800 whitespace-nowrap tabular-nums tracking-tight">{formatIDR(savings!.total_saved)}</p>
            </div>
          </div>
        </div>
      )}

      <p className="px-5 sm:px-6 pb-4 -mt-1 text-[clamp(0.6188rem,2.86vw,0.6875rem)] text-slate-500 leading-relaxed">
        {hasSavings ? t("dashboard.savings_breakdown_hint") : t("dashboard.accumulated_balance_hint")}
      </p>
    </motion.div>
  );
};
