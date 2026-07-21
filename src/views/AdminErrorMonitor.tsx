import React, { useState, useEffect, useCallback } from "react";
import { AdminBackBar } from "../components/AdminBackBar";
import { PageRibbonBackground } from "../components/PageRibbonBackground";
import { supabase } from "../lib/supabase";
import { useLanguage } from "../contexts/LanguageContext";
import { useToast } from "../contexts/ToastContext";
import { useThemeTokens } from "../hooks/useThemeTokens";
import { themeTokens } from "../lib/theme/tokens";
import { useAdmin } from "../hooks/useAdmin";
import { LoadingOverlay } from "../components/LoadingOverlay";
import { ScrollableTableWrapper } from "../components/ScrollableTableWrapper";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { DropdownField } from "../components/DropdownField";
import { Card } from "../components/ui/Card";
import {
  AlertTriangle,
  XCircle,
  Info,
  Activity,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ErrorLogRow {
  id: number;
  source: string;
  level: "error" | "warning" | "info";
  message: string;
  context: Record<string, unknown> | null;
  trace_id: string | null;
  created_at: string;
}

interface SourceStat {
  source: string;
  count: number;
}

interface ErrorStats {
  period_hours: number;
  total: number;
  errors: number;
  warnings: number;
  info: number;
  by_source: SourceStat[] | null;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const PERIOD_OPTIONS = [
  { hours: 24, labelKey: "error_monitor.period_24h" },
  { hours: 168, labelKey: "error_monitor.period_7d" },
  { hours: 720, labelKey: "error_monitor.period_30d" },
] as const;

const LEVEL_CONFIG: Record<ErrorLogRow["level"], { color: string; bg: string; icon: typeof XCircle }> = {
  error:   { color: themeTokens.errorMonitor.levelErrorColor,     bg: themeTokens.errorMonitor.levelErrorBg,     icon: XCircle },
  warning: { color: themeTokens.errorMonitor.levelWarningColor,   bg: themeTokens.errorMonitor.levelWarningBg,   icon: AlertTriangle },
  info:    { color: themeTokens.errorMonitor.levelInfoColor,      bg: themeTokens.errorMonitor.levelInfoBg,      icon: Info },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatRelativeTime(iso: string, t: (k: string) => string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t("error_monitor.just_now");
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

// ─── Component ───────────────────────────────────────────────────────────────

export const AdminErrorMonitor: React.FC = () => {
  const { t, locale } = useLanguage();
  const { showToast } = useToast();
  const { isAdmin } = useAdmin();
  const { tokens, cx } = useThemeTokens();

  const [stats, setStats] = useState<ErrorStats | null>(null);
  const [logs, setLogs] = useState<ErrorLogRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [statsLoading, setStatsLoading] = useState(true);
  const [logsLoading, setLogsLoading] = useState(true);
  const [logsError, setLogsError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [periodHours, setPeriodHours] = useState<24 | 168 | 720>(24);
  const [levelFilter, setLevelFilter] = useState<"all" | ErrorLogRow["level"]>("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [pageSize, setPageSize] = useState<number | "all">(15);
  const [page, setPage] = useState(0);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const loadStats = useCallback(async () => {
    const { data, error } = await supabase.rpc("admin_get_error_stats", { p_hours: periodHours });
    if (error) { console.error("[AdminErrorMonitor] stats RPC error:", error); return; }
    setStats(data as ErrorStats);
  }, [periodHours]);

  const loadLogs = useCallback(async () => {
    setLogsLoading(true);
    setLogsError(false);
    try {
      const limitVal = pageSize === "all" ? 1000000 : pageSize;
      const offsetVal = pageSize === "all" ? 0 : page * pageSize;
      const [logsRes, countRes] = await Promise.all([
        supabase.rpc("admin_get_error_logs", {
          p_limit: limitVal,
          p_offset: offsetVal,
          p_level: levelFilter,
          p_source: sourceFilter,
        }),
        supabase.rpc("admin_count_error_logs", { p_level: levelFilter, p_source: sourceFilter }),
      ]);
      if (logsRes.error) throw logsRes.error;
      if (countRes.error) throw countRes.error;
      setLogs(logsRes.data || []);
      setTotalCount(countRes.data || 0);
    } catch (err: any) {
      showToast(err.message || t("toast.error_general"), "error");
      setLogsError(true);
    } finally {
      setLogsLoading(false);
    }
  }, [page, pageSize, levelFilter, sourceFilter, showToast, t]);

  useEffect(() => { setPage(0); }, [levelFilter, sourceFilter, pageSize]);

  useEffect(() => {
    if (isAdmin) { setStatsLoading(true); loadStats().finally(() => setStatsLoading(false)); }
  }, [isAdmin, loadStats]);

  useEffect(() => {
    if (isAdmin) loadLogs();
  }, [isAdmin, loadLogs]);

  if (!isAdmin) return null;

  const totalPages = pageSize === "all" ? 1 : Math.ceil(totalCount / pageSize);
  const sources = stats?.by_source ?? [];

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString(locale === "id" ? "id-ID" : "en-US", {
      day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit",
    });

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([loadStats(), loadLogs()]);
      showToast(t("admin.refresh_success"), "success");
    } catch (err: any) {
      showToast(err.message || t("toast.error_general"), "error");
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="relative flow-root">
        <PageRibbonBackground />
        <div className="relative z-10 mt-12 sm:mt-14">
          <AdminBackBar />
        </div>
      </div>

      {/* Header */}
      <Card padding="lg" elevation="sm" border="neutral">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className={cx("font-sans font-bold text-2xl tracking-tight flex items-center gap-2", tokens.text.primary)}>
              <Activity size={24} className="text-red-500" />
              {t("error_monitor.title")}
            </h1>
            <p className={cx("text-sm mt-1", tokens.text.muted)}>
              {t("error_monitor.desc")}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <div className={cx("flex rounded-xl border p-1", tokens.errorMonitor.tabBorder, tokens.surface.subtle)}>
              {PERIOD_OPTIONS.map((p) => (
                <button
                  key={p.hours}
                  onClick={() => setPeriodHours(p.hours)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg cursor-pointer transition-colors
                    ${periodHours === p.hours
                      ? tokens.errorMonitor.tabActive
                      : tokens.errorMonitor.tabInactive}`}
                >
                  {t(p.labelKey)}
                </button>
              ))}
            </div>

            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className={cx("flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl border cursor-pointer transition-colors disabled:opacity-50", tokens.errorMonitor.btnRefresh, tokens.text.label)}
            >
              <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
              {t("admin.refresh_data")}
            </button>
          </div>
        </div>
      </Card>

      {statsLoading ? (
        <div className="py-16 flex items-center justify-center">
          <Activity className="animate-pulse text-red-500" size={28} />
        </div>
      ) : (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: t("error_monitor.total"), val: stats?.total ?? 0, color: tokens.errorMonitor.statLabelTotal },
              { label: t("error_monitor.errors"), val: stats?.errors ?? 0, color: tokens.errorMonitor.levelErrorColor },
              { label: t("error_monitor.warnings"), val: stats?.warnings ?? 0, color: tokens.errorMonitor.levelWarningColor },
              { label: t("error_monitor.info"), val: stats?.info ?? 0, color: tokens.errorMonitor.levelInfoColor },
            ].map((m, i) => (
              <div key={i} className={cx("rounded-2xl border p-4 shadow-sm", tokens.errorMonitor.statCardBg, tokens.border.default)}>
                <p className={cx("text-xs font-medium", tokens.text.muted)}>{m.label}</p>
                <h3 className={`font-bold text-2xl mt-1 ${m.color}`}>{m.val.toLocaleString()}</h3>
              </div>
            ))}
          </div>

          {/* Zero-error banner (mirrors the "0 ERRORS — Semua sistem aman" idea) */}
          {stats?.total === 0 && (
            <div className={cx("flex items-center gap-3 px-5 py-4 rounded-2xl border text-sm font-medium", tokens.errorMonitor.allClearBanner)}>
              <Activity size={18} className="shrink-0" />
              <span>{t("error_monitor.all_clear")}</span>
            </div>
          )}

          {/* By-source breakdown */}
          {sources.length > 0 && (
            <Card padding="md" elevation="sm" border="neutral">
              <p className={cx("text-sm font-semibold mb-4", tokens.text.secondary)}>
                {t("error_monitor.by_source_title")}
              </p>
              <div className="space-y-3">
                {sources.map((s) => {
                  const pct = stats && stats.total > 0 ? Math.round((s.count / stats.total) * 100) : 0;
                  return (
                    <button
                      key={s.source}
                      onClick={() => setSourceFilter(sourceFilter === s.source ? "all" : s.source)}
                      className={`w-full text-left transition-opacity cursor-pointer ${sourceFilter !== "all" && sourceFilter !== s.source ? "opacity-40" : ""}`}
                    >
                      <div className="flex justify-between text-xs mb-1">
                        <span className={cx("font-mono", tokens.text.secondary)}>{s.source}</span>
                        <span className={cx(tokens.text.muted)}>{s.count} ({pct}%)</span>
                      </div>
                      <div className={cx("h-1.5 rounded-full overflow-hidden", tokens.errorMonitor.progressBg)}>
                        <div className="h-full rounded-full bg-red-500/70 transition-all duration-500" style={{ width: `${pct}%` }} />
                      </div>
                    </button>
                  );
                })}
              </div>
            </Card>
          )}
        </>
      )}

      {/* Level filter */}
      <div className={cx("flex items-center gap-2 p-2 rounded-2xl w-fit flex-wrap", tokens.surface.subtle)}>
        {(["all", "error", "warning", "info"] as const).map((lvl) => (
          <button
            key={lvl}
            onClick={() => setLevelFilter(lvl)}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer
              ${levelFilter === lvl
                ? tokens.errorMonitor.tabActive
                : tokens.errorMonitor.tabInactive}`}
          >
            {lvl === "all" ? t("admin.status_all") : t(`error_monitor.${lvl}`)}
          </button>
        ))}
        {sourceFilter !== "all" && (
          <button
            onClick={() => setSourceFilter("all")}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/30 cursor-pointer"
          >
            {sourceFilter}
          </button>
        )}
      </div>

      {/* Log table */}
      <Card padding="none" elevation="sm" border="neutral" className="overflow-hidden">
        {logsLoading ? (
          <div className="py-16 flex items-center justify-center">
            <Activity className="animate-pulse text-red-500" size={28} />
          </div>
        ) : logsError ? (
          <ErrorState onRetry={loadLogs} />
        ) : logs.length === 0 ? (
          <EmptyState message={t("error_monitor.no_logs_found")} />
        ) : (
          <ScrollableTableWrapper>
            <table className={cx("w-full text-left text-sm min-w-[820px]", tokens.text.label)}>
              <thead className={cx("uppercase text-xs", tokens.text.muted, tokens.surface.subtle)}>
                <tr>
                  <th className="px-6 py-4 w-24">{t("error_monitor.col_level")}</th>
                  <th className="px-6 py-4 w-44">{t("error_monitor.col_source")}</th>
                  <th className="px-6 py-4">{t("error_monitor.col_message")}</th>
                  <th className="px-6 py-4 w-32">{t("error_monitor.col_time")}</th>
                  <th className="px-6 py-4 w-10" />
                </tr>
              </thead>
              <tbody className={cx("divide-y", tokens.errorMonitor.tableDivide)}>
                {logs.map((log) => {
                  const cfg = LEVEL_CONFIG[log.level];
                  const LevelIcon = cfg.icon;
                  const isExpanded = expandedId === log.id;
                  const hasContext = log.context && Object.keys(log.context).length > 0;
                  return (
                    <React.Fragment key={log.id}>
                      <tr
                        className={`${tokens.errorMonitor.tableRowHover} ${hasContext ? "cursor-pointer" : ""}`}
                        onClick={() => hasContext && setExpandedId(isExpanded ? null : log.id)}
                      >
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border ${cfg.bg} ${cfg.color}`}>
                            <LevelIcon size={12} />
                            {t(`error_monitor.${log.level}`)}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={cx("font-mono text-xs", tokens.text.muted)}>{log.source}</span>
                        </td>
                        <td className="px-6 py-4">
                          <p className={cx("line-clamp-2", tokens.errorMonitor.rowMessage)}>{log.message}</p>
                        </td>
                        <td className={cx("px-6 py-4 text-xs whitespace-nowrap", tokens.text.muted)}>
                          {formatRelativeTime(log.created_at, t)}
                        </td>
                        <td className="px-6 py-4">
                          {hasContext && (isExpanded ? <ChevronUp size={16} className="text-slate-500" /> : <ChevronDown size={16} className="text-slate-500" />)}
                        </td>
                      </tr>
                      {isExpanded && hasContext && (
                        <tr className={tokens.errorMonitor.tableRowExpanded}>
                          <td colSpan={5} className="px-6 py-4">
                            <p className="text-xs text-slate-500 mb-2">{formatDate(log.created_at)}{log.trace_id ? ` · trace: ${log.trace_id}` : ""}</p>
                            <pre className={cx("text-xs whitespace-pre-wrap break-all font-mono p-3 rounded-xl border", tokens.text.mutedAlt, tokens.surface.card, tokens.border.default)}>
                              {JSON.stringify(log.context, null, 2)}
                            </pre>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </ScrollableTableWrapper>
        )}
      </Card>

      {/* Pagination */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-2 mt-4 font-sans text-xs text-slate-400">
        <div className="flex items-center gap-2">
          <span>{t("admin.rows_per_page")}</span>
          <DropdownField
            className="w-24"
            value={String(pageSize)}
            onChange={(v) => {
              setPageSize(v === "all" ? "all" : Number(v));
            }}
            options={[
              { value: "10", label: "10" },
              { value: "15", label: "15" },
              { value: "25", label: "25" },
              { value: "50", label: "50" },
              { value: "all", label: t("common.all") },
            ]}
          />
        </div>

        {pageSize !== "all" && totalCount > pageSize ? (
          <div className="flex items-center gap-4">
            <div>
              {page * pageSize + 1}–{Math.min((page + 1) * pageSize, totalCount)} dari {totalCount}
            </div>
            <div className="flex items-center gap-2">
              <button
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
                className={cx("p-2 rounded-xl border disabled:opacity-50 cursor-pointer", tokens.errorMonitor.paginationBtn, tokens.text.label, tokens.surface.card, tokens.hover.surface)}
              >
                <ChevronLeft size={14} />
              </button>
              <span className={cx("font-medium", tokens.text.onSurface)}>{page + 1} / {totalPages}</span>
              <button
                disabled={page + 1 >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className={cx("p-2 rounded-xl border disabled:opacity-50 cursor-pointer", tokens.errorMonitor.paginationBtn, tokens.text.label, tokens.surface.card, tokens.hover.surface)}
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        ) : (
          <div className="text-slate-500 text-xs">
            {t("error_monitor.showing_all").replace("{count}", totalCount.toString())}
          </div>
        )}
      </div>

      <LoadingOverlay isOpen={refreshing} message={t("admin.loading_data")} />
    </div>
  );
};
