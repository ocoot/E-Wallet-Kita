import React, { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Wallet, TrendingUp, TrendingDown, Layers } from "lucide-react";
import { useLanguage } from "../contexts/LanguageContext";
import { useAuth } from "../contexts/AuthContext";
import { dbService } from "../lib/db";
import { AccumulatedBalance } from "../types";

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
 */
export const DashboardAccumulatedBalance: React.FC<DashboardAccumulatedBalanceProps> = ({
  refreshTrigger,
  formatIDR
}) => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [data, setData] = useState<AccumulatedBalance | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    setLoading(true);
    dbService.getAccumulatedBalance()
      .then(res => { if (!cancelled) setData(res); })
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
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 light_sakura:text-slate-500">
              {t("dashboard.accumulated_balance_label")}
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
              <p className="text-[10px] text-slate-500 uppercase font-semibold">{t("dashboard.accumulated_income_label")}</p>
              <p className="text-xs font-bold text-slate-200 light_sakura:text-slate-700">{formatIDR(data.income_total)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-red-500/10 flex items-center justify-center text-red-400 shrink-0">
              <TrendingDown size={13} />
            </div>
            <div>
              <p className="text-[10px] text-slate-500 uppercase font-semibold">{t("dashboard.accumulated_expense_label")}</p>
              <p className="text-xs font-bold text-slate-200 light_sakura:text-slate-700">{formatIDR(data.expense_total)}</p>
            </div>
          </div>
        </div>
      </div>
      <p className="px-5 sm:px-6 pb-4 -mt-1 text-[11px] text-slate-500 leading-relaxed">
        {t("dashboard.accumulated_balance_hint")}
      </p>
    </motion.div>
  );
};
