import React, { useState, useEffect, useCallback } from "react";
import { AdminBackBar } from "../components/AdminBackBar";
import { supabase } from "../lib/supabase";
import { useLanguage } from "../contexts/LanguageContext";
import { useAdmin } from "../hooks/useAdmin";
import { LoadingOverlay } from "../components/LoadingOverlay";
import { ScrollableTableWrapper } from "../components/ScrollableTableWrapper";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { DropdownField } from "../components/DropdownField";
import { useThemeTokens } from "../hooks/useThemeTokens";
import { Card } from "../components/ui/Card";
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
  const { tokens, cx } = useThemeTokens();

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
      <div className="relative flow-root">
        <div className="relative z-10 mt-12 sm:mt-14">
          <AdminBackBar />
        </div>
      </div>

      {/* Header Wrapped in One Card Container */}
      <Card padding="lg" elevation="sm" border="neutral">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className={cx("font-sans font-bold text-2xl tracking-tight flex items-center gap-2", tokens.text.primary)}>
              <Brain size={24} className="text-indigo-500" />
              {t("ai_monitor.title")}
            </h1>
            <p className={cx("text-sm mt-1", tokens.text.muted)}>
              {t("ai_monitor.desc")}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {/* Period selector */}
            <div className={cx("flex rounded-xl border p-1", tokens.border.default, tokens.surface.subtle)}>
              {PERIOD_OPTIONS.map((d) => (
                <button
                  key={d}
                  onClick={() => setPeriod(d)}
                  className={cx(
                    "px-3 py-1.5 text-xs font-semibold rounded-lg cursor-pointer transition-colors",
                    period === d
                      ? cx("shadow-sm", tokens.surface.card, tokens.text.accent)
                      : cx(tokens.admin.aiMonitorPeriodHover, tokens.text.muted)
                  )}
                >
                  {d}{t("ai_monitor.days_suffix")}
                </button>
              ))}
            </div>

            <button
              onClick={() => load(true)}
              disabled={refreshing}
              className={cx("flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl border cursor-pointer transition-colors disabled:opacity-50", tokens.border.default, tokens.surface.subtle, tokens.hover.surface, tokens.text.label)}
            >
              <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
              {t("ai_monitor.refresh")}
            </button>
          </div>
        </div>
      </Card>

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
                  <Card
                    key={p.provider}
                    padding="md"
                    elevation="sm"
                    border="neutral"
                    className="space-y-4"
                  >
                    <div className="flex items-center justify-between">
                      <span className={cx("px-3 py-1 rounded-full text-xs font-semibold uppercase", tokens.surface.sunken, tokens.text.accent)}>
                        {p.provider}
                      </span>
                      <span className={cx("text-xs", tokens.text.muted)}>{sharePercent}% {t("ai_monitor.share_of_total")}</span>
                    </div>

                    <div>
                      <p className={cx("text-3xl font-bold", tokens.text.primary)}>
                        {p.total_calls.toLocaleString()}
                      </p>
                      <p className={cx("text-sm", tokens.text.muted)}>{t("ai_monitor.total_calls")}</p>
                    </div>

                    {/* Success rate bar */}
                    <div className="space-y-1">
                      <div className={cx("flex justify-between text-xs", tokens.text.label)}>
                        <span className="flex items-center gap-1">
                          <CheckCircle size={12} className="text-emerald-500" />
                          {t("ai_monitor.success_rate")}
                        </span>
                        <span className={cx("font-semibold", tokens.text.success)}>{sRate}%</span>
                      </div>
                      <div className={cx("h-2 rounded-full overflow-hidden", tokens.surface.subtle)}>
                        <div
                          className={cx("h-full rounded-full transition-all duration-500", tokens.admin.aiMonitorSuccessProgress)}
                          style={{ width: `${sRate}%` }}
                        />
                      </div>
                    </div>

                    {/* Quota exceeded */}
                    {qRate > 0 && (
                      <div className={cx("flex items-center gap-2 text-xs font-medium", tokens.text.warning)}>
                        <AlertTriangle size={14} />
                        {qRate}% {t("ai_monitor.quota_exceeded")}
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-3 pt-2">
                      <div className={cx("rounded-xl p-3", tokens.surface.subtle)}>
                        <p className={cx("text-sm font-bold", tokens.text.success)}>{p.success_calls.toLocaleString()}</p>
                        <p className={cx("text-xs", tokens.text.muted)}>{t("ai_monitor.success")}</p>
                      </div>
                      <div className={cx("rounded-xl p-3", tokens.surface.subtle)}>
                        <p className={cx("text-sm font-bold", tokens.text.danger)}>{p.failed_calls.toLocaleString()}</p>
                        <p className={cx("text-xs", tokens.text.muted)}>{t("ai_monitor.failed")}</p>
                      </div>
                    </div>
                  </Card>
                );
              })
            )}
          </div>

          {/* Per-Key Detail Table */}
          {byKey.length > 0 && (
            <Card padding="none" elevation="sm" border="neutral" className="overflow-hidden">
              <div className={cx("px-6 py-5 border-b", tokens.border.default)}>
                <h3 className={cx("text-base font-semibold", tokens.text.primary)}>
                  {t("ai_monitor.per_key_title")}
                </h3>
                <p className={cx("text-sm mt-0.5", tokens.text.muted)}>{t("ai_monitor.per_key_desc")}</p>
              </div>

              <ScrollableTableWrapper>
                <table className={cx("w-full text-left text-sm min-w-[900px]", tokens.text.label)}>
                  <thead className={cx("uppercase text-xs font-semibold", tokens.text.muted, tokens.surface.subtle)}>
                    <tr>
                      <th className="px-6 py-4">{t("ai_monitor.col_key")}</th>
                      <th className="px-6 py-4">{t("ai_monitor.col_model")}</th>
                      <th className="px-6 py-4 text-right">{t("ai_monitor.col_total")}</th>
                      <th className="px-6 py-4">{t("ai_monitor.col_success_rate")}</th>
                      <th className="px-6 py-4 text-right">{t("ai_monitor.col_quota")}</th>
                      <th className="px-6 py-4">{t("ai_monitor.col_last_used")}</th>
                    </tr>
                  </thead>
                  <tbody className={cx("divide-y", tokens.border.default)}>
                    {(pageSize === "all" ? byKey : byKey.slice(page * pageSize, (page + 1) * pageSize)).map((k) => {
                      const sRate   = successRate(k.success_calls, k.total_calls);
                      const qRate   = quotaRate(k.quota_exceeded_calls, k.total_calls);
                      const hasQuotaIssue = qRate > 10;

                      return (
                        <tr
                          key={`${k.provider}-${k.key_alias}-${k.model}`}
                          className={cx("transition-colors", tokens.hover.surface)}
                        >
                          <td className="px-6 py-4">
                            <span className={cx("px-2 py-1 rounded-lg text-[clamp(0.5625rem,2.6vw,0.625rem)] font-semibold uppercase mr-2", tokens.surface.sunken, tokens.text.accent)}>
                              {k.provider}
                            </span>
                            <span className={cx("font-mono text-xs", tokens.text.primary)}>
                              {k.key_alias}
                            </span>
                          </td>
                          <td className={cx("px-6 py-4 font-mono text-xs", tokens.text.muted)}>
                            {k.model}
                          </td>
                          <td className={cx("px-6 py-4 text-right text-sm font-semibold", tokens.text.primary)}>
                            {k.total_calls.toLocaleString()}
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3 min-w-[120px]">
                              <div className={cx("flex-1 h-2 rounded-full overflow-hidden", tokens.surface.subtle)}>
                                <div
                                  className={`h-full rounded-full transition-all ${sRate >= 80 ? "bg-emerald-500" : sRate >= 50 ? "bg-amber-500" : "bg-red-500"}`}
                                  style={{ width: `${sRate}%` }}
                                />
                              </div>
                              <span className={cx("text-xs font-semibold w-8", sRate >= 80 ? tokens.text.success : sRate >= 50 ? tokens.text.warning : tokens.text.danger)}>
                                {sRate}%
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right">
                            {hasQuotaIssue ? (
                              <span className={cx("inline-flex items-center gap-1 text-xs font-semibold", tokens.text.warning)}>
                                <AlertTriangle size={14} />
                                {qRate}%
                              </span>
                            ) : (
                              <span className={cx("text-xs", tokens.text.muted)}>{qRate}%</span>
                            )}
                          </td>
                          <td className={cx("px-6 py-4 text-xs", tokens.text.mutedAlt)}>
                            {k.last_used_at ? (
                              <div>
                                <p className={cx(tokens.text.primary)}>
                                  {formatRelativeTime(k.last_used_at, t)}
                                </p>
                                <p className={cx(tokens.text.muted)}>
                                  {new Date(k.last_used_at).toLocaleDateString()}
                                </p>
                              </div>
                            ) : (
                              <span className={cx(tokens.text.muted)}>{t("ai_monitor.never")}</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </ScrollableTableWrapper>

              {/* Pagination Controls */}
              <div className={cx("flex flex-col sm:flex-row items-center justify-between gap-4 px-6 py-4 border-t font-sans text-xs text-slate-400", tokens.surface.subtle, tokens.border.default)}>
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
                        className={cx("p-1.5 rounded-lg border disabled:opacity-50 cursor-pointer", tokens.surface.card, tokens.border.strong, tokens.hover.surface, tokens.text.label)}
                      >
                        <ChevronLeft size={14} />
                      </button>
                      <span className={cx("font-medium", tokens.text.onSurface)}>{page + 1} / {Math.ceil(byKey.length / pageSize)}</span>
                      <button
                        disabled={(page + 1) * pageSize >= byKey.length}
                        onClick={() => setPage(p => p + 1)}
                        className={cx("p-1.5 rounded-lg border disabled:opacity-50 cursor-pointer", tokens.surface.card, tokens.border.strong, tokens.hover.surface, tokens.text.label)}
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
            </Card>
          )}

          {/* Failed / Quota Warning notice */}
          {byKey.some((k) => quotaRate(k.quota_exceeded_calls, k.total_calls) > 20) && (
            <div className={cx("flex items-start gap-4 rounded-3xl border p-6 bg-amber-500/5", tokens.border.accent)}>
              <AlertTriangle size={20} className={cx("mt-0.5 shrink-0", tokens.text.warning)} />
              <div>
                <p className={cx("text-sm font-semibold", tokens.text.warning)}>{t("ai_monitor.high_quota_warning_title")}</p>
                <p className={cx("text-xs mt-1", tokens.text.mutedAlt)}>{t("ai_monitor.high_quota_warning_desc")}</p>
              </div>
            </div>
          )}

          {/* Footer info */}
          {summary && (
            <p className={cx("text-xs text-center", tokens.text.muted)}>
              {t("ai_monitor.footer_since")} {new Date(summary.since).toLocaleDateString()} — {summary.period_days} {t("ai_monitor.footer_days")}
            </p>
          )}
        </>
      )}

      <LoadingOverlay isOpen={refreshing || loading} message={t("ai_monitor.loading")} />
    </div>
  );
};
