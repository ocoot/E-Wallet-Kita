import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { useLanguage } from "../contexts/LanguageContext";
import { useToast } from "../contexts/ToastContext";
import { useAdmin } from "../hooks/useAdmin";
import {
  CreditCard, CheckCircle, Clock, XCircle, AlertCircle,
  TrendingUp, RefreshCw, ChevronLeft, ChevronRight
} from "lucide-react";

interface RevenueMetrics {
  totalRevenue: number;
  totalTransactions: number;
  successCount: number;
  pendingCount: number;
  expiredCount: number;
  failedCount: number;
}

interface PremiumTransaction {
  id: string;
  user_id: string;
  display_name: string;
  email: string;
  order_id: string;
  amount: number;
  total_amount: number;
  status: "PENDING" | "SUCCESS" | "EXPIRED" | "FAILED";
  is_sandbox: boolean;
  paid_at: string | null;
  expired_at: string | null;
  created_at: string;
}

const PAGE_SIZE = 15;

export const AdminPremiumMonitor: React.FC = () => {
  const { showToast } = useToast();
  const { t, locale } = useLanguage();
  const { isAdmin } = useAdmin();

  const [metrics, setMetrics] = useState<RevenueMetrics | null>(null);
  const [transactions, setTransactions] = useState<PremiumTransaction[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);

  const statusConfig = {
    SUCCESS:  { color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/30", icon: CheckCircle, label: t("admin.status_success") },
    PENDING:  { color: "text-amber-400",   bg: "bg-amber-500/10 border-amber-500/30",   icon: Clock, label: t("admin.status_pending") },
    EXPIRED:  { color: "text-slate-400",   bg: "bg-slate-500/10 border-slate-500/30",   icon: XCircle, label: t("admin.status_expired") },
    FAILED:   { color: "text-red-400",     bg: "bg-red-500/10 border-red-500/30",       icon: AlertCircle, label: t("admin.status_failed") },
  };

  const loadMetrics = useCallback(async () => {
    const { data, error } = await supabase.rpc("get_admin_revenue_metrics");
    if (error) { console.error(error); return; }
    setMetrics(data);
  }, []);

  const loadTransactions = useCallback(async () => {
    setLoading(true);
    try {
      const [txRes, countRes] = await Promise.all([
        supabase.rpc("admin_get_premium_transactions", {
          p_limit: PAGE_SIZE,
          p_offset: page * PAGE_SIZE,
          p_status: statusFilter
        }),
        supabase.rpc("admin_count_premium_transactions", { p_status: statusFilter })
      ]);

      if (txRes.error) throw txRes.error;
      if (countRes.error) throw countRes.error;

      setTransactions(txRes.data || []);
      setTotalCount(countRes.data || 0);
    } catch (err: any) {
      showToast(err.message || t("toast.error_general"), "error");
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, showToast, t]);

  useEffect(() => { setPage(0); }, [statusFilter]);

  useEffect(() => {
    if (isAdmin) {
      loadMetrics();
    }
  }, [loadMetrics, isAdmin]);

  useEffect(() => {
    if (isAdmin) {
      loadTransactions();
    }
  }, [loadTransactions, isAdmin]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const formatIDR = (amount: number) => {
    return new Intl.NumberFormat(locale === "id" ? "id-ID" : "en-US", {
      style: "currency", currency: "IDR", maximumFractionDigits: 0
    }).format(amount);
  };

  const formatDate = (iso: string | null) => {
    if (!iso) return "-";
    return new Date(iso).toLocaleString(locale === "id" ? "id-ID" : "en-US", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit"
    });
  };

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-sans font-black text-lg text-white flex items-center gap-2">
            <CreditCard className="text-amber-400" size={20} />
            {t("admin.premium_monitor_title")}
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {t("admin.premium_monitor_desc")}
          </p>
        </div>
        <button
          onClick={() => { loadMetrics(); loadTransactions(); }}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl border border-slate-800 hover:bg-slate-900 text-slate-300 cursor-pointer transition-colors"
        >
          <RefreshCw size={12} />
          {t("admin.refresh_data")}
        </button>
      </div>

      {/* Revenue Metrics */}
      {metrics && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
            <p className="text-[10px] font-black uppercase tracking-wider text-amber-400/80 flex items-center gap-1">
              <TrendingUp size={10} /> {t("admin.total_revenue")}
            </p>
            <h3 className="font-black text-xl text-amber-400 mt-1">
              {formatIDR(metrics.totalRevenue)}
            </h3>
            <p className="text-[10px] text-amber-400/60 mt-0.5">
              dari {metrics.successCount} {t("admin.success_transactions")}
            </p>
          </div>
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
            <p className="text-[10px] font-black uppercase tracking-wider text-emerald-400/80">✅ {t("admin.status_success")}</p>
            <h3 className="font-black text-xl text-emerald-400 mt-1">{metrics.successCount}</h3>
          </div>
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
            <p className="text-[10px] font-black uppercase tracking-wider text-amber-400/80">⏳ {t("admin.status_pending")}</p>
            <h3 className="font-black text-xl text-amber-400 mt-1">{metrics.pendingCount}</h3>
          </div>
          <div className="rounded-2xl border border-slate-700 bg-slate-800/30 p-4">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">⌛ {t("admin.status_expired")}</p>
            <h3 className="font-black text-xl text-slate-400 mt-1">{metrics.expiredCount}</h3>
          </div>
          <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-4">
            <p className="text-[10px] font-black uppercase tracking-wider text-red-400/80">❌ {t("admin.status_failed")}</p>
            <h3 className="font-black text-xl text-red-400 mt-1">{metrics.failedCount}</h3>
          </div>
          <div className="rounded-2xl border border-slate-700 bg-slate-800/30 p-4">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">📊 {t("admin.metrics.total")}</p>
            <h3 className="font-black text-xl text-slate-300 mt-1">{metrics.totalTransactions}</h3>
          </div>
        </div>
      )}

      {/* Filter */}
      <div className="flex items-center gap-3">
        {["all", "SUCCESS", "PENDING", "EXPIRED", "FAILED"].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider border transition-all cursor-pointer
              ${statusFilter === s
                ? "bg-teal-500/20 border-teal-500/40 text-teal-400"
                : "bg-slate-900 border-slate-800 text-slate-500 hover:text-slate-300"}`}
          >
            {s === "all" ? t("admin.status_all") : s}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/40">
        {loading ? (
          <div className="py-16 flex items-center justify-center">
            <Clock className="animate-spin text-teal-400" size={28} />
          </div>
        ) : transactions.length === 0 ? (
          <div className="py-16 text-center text-slate-500 text-sm">
            {t("admin.no_transactions_found")}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900/60 text-[10px] font-black text-slate-400 uppercase tracking-wider">
                  <th className="px-4 py-3">{t("admin.user_col")}</th>
                  <th className="px-4 py-3">{t("admin.order_id")}</th>
                  <th className="px-4 py-3">{t("admin.amount_col")}</th>
                  <th className="px-4 py-3">{t("admin.status_col")}</th>
                  <th className="px-4 py-3">{t("admin.mode_col")}</th>
                  <th className="px-4 py-3">{t("admin.pay_time_col")}</th>
                  <th className="px-4 py-3">{t("admin.create_time_col")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {transactions.map((tx) => {
                  const cfg = statusConfig[tx.status] || statusConfig.FAILED;
                  const StatusIcon = cfg.icon;
                  return (
                    <tr key={tx.id} className="hover:bg-slate-900/20 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-bold text-xs text-slate-200">{tx.display_name || "—"}</p>
                        <p className="text-[10px] text-slate-500">{tx.email || "—"}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-[10px] text-slate-400">{tx.order_id}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-bold text-slate-200">{formatIDR(tx.total_amount)}</span>
                        {tx.total_amount !== tx.amount && (
                          <p className="text-[10px] text-slate-500">
                            base: {formatIDR(tx.amount)}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-black uppercase border ${cfg.bg} ${cfg.color}`}>
                          <StatusIcon size={9} />
                          {cfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {tx.is_sandbox ? (
                          <span className="px-2 py-1 rounded-lg text-[9px] font-black bg-purple-500/10 border border-purple-500/30 text-purple-400 uppercase">
                            {t("admin.sandbox_badge")}
                          </span>
                        ) : (
                          <span className="px-2 py-1 rounded-lg text-[9px] font-black bg-teal-500/10 border border-teal-500/30 text-teal-400 uppercase">
                            {t("admin.live_badge")}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[10px] text-slate-400">{formatDate(tx.paid_at)}</td>
                      <td className="px-4 py-3 text-[10px] text-slate-400">{formatDate(tx.created_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>
            {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalCount)} dari {totalCount}
          </span>
          <div className="flex items-center gap-2">
            <button
              disabled={page === 0}
              onClick={() => setPage(p => p - 1)}
              className="p-1.5 rounded-lg border border-slate-800 hover:bg-slate-900 disabled:opacity-30 cursor-pointer"
            >
              <ChevronLeft size={14} />
            </button>
            <span>{page + 1} / {totalPages}</span>
            <button
              disabled={page + 1 >= totalPages}
              onClick={() => setPage(p => p + 1)}
              className="p-1.5 rounded-lg border border-slate-800 hover:bg-slate-900 disabled:opacity-30 cursor-pointer"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
