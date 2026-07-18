import React, { useState, useEffect, useCallback } from "react";
import { AdminBackBar } from "../components/AdminBackBar";
import { supabase } from "../lib/supabase";
import { useLanguage } from "../contexts/LanguageContext";
import { useToast } from "../contexts/ToastContext";
import { useThemeTokens } from "../hooks/useThemeTokens";
import { useAdmin } from "../hooks/useAdmin";
import { LoadingOverlay } from "../components/LoadingOverlay";
import { Modal } from "../components/Modal";
import { ScrollableTableWrapper } from "../components/ScrollableTableWrapper";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { DropdownField } from "../components/DropdownField";
import {
  CreditCard, CheckCircle, Clock, XCircle, AlertCircle,
  TrendingUp, RefreshCw, ChevronLeft, ChevronRight, FlaskConical, AlertTriangle
} from "lucide-react";

interface RevenueMetrics {
  totalRevenue: number;
  totalTransactions: number;
  successCount: number;
  pendingCount: number;
  expiredCount: number;
  failedCount: number;
  sandboxCount: number;
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
  const { tokens, cx } = useThemeTokens();

  const [refreshing, setRefreshing] = useState(false);
  const [metrics, setMetrics] = useState<RevenueMetrics | null>(null);
  const [transactions, setTransactions] = useState<PremiumTransaction[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [pageSize, setPageSize] = useState<number | "all">(15);
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [transactionsError, setTransactionsError] = useState(false);

  // --- Dummy QRIS toggle (app_settings: dummy_qris_enabled) ---
  const [dummyQrisEnabled, setDummyQrisEnabled] = useState(false);
  const [dummyQrisLoaded, setDummyQrisLoaded] = useState(false);
  const [savingDummyQris, setSavingDummyQris] = useState(false);
  const [pendingDummyQrisValue, setPendingDummyQrisValue] = useState<boolean | null>(null);

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

  const loadDummyQrisSetting = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "dummy_qris_enabled")
        .single();
      if (error) throw error;
      setDummyQrisEnabled(data?.value === "true");
    } catch (err: any) {
      console.error("Gagal memuat status dummy_qris_enabled:", err.message || err);
    } finally {
      setDummyQrisLoaded(true);
    }
  }, []);

  const requestToggleDummyQris = (nextValue: boolean) => {
    setPendingDummyQrisValue(nextValue);
  };

  const confirmToggleDummyQris = async () => {
    if (pendingDummyQrisValue === null) return;
    const nextValue = pendingDummyQrisValue;
    setSavingDummyQris(true);
    try {
      const { error } = await supabase
        .from("app_settings")
        .update({ value: nextValue ? "true" : "false" })
        .eq("key", "dummy_qris_enabled");
      if (error) throw error;
      setDummyQrisEnabled(nextValue);
      showToast(t("admin.dummy_qris_update_success"), "success");
    } catch (err: any) {
      showToast(err.message || t("toast.error_general"), "error");
    } finally {
      setSavingDummyQris(false);
      setPendingDummyQrisValue(null);
    }
  };

  const cancelToggleDummyQris = () => setPendingDummyQrisValue(null);

  const loadTransactions = useCallback(async () => {
    setLoading(true);
    setTransactionsError(false);
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
      setTransactionsError(true);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, statusFilter, showToast, t]);

  useEffect(() => { setPage(0); }, [statusFilter, pageSize]);

  useEffect(() => {
    if (isAdmin) {
      loadMetrics();
      loadDummyQrisSetting();
    }
  }, [loadMetrics, loadDummyQrisSetting, isAdmin]);

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

      <AdminBackBar />

      {/* Header Wrapped in One Card Container */}
      <div className={cx("p-6 md:p-8 rounded-3xl border shadow-sm", tokens.surface.card, tokens.border.default)}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className={cx("font-sans font-bold text-2xl tracking-tight flex items-center gap-2", tokens.text.primary)}>
              <CreditCard className="text-amber-500" size={24} />
              {t("admin.premium_monitor_title")}
            </h1>
            <p className={cx("text-sm mt-1", tokens.text.muted)}>
              {t("admin.premium_monitor_desc")}
            </p>
          </div>
          <button
            onClick={async () => {
              setRefreshing(true);
              try {
                await Promise.all([loadMetrics(), loadTransactions(), loadDummyQrisSetting()]);
                showToast(t("admin.refresh_success"), "success");
              } catch (err: any) {
                showToast(err.message || t("toast.error_general"), "error");
              } finally {
                setRefreshing(false);
              }
            }}
            className={cx("flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl bg-slate-800 light_sakura:bg-white border hover:bg-slate-700 light_sakura:hover:bg-slate-50 transition-colors cursor-pointer shrink-0", tokens.text.label, tokens.border.strong)}
          >
            <RefreshCw size={16} />
            {t("admin.refresh_data")}
          </button>
        </div>
      </div>

      {/* Dummy QRIS active warning banner */}
      {dummyQrisLoaded && dummyQrisEnabled && (
        <div className="flex items-center gap-3 px-5 py-4 rounded-2xl border border-amber-500/40 bg-amber-500/10 text-amber-300 light_sakura:bg-amber-50 light_sakura:border-amber-200 light_sakura:text-amber-700 text-sm font-medium">
          <AlertTriangle size={18} className="shrink-0" />
          <span>{t("admin.dummy_qris_active_warning")}</span>
        </div>
      )}

      {/* Dummy QRIS toggle card */}
      <div className={cx("p-6 md:p-8 rounded-3xl border shadow-sm", tokens.surface.card, tokens.border.default)}>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className={`p-3 rounded-2xl border ${dummyQrisEnabled ? cx("border-purple-800/50 light_sakura:border-purple-100", tokens.adminPremium.sandboxBadgeBg, tokens.adminPremium.sandboxText) : cx(tokens.toggle.inactiveIconBorder, tokens.surface.subtle)}`}>
              <FlaskConical size={20} />
            </div>
            <div>
              <p className={cx("font-semibold", tokens.text.primary)}>
                {t("admin.dummy_qris_title")}
              </p>
              <p className={cx("text-xs mt-0.5 max-w-md", tokens.text.muted)}>
                {t("admin.dummy_qris_desc")}
              </p>
              <p className={cx("text-xs mt-1.5 font-medium", tokens.adminPremium.sandboxText)}>
                {dummyQrisEnabled ? t("admin.dummy_qris_status_on") : t("admin.dummy_qris_status_off")}
              </p>
              {metrics && metrics.sandboxCount > 0 && (
                <p className="text-[clamp(0.6188rem,2.86vw,0.6875rem)] text-slate-500 mt-1">
                  {t("admin.dummy_qris_sandbox_count", { count: metrics.sandboxCount })}
                </p>
              )}
            </div>
          </div>

          {/* Switch */}
          <button
            disabled={!dummyQrisLoaded}
            onClick={() => requestToggleDummyQris(!dummyQrisEnabled)}
            className={`btn-exact relative w-14 h-7 rounded-full transition-colors cursor-pointer shrink-0 disabled:opacity-50
              ${dummyQrisEnabled ? "bg-purple-600" : tokens.toggle.inactiveTrack}`}
            aria-pressed={dummyQrisEnabled}
          >
            <span
              className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white shadow transition-transform
                ${dummyQrisEnabled ? "translate-x-7" : "translate-x-0"}`}
            />
          </button>
        </div>

        <Modal
          isOpen={pendingDummyQrisValue !== null}
          title={pendingDummyQrisValue ? t("admin.dummy_qris_confirm_enable_title") : t("admin.dummy_qris_confirm_disable_title")}
          description={pendingDummyQrisValue ? t("admin.dummy_qris_confirm_enable_desc") : t("admin.dummy_qris_confirm_disable_desc")}
          type={pendingDummyQrisValue ? "warning" : "info"}
          confirmLabel={pendingDummyQrisValue ? t("admin.dummy_qris_enable_confirm_btn") : t("admin.dummy_qris_disable_confirm_btn")}
          cancelLabel={t("common.cancel")}
          onConfirm={confirmToggleDummyQris}
          onCancel={cancelToggleDummyQris}
        />
      </div>

      {metrics && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
          {[
            { label: t("admin.total_revenue"), val: formatIDR(metrics.totalRevenue), color: tokens.adminPremium.metricAmber },
            { label: t("admin.status_success"), val: metrics.successCount, color: "text-emerald-500 light_sakura:text-emerald-600" },
            { label: t("admin.status_pending"), val: metrics.pendingCount, color: tokens.adminPremium.metricAmber },
            { label: t("admin.status_expired"), val: metrics.expiredCount, color: tokens.text.mutedAlt },
            { label: t("admin.status_failed"), val: metrics.failedCount, color: "text-red-500 light_sakura:text-red-600" },
            { label: t("admin.metrics.total"), val: metrics.totalTransactions, color: tokens.text.strong },
          ].map((m, i) => (
            <div key={i} className={cx("p-6 rounded-3xl border shadow-sm", tokens.surface.card, tokens.border.default)}>
              <p className={cx("text-sm font-medium", tokens.text.muted)}>{m.label}</p>
              <h3 className={`font-bold text-2xl mt-2 ${m.color}`}>
                {m.val}
              </h3>
            </div>
          ))}
        </div>
      )}

      {/* Filter */}
      <div className={cx("flex items-center gap-2 p-2 rounded-2xl w-fit", tokens.surface.subtle)}>
        {["all", "SUCCESS", "PENDING", "EXPIRED", "FAILED"].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all
              ${statusFilter === s
                ? "bg-slate-700 light_sakura:bg-white text-white light_sakura:text-indigo-600 shadow-sm"
                : cx("hover:text-slate-200 light_sakura:hover:text-slate-700", tokens.text.muted)}`}
          >
            {s === "all" ? t("admin.status_all") : s}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className={cx("overflow-hidden rounded-3xl border shadow-sm", tokens.surface.card, tokens.border.default)}>
        {loading ? (
          <div className="py-16 flex items-center justify-center">
            <Clock className="animate-spin text-indigo-500" size={28} />
          </div>
        ) : transactionsError ? (
          <ErrorState onRetry={loadTransactions} />
        ) : transactions.length === 0 ? (
          <EmptyState message={t("admin.no_transactions_found")} />
        ) : (
          <ScrollableTableWrapper>
            <table className={cx("w-full text-left text-sm min-w-[900px]", tokens.text.label)}>
              <thead className={cx("uppercase text-xs", tokens.text.muted, tokens.surface.subtle)}>
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
              <tbody className={cx("divide-y", tokens.adminPremium.tableDivide)}>
                {transactions.map((tx) => {
                  const cfg = statusConfig[tx.status] || statusConfig.FAILED;
                  const StatusIcon = cfg.icon;
                  return (
                    <tr key={tx.id} className={tokens.adminPremium.tableRowHover}>
                      <td className="px-6 py-4">
                        <p className={cx("font-semibold", tokens.text.primary)}>{tx.display_name || "—"}</p>
                        <p className={cx("text-xs", tokens.text.muted)}>{tx.email || "—"}</p>
                      </td>
                      <td className="px-6 py-4">
                        <span className={cx("font-mono text-xs", tokens.text.muted)}>{tx.order_id}</span>
                      </td>
                      <td className="px-6 py-4">
                        <p className={cx("font-semibold", tokens.text.primary)}>{formatIDR(tx.total_amount)}</p>
                        {tx.total_amount !== tx.amount && (
                          <p className={cx("text-xs", tokens.text.muted)}>
                            base: {formatIDR(tx.amount)}
                          </p>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className={cx("inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold", tx.status === "SUCCESS" ? tokens.adminPremium.statusBadgeSuccess : tx.status === "PENDING" ? tokens.adminPremium.statusBadgePending : tx.status === "EXPIRED" ? tokens.adminPremium.statusBadgeExpired : tokens.adminPremium.statusBadgeFailed)}>
                          <StatusIcon size={14} />
                          {cfg.label}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${tx.is_sandbox ? cx("text-purple-300 light_sakura:text-purple-600", tokens.adminPremium.sandboxBadgeBg) : "bg-indigo-900/20 light_sakura:bg-indigo-50 text-indigo-300 light_sakura:text-indigo-600"}`}>
                          {tx.is_sandbox ? t("admin.sandbox_badge") : t("admin.live_badge")}
                        </span>
                      </td>
                      <td className={cx("px-6 py-4 text-xs", tokens.text.muted)}>{formatDate(tx.paid_at)}</td>
                      <td className={cx("px-6 py-4 text-xs", tokens.text.muted)}>{formatDate(tx.created_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </ScrollableTableWrapper>
        )}
      </div>

      {/* Pagination */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-2 mt-4 font-sans text-xs text-slate-400">
        {/* Page Size Selector */}
        <div className="flex items-center gap-2">
          <span>{t("admin.rows_per_page")}</span>
          <DropdownField
            className="w-24"
            value={String(pageSize)}
            onChange={(v) => {
              setPageSize(v === "all" ? "all" : Number(v));
              setPage(0);
            }}
            options={[
              { value: "5", label: "5" },
              { value: "10", label: "10" },
              { value: "15", label: "15" },
              { value: "20", label: "20" },
              { value: "all", label: t("common.all") },
            ]}
          />
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
                className={cx("p-2 rounded-xl border disabled:opacity-50 cursor-pointer", tokens.adminPremium.paginationBorder, tokens.text.label, tokens.surface.card, tokens.hover.surface)}
              >
                <ChevronLeft size={14} />
              </button>
              <span className={cx("font-medium", tokens.text.onSurface)}>{page + 1} / {totalPages}</span>
              <button
                disabled={page + 1 >= totalPages}
                onClick={() => setPage(p => p + 1)}
                className={cx("p-2 rounded-xl border disabled:opacity-50 cursor-pointer", tokens.adminPremium.paginationBorder, tokens.text.label, tokens.surface.card, tokens.hover.surface)}
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        ) : (
          <div className="text-slate-500 text-xs">
            {t("admin.showing_all_transactions").replace("{count}", totalCount.toString())}
          </div>
        )}
      </div>
      
      <LoadingOverlay isOpen={refreshing || loading || savingDummyQris} message={savingDummyQris ? t("admin.dummy_qris_saving") : t("admin.loading_data")} />
    </div>
  );
};
