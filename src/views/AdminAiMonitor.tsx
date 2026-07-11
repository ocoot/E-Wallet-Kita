import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { useLanguage } from "../contexts/LanguageContext";
import { useAdmin } from "../hooks/useAdmin";
import { LoadingOverlay } from "../components/LoadingOverlay";
import { ScrollableTableWrapper } from "../components/ScrollableTableWrapper";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { DropdownField } from "../components/DropdownField";
import {
  Brain,
  RefreshCw,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Activity,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface KeyStat {
  provider: string;
  key_alias: string;
  model: string;
  total_calls: number;
  success_calls: number;
  failed_calls: number;
  quota_exceeded_calls: number;
  last_used_at: string | null;
}

interface ProviderStat {
  provider: string;
  total_calls: number;
  success_calls: number;
  failed_calls: number;
  quota_exceeded_calls: number;
}

interface DailyTrend {
  date: string;
  provider: string;
  calls: number;
}

interface AiUsageSummary {
  period_days: number;
  since: string;
  by_key: KeyStat[] | null;
  by_provider: ProviderStat[] | null;
  daily_trend: DailyTrend[] | null;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const PROVIDER_COLORS: Record<string, { badge: string; bar: string }> = {
  gemini:    { badge: "bg-blue-500/10 border-blue-500/30 text-blue-400",    bar: "bg-blue-500" },
  openai:    { badge: "bg-emerald-500/10 border-emerald-500/30 text-emerald-400", bar: "bg-emerald-500" },
  anthropic: { badge: "bg-purple-500/10 border-purple-500/30 text-purple-400", bar: "bg-purple-500" },
};

const PERIOD_OPTIONS = [7, 14, 30, 90] as const;
type PeriodOption = typeof PERIOD_OPTIONS[number];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function successRate(success: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((success / total) * 100);
}

function quotaRate(exceeded: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((exceeded / total) * 100);
}

function formatRelativeTime(iso: string | null, t: (k: string) => string): string {
  if (!iso) return t("ai_monitor.never");
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return t("ai_monitor.just_now");
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─── Component ───────────────────────────────────────────────────────────────

export const AdminAiMonitor: React.FC = () => {
  const { t, locale } = useLanguage();
  const { isAdmin } = useAdmin();

  const [summary, setSummary]     = useState<AiUsageSummary | null>(null);
  const [loading, setLoading]     = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [period, setPeriod]       = useState<PeriodOption>(30);
  const [pageSize, setPageSize]   = useState<number | "all">(10);
  const [page, setPage]   = useState(0);

  const byKey = summary?.by_key ?? [];

  useEffect(() => {
    setPage(0);
  }, [pageSize, byKey.length]);

  const load = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) setRefreshing(true);
    else setLoading(true);
    setLoadError(false);

    const { data, error } = await supabase.rpc("get_ai_usage_summary", {
      p_days: period,
    });

    if (!error && data) {
      setSummary(data as AiUsageSummary);
    } else {
      console.error("[AdminAiMonitor] RPC error:", error);
      setLoadError(true);
    }
    setLoading(false);
    setRefreshing(false);
  }, [period]);

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

  if (!isAdmin) return null;

  const byProvider = summary?.by_provider ?? [];

  // Total panggilan semua provider untuk persentase relatif antar provider
  const grandTotal = byProvider.reduce((s, p) => s + p.total_calls, 0);

  return (
    <div className="space-y-6">
      {/* Header Wrapped in One Card Container */}
      <div className="bg-slate-900 light_sakura:bg-white p-6 md:p-8 rounded-3xl border border-slate-800 light_sakura:border-slate-100 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="font-sans font-bold text-2xl tracking-tight text-white light_sakura:text-slate-900 flex items-center gap-2">
              <Brain size={24} className="text-indigo-500" />
              {t("ai_monitor.title")}
            </h1>
            <p className="text-sm text-slate-400 light_sakura:text-slate-500 mt-1">
              {t("ai_monitor.desc")}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {/* Period selector */}
            <div className="flex rounded-xl border border-slate-800 light_sakura:border-slate-200 bg-slate-800 light_sakura:bg-slate-50 p-1">
              {PERIOD_OPTIONS.map((d) => (
                <button
                  key={d}
                  onClick={() => setPeriod(d)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg cursor-pointer transition-colors
                    ${period === d
                      ? "bg-slate-700 light_sakura:bg-white shadow-sm text-indigo-400 light_sakura:text-indigo-600"
                      : "text-slate-400 light_sakura:text-slate-500 hover:text-slate-200 light_sakura:hover:text-slate-700"
                    }`}
                >
                  {d}{t("ai_monitor.days_suffix")}
                </button>
              ))}
            </div>

            <button
              onClick={() => load(true)}
              disabled={refreshing}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl border border-slate-800 light_sakura:border-slate-200 bg-slate-800 light_sakura:bg-white hover:bg-slate-700 light_sakura:hover:bg-slate-50 text-slate-300 light_sakura:text-slate-600 cursor-pointer transition-colors disabled:opacity-50"
            >
              <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
              {t("ai_monitor.refresh")}
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="py-20 flex items-center justify-center">
          <Activity className="animate-pulse text-indigo-500" size={32} />
        </div>
      ) : loadError ? (
        <ErrorState onRetry={() => load()} />
      ) : (
        <>
          {/* Provider Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {byProvider.length === 0 ? (
              <div className="col-span-1 sm:col-span-3">
                <EmptyState message={t("ai_monitor.no_data")} />
              </div>
            ) : (
              byProvider.map((p) => {
                const sRate  = successRate(p.success_calls, p.total_calls);
                const qRate  = quotaRate(p.quota_exceeded_calls, p.total_calls);
                const sharePercent = grandTotal > 0 ? Math.round((p.total_calls / grandTotal) * 100) : 0;

                return (
                  <div
                    key={p.provider}
                    className="rounded-3xl border border-slate-700 light_sakura:border-slate-100 bg-slate-900 light_sakura:bg-white p-6 shadow-sm space-y-4"
                  >
                    <div className="flex items-center justify-between">
                      <span className="px-3 py-1 rounded-full text-xs font-semibold bg-indigo-900/50 light_sakura:bg-indigo-50 text-indigo-300 light_sakura:text-indigo-600 uppercase">
                        {p.provider}
                      </span>
                      <span className="text-xs text-slate-400 light_sakura:text-slate-500">{sharePercent}% {t("ai_monitor.share_of_total")}</span>
                    </div>

                    <div>
                      <p className="text-3xl font-bold text-white light_sakura:text-slate-900">
                        {p.total_calls.toLocaleString()}
                      </p>
                      <p className="text-sm text-slate-400 light_sakura:text-slate-500">{t("ai_monitor.total_calls")}</p>
                    </div>

                    {/* Success rate bar */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-slate-300 light_sakura:text-slate-600">
                        <span className="flex items-center gap-1">
                          <CheckCircle size={12} className="text-emerald-500" />
                          {t("ai_monitor.success_rate")}
                        </span>
                        <span className="font-semibold text-emerald-400 light_sakura:text-emerald-600">{sRate}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-700 light_sakura:bg-slate-100 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-indigo-500 transition-all duration-500"
                          style={{ width: `${sRate}%` }}
                        />
                      </div>
                    </div>

                    {/* Quota exceeded */}
                    {qRate > 0 && (
                      <div className="flex items-center gap-2 text-xs text-amber-500 light_sakura:text-amber-600 font-medium">
                        <AlertTriangle size={14} />
                        {qRate}% {t("ai_monitor.quota_exceeded")}
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-3 pt-2">
                      <div className="bg-slate-800 light_sakura:bg-slate-50 rounded-xl p-3">
                        <p className="text-sm font-bold text-emerald-400 light_sakura:text-emerald-600">{p.success_calls.toLocaleString()}</p>
                        <p className="text-xs text-slate-400 light_sakura:text-slate-500">{t("ai_monitor.success")}</p>
                      </div>
                      <div className="bg-slate-800 light_sakura:bg-slate-50 rounded-xl p-3">
                        <p className="text-sm font-bold text-red-400 light_sakura:text-red-600">{p.failed_calls.toLocaleString()}</p>
                        <p className="text-xs text-slate-400 light_sakura:text-slate-500">{t("ai_monitor.failed")}</p>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Per-Key Detail Table */}
          {byKey.length > 0 && (
            <div className="rounded-3xl border border-slate-800 light_sakura:border-slate-100 bg-slate-900 light_sakura:bg-white shadow-sm overflow-hidden">
              <div className="px-6 py-5 border-b border-slate-800 light_sakura:border-slate-100">
                <h3 className="text-base font-semibold text-white light_sakura:text-slate-900">
                  {t("ai_monitor.per_key_title")}
                </h3>
                <p className="text-sm text-slate-400 light_sakura:text-slate-500 mt-0.5">{t("ai_monitor.per_key_desc")}</p>
              </div>

              <ScrollableTableWrapper>
                <table className="w-full text-left text-sm text-slate-300 light_sakura:text-slate-600 min-w-[900px]">
                  <thead className="bg-slate-800 light_sakura:bg-slate-50 uppercase text-xs font-semibold text-slate-400 light_sakura:text-slate-500">
                    <tr>
                      <th className="px-6 py-4">{t("ai_monitor.col_key")}</th>
                      <th className="px-6 py-4">{t("ai_monitor.col_model")}</th>
                      <th className="px-6 py-4 text-right">{t("ai_monitor.col_total")}</th>
                      <th className="px-6 py-4">{t("ai_monitor.col_success_rate")}</th>
                      <th className="px-6 py-4 text-right">{t("ai_monitor.col_quota")}</th>
                      <th className="px-6 py-4">{t("ai_monitor.col_last_used")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 light_sakura:divide-slate-100">
                    {(pageSize === "all" ? byKey : byKey.slice(page * pageSize, (page + 1) * pageSize)).map((k) => {
                      const sRate   = successRate(k.success_calls, k.total_calls);
                      const qRate   = quotaRate(k.quota_exceeded_calls, k.total_calls);
                      const hasQuotaIssue = qRate > 10;

                      return (
                        <tr
                          key={`${k.provider}-${k.key_alias}-${k.model}`}
                          className="hover:bg-slate-800/50 light_sakura:hover:bg-slate-50/50 transition-colors"
                        >
                          <td className="px-6 py-4">
                            <span className="px-2 py-1 rounded-lg text-[clamp(0.5625rem,2.6vw,0.625rem)] font-semibold bg-indigo-950/50 light_sakura:bg-indigo-50 text-indigo-300 light_sakura:text-indigo-600 uppercase mr-2">
                              {k.provider}
                            </span>
                            <span className="font-mono text-xs text-slate-200 light_sakura:text-slate-700">
                              {k.key_alias}
                            </span>
                          </td>
                          <td className="px-6 py-4 font-mono text-xs text-slate-400 light_sakura:text-slate-500">
                            {k.model}
                          </td>
                          <td className="px-6 py-4 text-right text-sm font-semibold text-white light_sakura:text-slate-900">
                            {k.total_calls.toLocaleString()}
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3 min-w-[120px]">
                              <div className="flex-1 h-2 rounded-full bg-slate-700 light_sakura:bg-slate-100 overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all ${sRate >= 80 ? "bg-emerald-500" : sRate >= 50 ? "bg-amber-500" : "bg-red-500"}`}
                                  style={{ width: `${sRate}%` }}
                                />
                              </div>
                              <span className={`text-xs font-semibold w-8 ${sRate >= 80 ? "text-emerald-400 light_sakura:text-emerald-600" : sRate >= 50 ? "text-amber-400 light_sakura:text-amber-600" : "text-red-400 light_sakura:text-red-600"}`}>
                                {sRate}%
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right">
                            {hasQuotaIssue ? (
                              <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-400 light_sakura:text-amber-600">
                                <AlertTriangle size={14} />
                                {qRate}%
                              </span>
                            ) : (
                              <span className="text-xs text-slate-400 light_sakura:text-slate-500">{qRate}%</span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-xs text-slate-400 light_sakura:text-slate-600">
                            {k.last_used_at ? (
                              <div>
                                <p className="text-white light_sakura:text-slate-900">
                                  {formatRelativeTime(k.last_used_at, t)}
                                </p>
                                <p className="text-slate-400 light_sakura:text-slate-500">
                                  {new Date(k.last_used_at).toLocaleDateString()}
                                </p>
                              </div>
                            ) : (
                              <span className="text-slate-400 light_sakura:text-slate-500">{t("ai_monitor.never")}</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </ScrollableTableWrapper>

              {/* Pagination Controls */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-6 py-4 border-t border-slate-800 light_sakura:border-slate-100 font-sans text-xs text-slate-400 bg-slate-900/50 light_sakura:bg-slate-50/50">
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
                {pageSize !== "all" && byKey.length > pageSize ? (
                  <div className="flex items-center gap-4">
                    <div>
                      {page * pageSize + 1}–{Math.min((page + 1) * pageSize, byKey.length)} dari {byKey.length}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        disabled={page === 0}
                        onClick={() => setPage(p => p - 1)}
                        className="p-1.5 rounded-lg bg-slate-800 light_sakura:bg-white border border-slate-700 light_sakura:border-slate-200 text-slate-300 light_sakura:text-slate-600 hover:bg-slate-700 light_sakura:hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
                      >
                        <ChevronLeft size={14} />
                      </button>
                      <span className="font-medium text-white light_sakura:text-slate-800">{page + 1} / {Math.ceil(byKey.length / pageSize)}</span>
                      <button
                        disabled={(page + 1) * pageSize >= byKey.length}
                        onClick={() => setPage(p => p + 1)}
                        className="p-1.5 rounded-lg bg-slate-800 light_sakura:bg-white border border-slate-700 light_sakura:border-slate-200 text-slate-300 light_sakura:text-slate-600 hover:bg-slate-700 light_sakura:hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
                      >
                        <ChevronRight size={14} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-slate-500 text-xs">
                    {t("admin.showing_all_keys").replace("{count}", byKey.length.toString())}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Failed / Quota Warning notice */}
          {byKey.some((k) => quotaRate(k.quota_exceeded_calls, k.total_calls) > 20) && (
            <div className="flex items-start gap-4 rounded-3xl border border-amber-800/50 light_sakura:border-amber-100 bg-amber-950/20 light_sakura:bg-amber-50 p-6">
              <AlertTriangle size={20} className="text-amber-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-amber-200 light_sakura:text-amber-800">{t("ai_monitor.high_quota_warning_title")}</p>
                <p className="text-xs text-amber-300 light_sakura:text-amber-700 mt-1">{t("ai_monitor.high_quota_warning_desc")}</p>
              </div>
            </div>
          )}

          {/* Footer info */}
          {summary && (
            <p className="text-xs text-slate-400 light_sakura:text-slate-500 text-center">
              {t("ai_monitor.footer_since")} {new Date(summary.since).toLocaleDateString()} — {summary.period_days} {t("ai_monitor.footer_days")}
            </p>
          )}
        </>
      )}

      <LoadingOverlay isOpen={refreshing || loading} message={t("ai_monitor.loading")} />
    </div>
  );
};
