import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { useLanguage } from "../contexts/LanguageContext";
import { useToast } from "../contexts/ToastContext";
import { useAdmin } from "../hooks/useAdmin";
import { LoadingOverlay } from "../components/LoadingOverlay";
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

export const AdminPremiumMonitor: React.FC = () => {
  const { showToast } = useToast();
  const { t, locale } = useLanguage();
  const { isAdmin } = useAdmin();

  const [refreshing, setRefreshing] = useState(false);
  const [metrics, setMetrics] = useState<RevenueMetrics | null>(null);
  const [transactions, setTransactions] = useState<PremiumTransaction[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [pageSize, setPageSize] = useState<number | "all">(15);
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);

  const statusConfig = {
    SUCCESS:  { color: "text-emerald-600", bg: "bg-emerald-50", icon: CheckCircle, label: t("admin.status_success") },
    PENDING:  { color: "text-amber-600",   bg: "bg-amber-50", icon: Clock, label: t("admin.status_pending") },
    EXPIRED:  { color: "text-slate-600",   bg: "bg-slate-50", icon: XCircle, label: t("admin.status_expired") },
    FAILED:   { color: "text-red-600",     bg: "bg-red-50", icon: AlertCircle, label: t("admin.status_failed") },
  };

  const loadMetrics = useCallback(async () => {
    const { data, error } = await supabase.rpc("get_admin_revenue_metrics");
    if (error) { console.error(error); return; }
    setMetrics(data);
  }, []);

  const loadTransactions = useCallback(async () => {
    setLoading(true);
    try {
      const limitVal = pageSize === "all" ? 1000000 : pageSize;
      const offsetVal = pageSize === "all" ? 0 : page * pageSize;
      const [txRes, countRes] = await Promise.all([
        supabase.rpc("admin_get_premium_transactions", {
          p_limit: limitVal,
          p_offset: offsetVal,
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
  }, [page, pageSize, statusFilter, showToast, t]);

  useEffect(() => { setPage(0); }, [statusFilter, pageSize]);

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

  const totalPages = pageSize === "all" ? 1 : Math.ceil(totalCount / pageSize);

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

      {/* Header Wrapped in One Card Container */}
      <div className="bg-slate-900 light_sakura:bg-white p-6 md:p-8 rounded-3xl border border-slate-800 light_sakura:border-slate-100 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="font-bold text-xl text-white light_sakura:text-slate-800 flex items-center gap-2">
              <CreditCard className="text-amber-500" size={24} />
              {t("admin.premium_monitor_title")}
            </h2>
            <p className="text-sm text-slate-400 light_sakura:text-slate-500 mt-1">
              {t("admin.premium_monitor_desc")}
            </p>
          </div>
          <button
            onClick={async () => {
              setRefreshing(true);
              try {
                await Promise.all([loadMetrics(), loadTransactions()]);
                showToast(t("admin.refresh_success"), "success");
              } catch (err: any) {
                showToast(err.message || t("toast.error_general"), "error");
              } finally {
                setRefreshing(false);
              }
            }}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl bg-slate-800 light_sakura:bg-white border border-slate-700 light_sakura:border-slate-200 text-slate-300 light_sakura:text-slate-600 hover:bg-slate-750 light_sakura:hover:bg-slate-50 transition-colors cursor-pointer shrink-0"
          >
            <RefreshCw size={16} />
            {t("admin.refresh_data")}
          </button>
        </div>
      </div>

      {/* Revenue Metrics */}
      {metrics && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
          {[
            { label: t("admin.total_revenue"), val: formatIDR(metrics.totalRevenue), color: "text-amber-500 light_sakura:text-amber-600" },
            { label: t("admin.status_success"), val: metrics.successCount, color: "text-emerald-500 light_sakura:text-emerald-600" },
            { label: t("admin.status_pending"), val: metrics.pendingCount, color: "text-amber-500 light_sakura:text-amber-600" },
            { label: t("admin.status_expired"), val: metrics.expiredCount, color: "text-slate-400 light_sakura:text-slate-600" },
            { label: t("admin.status_failed"), val: metrics.failedCount, color: "text-red-500 light_sakura:text-red-600" },
            { label: t("admin.metrics.total"), val: metrics.totalTransactions, color: "text-slate-200 light_sakura:text-slate-800" },
          ].map((m, i) => (
            <div key={i} className="bg-slate-900 light_sakura:bg-white p-6 rounded-3xl border border-slate-800 light_sakura:border-slate-100 shadow-sm">
              <p className="text-sm font-medium text-slate-400 light_sakura:text-slate-500">{m.label}</p>
              <h3 className={`font-bold text-2xl mt-2 ${m.color}`}>
                {m.val}
              </h3>
            </div>
          ))}
        </div>
      )}

      {/* Filter */}
      <div className="flex items-center gap-2 p-2 bg-slate-800 light_sakura:bg-slate-50 rounded-2xl w-fit">
        {["all", "SUCCESS", "PENDING", "EXPIRED", "FAILED"].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all
              ${statusFilter === s
                ? "bg-slate-700 light_sakura:bg-white text-white light_sakura:text-indigo-600 shadow-sm"
                : "text-slate-400 light_sakura:text-slate-500 hover:text-slate-200 light_sakura:hover:text-slate-700"}`}
          >
            {s === "all" ? t("admin.status_all") : s}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-3xl border border-slate-800 light_sakura:border-slate-100 bg-slate-900 light_sakura:bg-white shadow-sm">
        {loading ? (
          <div className="py-16 flex items-center justify-center">
            <Clock className="animate-spin text-indigo-500" size={28} />
          </div>
        ) : transactions.length === 0 ? (
          <div className="py-16 text-center text-slate-500 text-sm">
            {t("admin.no_transactions_found")}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300 light_sakura:text-slate-600 min-w-[800px]">
              <thead className="bg-slate-800 light_sakura:bg-slate-50 text-slate-400 light_sakura:text-slate-500 uppercase text-xs">
                <tr>
                  <th className="px-6 py-4">{t("admin.user_col")}</th>
                  <th className="px-6 py-4">{t("admin.order_id")}</th>
                  <th className="px-6 py-4">{t("admin.amount_col")}</th>
                  <th className="px-6 py-4">{t("admin.status_col")}</th>
                  <th className="px-6 py-4">{t("admin.mode_col")}</th>
                  <th className="px-6 py-4">{t("admin.pay_time_col")}</th>
                  <th className="px-6 py-4">{t("admin.create_time_col")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 light_sakura:divide-slate-100">
                {transactions.map((tx) => {
                  const cfg = statusConfig[tx.status] || statusConfig.FAILED;
                  const StatusIcon = cfg.icon;
                  return (
                    <tr key={tx.id} className="hover:bg-slate-800/50 light_sakura:hover:bg-slate-50/50">
                      <td className="px-6 py-4">
                        <p className="font-semibold text-white light_sakura:text-slate-900">{tx.display_name || "—"}</p>
                        <p className="text-xs text-slate-400 light_sakura:text-slate-500">{tx.email || "—"}</p>
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-mono text-xs text-slate-400 light_sakura:text-slate-500">{tx.order_id}</span>
                      </td>
                      <td className="px-6 py-4">
                        <p className="font-semibold text-white light_sakura:text-slate-900">{formatIDR(tx.total_amount)}</p>
                        {tx.total_amount !== tx.amount && (
                          <p className="text-xs text-slate-400 light_sakura:text-slate-500">
                            base: {formatIDR(tx.amount)}
                          </p>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${cfg.bg.replace("bg-", "bg-opacity-20 bg-")} ${cfg.color}`}>
                          <StatusIcon size={14} />
                          {cfg.label}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${tx.is_sandbox ? "bg-purple-900/20 light_sakura:bg-purple-50 text-purple-300 light_sakura:text-purple-600" : "bg-teal-900/20 light_sakura:bg-teal-50 text-teal-300 light_sakura:text-teal-600"}`}>
                          {tx.is_sandbox ? t("admin.sandbox_badge") : t("admin.live_badge")}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-400 light_sakura:text-slate-500">{formatDate(tx.paid_at)}</td>
                      <td className="px-6 py-4 text-xs text-slate-400 light_sakura:text-slate-500">{formatDate(tx.created_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-2 mt-4 font-sans text-xs text-slate-400">
        {/* Page Size Selector */}
        <div className="flex items-center gap-2">
          <span>{locale === "id" ? "Baris per halaman:" : "Rows per page:"}</span>
          <select
            value={pageSize}
            onChange={(e) => {
              const val = e.target.value;
              setPageSize(val === "all" ? "all" : Number(val));
              setPage(0);
            }}
            className="bg-slate-800 border border-slate-700 text-slate-300 rounded px-2 py-1 text-xs light_sakura:bg-slate-50 light_sakura:border-rose-200 light_sakura:text-slate-850 focus:outline-none focus:ring-1 focus:ring-teal-500 cursor-pointer"
          >
            <option value={5}>5</option>
            <option value={10}>10</option>
            <option value={15}>15</option>
            <option value={20}>20</option>
            <option value="all">{locale === "id" ? "Semua" : "All"}</option>
          </select>
        </div>

        {/* Pagination Info & Buttons */}
        {pageSize !== "all" && totalCount > pageSize ? (
          <div className="flex items-center gap-4">
            <div>
              {page * pageSize + 1}–{Math.min((page + 1) * pageSize, totalCount)} dari {totalCount}
            </div>
            <div className="flex items-center gap-2">
              <button
                disabled={page === 0}
                onClick={() => setPage(p => p - 1)}
                className="p-2 rounded-xl bg-slate-850 light_sakura:bg-white border border-slate-800 light_sakura:border-slate-200 text-slate-300 light_sakura:text-slate-600 hover:bg-slate-800 light_sakura:hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
              >
                <ChevronLeft size={14} />
              </button>
              <span className="font-medium text-white light_sakura:text-slate-800">{page + 1} / {totalPages}</span>
              <button
                disabled={page + 1 >= totalPages}
                onClick={() => setPage(p => p + 1)}
                className="p-2 rounded-xl bg-slate-850 light_sakura:bg-white border border-slate-800 light_sakura:border-slate-200 text-slate-300 light_sakura:text-slate-600 hover:bg-slate-800 light_sakura:hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        ) : (
          <div className="text-slate-500 text-xs">
            {locale === "id" ? `Menampilkan semua ${totalCount} transaksi` : `Showing all ${totalCount} transactions`}
          </div>
        )}
      </div>
      
      <LoadingOverlay isOpen={refreshing || loading} message={t("admin.loading_data")} />
    </div>
  );
};
