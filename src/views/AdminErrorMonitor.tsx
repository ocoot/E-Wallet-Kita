import React, { useState, useEffect, useCallback } from "react";
import { motion } from "motion/react";
import { CollapsingPageHeader } from "../components/CollapsingPageHeader";
import { Card } from "../components/ui/Card";
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
import { reportFrontendError } from "../lib/errorReporter";
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

// FIX (UI/UX, Agu 2026): insiden 14/7/2026 -- 4 job pg_cron hilang total
// dari cron.job selama ~18 hari TANPA satupun baris masuk ke error_logs
// (kalau job tidak pernah dipanggil, bukan dipanggil-lalu-gagal, tidak ada
// yang bisa dicatat function-nya sendiri). Halaman ini (Monitor Error)
// cuma bisa lihat kegagalan yang TERCATAT -- buta terhadap "job-nya
// sendiri sudah tidak ada". Kartu baru di bawah baca RPC
// `get_scheduled_jobs_status()` (lihat migration
// 20260901000000_scheduled_jobs_status_rpc.sql) yang query cron.job +
// cron.job_run_details LANGSUNG, supaya kelas kegagalan ini kelihatan di
// UI tanpa perlu SQL Editor manual.
interface ScheduledJobStatus {
  jobname: string;
  schedule: string;
  active: boolean;
  last_run_at: string | null;
  last_run_status: string | null;
  last_run_message: string | null;
  expected_interval_minutes: number;
  is_overdue: boolean;
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

// Label kasar interval job dari expected_interval_minutes (lihat CASE di
// RPC) -- bukan parsing cron expression, cukup untuk ditampilkan di kartu.
function formatJobInterval(minutes: number, t: (k: string) => string): string {
  if (minutes <= 15) return t("error_monitor.jobs_interval_15min");
  if (minutes <= 60) return t("error_monitor.jobs_interval_hourly");
  if (minutes <= 24 * 60) return t("error_monitor.jobs_interval_daily");
  return t("error_monitor.jobs_interval_monthly");
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
  const [jobsStatus, setJobsStatus] = useState<ScheduledJobStatus[]>([]);
  const [jobsStatusLoading, setJobsStatusLoading] = useState(true);
  const [jobsStatusError, setJobsStatusError] = useState(false);

  const [periodHours, setPeriodHours] = useState<24 | 168 | 720>(24);
  const [levelFilter, setLevelFilter] = useState<"all" | ErrorLogRow["level"]>("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [pageSize, setPageSize] = useState<number | "all">(5);
  const [page, setPage] = useState(0);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const loadStats = useCallback(async () => {
    const { data, error } = await supabase.rpc("admin_get_error_stats", { p_hours: periodHours });
    if (error) {
      console.error("[AdminErrorMonitor] stats RPC error:", error);
      void reportFrontendError({
        source: "frontend:admin-error-monitor",
        message: error.message,
        context: { fn: "loadStats", periodHours },
      });
      return;
    }
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
      void reportFrontendError({
        source: "frontend:admin-error-monitor",
        message: err instanceof Error ? err.message : String(err),
        context: { fn: "loadLogs", page, pageSize, levelFilter, sourceFilter },
      });
      setLogsError(true);
    } finally {
      setLogsLoading(false);
    }
  }, [page, pageSize, levelFilter, sourceFilter, showToast, t]);

  const loadJobsStatus = useCallback(async () => {
    setJobsStatusLoading(true);
    setJobsStatusError(false);
    try {
      const { data, error } = await supabase.rpc("get_scheduled_jobs_status");
      if (error) throw error;
      setJobsStatus((data as ScheduledJobStatus[]) || []);
    } catch (err: any) {
      void reportFrontendError({
        source: "frontend:admin-error-monitor",
        message: err instanceof Error ? err.message : String(err),
        context: { fn: "loadJobsStatus" },
      });
      setJobsStatusError(true);
    } finally {
      setJobsStatusLoading(false);
    }
  }, []);

  useEffect(() => { setPage(0); }, [levelFilter, sourceFilter, pageSize]);

  useEffect(() => {
    if (isAdmin) { setStatsLoading(true); loadStats().finally(() => setStatsLoading(false)); }
  }, [isAdmin, loadStats]);

  useEffect(() => {
    if (isAdmin) loadLogs();
  }, [isAdmin, loadLogs]);

  useEffect(() => {
    if (isAdmin) loadJobsStatus();
  }, [isAdmin, loadJobsStatus]);

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
      await Promise.all([loadStats(), loadLogs(), loadJobsStatus()]);
      showToast(t("admin.refresh_success"), "success");
    } catch (err: any) {
      showToast(err.message || t("toast.error_general"), "error");
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <CollapsingPageHeader
      title={t("error_monitor.title")}
      subtitle={t("error_monitor.desc")}
      backTo="/admin"
      actions={
        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
          aria-label={t("admin.refresh_data")}
          className={cx("p-1.5 rounded-full cursor-pointer active:scale-[0.92] transition-transform disabled:opacity-50", tokens.text.secondary)}
        >
          <RefreshCw size={18} className={refreshing ? "animate-spin" : ""} />
        </button>
      }
    >
      {/* Header wrapped in a solid card surface (bukan lagi teks mengambang
          langsung di atas ribbon gradient) supaya kontras subtitle terjamin. */}
      <div className={cx("overflow-hidden rounded-2xl border shadow-sm", tokens.surface.card, tokens.border.accent)}>
        <div className="h-1 w-full bg-gradient-to-r from-emerald-600/80 via-indigo-500/60 to-emerald-400/80" />
        <div className="p-6 sm:p-7 lg:p-8">
        <div className="flex justify-end">
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

            {/* Tombol Refresh SUDAH dipindah ke actions slot di sticky
                toolbar -- sengaja TIDAK didobel di sini. Period selector
                di atas TETAP di body karena itu filter, bukan actions
                duplicate. */}
          </div>
        </div>
        </div>
      </div>

      {statsLoading ? (
        <div className="py-16 flex items-center justify-center">
          <Activity className="animate-pulse text-red-500" size={28} />
        </div>
      ) : (
        <>
          {/* Stat cards -- pola resmi grid statistik 4-angka: grid-cols-2 sm:grid-cols-4 gap-3 (lihat GoldSavings.tsx summary grid) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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

          {/* Status Scheduled Jobs (pg_cron) -- lihat komentar di interface
              ScheduledJobStatus soal kenapa ini perlu ada TERPISAH dari
              statistik error_logs di atas: kelas kegagalan "job hilang/
              tidak pernah dipanggil" tidak pernah muncul di error_logs
              sama sekali. */}
          <Card padding="md" border="neutral" elevation="sm">
            <p className={cx("text-sm font-semibold mb-4", tokens.text.secondary)}>
              {t("error_monitor.jobs_status_title")}
            </p>
            {jobsStatusLoading ? (
              <div className="py-6 flex items-center justify-center">
                <Activity className="animate-pulse text-red-500" size={20} />
              </div>
            ) : jobsStatusError ? (
              <p className={cx("text-xs", tokens.text.muted)}>{t("error_monitor.jobs_status_error")}</p>
            ) : jobsStatus.length === 0 ? (
              <p className={cx("text-xs", tokens.text.muted)}>{t("error_monitor.jobs_status_empty")}</p>
            ) : (
              <div className="space-y-2">
                {jobsStatus.map((job) => (
                  <div
                    key={job.jobname}
                    className={cx(
                      "flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5",
                      job.is_overdue ? "border-red-500/30 bg-red-500/10" : tokens.border.default
                    )}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        {job.is_overdue ? (
                          <XCircle size={13} className="text-red-400 shrink-0" />
                        ) : (
                          <Activity size={13} className="text-emerald-400 shrink-0" />
                        )}
                        <span className={cx("font-mono text-xs font-semibold truncate", tokens.text.secondary)}>{job.jobname}</span>
                        {!job.active && (
                          <span className="text-[10px] font-semibold text-amber-400 shrink-0">{t("error_monitor.jobs_inactive")}</span>
                        )}
                      </div>
                      <p className={cx("text-[11px] mt-0.5", tokens.text.muted)}>
                        {formatJobInterval(job.expected_interval_minutes, t)}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={cx("text-xs font-mono font-semibold", job.is_overdue ? "text-red-400" : tokens.text.secondary)}>
                        {job.last_run_at
                          ? t("error_monitor.jobs_last_run", { time: formatRelativeTime(job.last_run_at, t) })
                          : t("error_monitor.jobs_never_run")}
                      </p>
                      {job.last_run_status && (
                        <p className={cx("text-[10px] mt-0.5", tokens.text.muted)}>{job.last_run_status}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* By-source breakdown */}
          {sources.length > 0 && (
            <Card padding="md" border="neutral" elevation="sm">
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
      <div className={cx("rounded-2xl border shadow-sm overflow-hidden", tokens.surface.card, tokens.border.default)}>
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
                <tr className={tokens.divide.tableColumn}>
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
                        className={cx(tokens.errorMonitor.tableRowHover, tokens.divide.tableColumn, hasContext ? "cursor-pointer" : "")}
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
                            <pre className={cx("text-xs whitespace-pre-wrap break-all font-mono p-3 rounded-xl border", tokens.text.mutedAlt, tokens.surface.sunken, tokens.border.default)}>
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
      </div>

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
              { value: "5", label: "5" },
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
    </CollapsingPageHeader>
  );
};
