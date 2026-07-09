import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { useLanguage } from "../contexts/LanguageContext";
import { useToast } from "../contexts/ToastContext";
import { useAdmin } from "../hooks/useAdmin";
import { LoadingOverlay } from "../components/LoadingOverlay";
import { ScrollableTableWrapper } from "../components/ScrollableTableWrapper";
import { EmptyState } from "../components/EmptyState";
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
  error:   { color: "text-red-400 light_sakura:text-red-600",     bg: "bg-red-500/10 border-red-500/30",     icon: XCircle },
  warning: { color: "text-amber-400 light_sakura:text-amber-600", bg: "bg-amber-500/10 border-amber-500/30", icon: AlertTriangle },
  info:    { color: "text-sky-400 light_sakura:text-sky-600",     bg: "bg-sky-500/10 border-sky-500/30",     icon: Info },
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

  const [stats, setStats] = useState<ErrorStats | null>(null);
  const [logs, setLogs] = useState<ErrorLogRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [statsLoading, setStatsLoading] = useState(true);
  const [logsLoading, setLogsLoading] = useState(true);
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
      {/* Header */}
      <div className="bg-slate-900 light_sakura:bg-white p-6 md:p-8 rounded-3xl border border-slate-800 light_sakura:border-slate-100 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="font-sans font-bold text-2xl tracking-tight text-white light_sakura:text-slate-900 flex items-center gap-2">
              <Activity size={24} className="text-red-500" />
              {t("error_monitor.title")}
            </h1>
            <p className="text-sm text-slate-400 light_sakura:text-slate-500 mt-1">
              {t("error_monitor.desc")}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <div className="flex rounded-xl border border-slate-800 light_sakura:border-slate-200 bg-slate-800 light_sakura:bg-slate-50 p-1">
              {PERIOD_OPTIONS.map((p) => (
                <button
                  key={p.hours}
                  onClick={() => setPeriodHours(p.hours)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg cursor-pointer transition-colors
                    ${periodHours === p.hours
                      ? "bg-slate-700 light_sakura:bg-white shadow-sm text-indigo-400 light_sakura:text-indigo-600"
                      : "text-slate-400 light_sakura:text-slate-500 hover:text-slate-200 light_sakura:hover:text-slate-700"}`}
                >
                  {t(p.labelKey)}
                </button>
              ))}
            </div>

            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl border border-slate-800 light_sakura:border-slate-200 bg-slate-800 light_sakura:bg-white hover:bg-slate-700 light_sakura:hover:bg-slate-50 text-slate-300 light_sakura:text-slate-600 cursor-pointer transition-colors disabled:opacity-50"
            >
              <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
              {t("admin.refresh_data")}
            </button>
          </div>
        </div>
      </div>

      {statsLoading ? (
        <div className="py-16 flex items-center justify-center">
          <Activity className="animate-pulse text-red-500" size={28} />
        </div>
      ) : (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: t("error_monitor.total"), val: stats?.total ?? 0, color: "text-slate-200 light_sakura:text-slate-800" },
              { label: t("error_monitor.errors"), val: stats?.errors ?? 0, color: "text-red-400 light_sakura:text-red-600" },
              { label: t("error_monitor.warnings"), val: stats?.warnings ?? 0, color: "text-amber-400 light_sakura:text-amber-600" },
              { label: t("error_monitor.info"), val: stats?.info ?? 0, color: "text-sky-400 light_sakura:text-sky-600" },
            ].map((m, i) => (
              <div key={i} className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4 shadow-sm light_sakura:bg-white light_sakura:border-slate-100">
                <p className="text-xs font-medium text-slate-400 light_sakura:text-slate-500">{m.label}</p>
                <h3 className={`font-bold text-2xl mt-1 ${m.color}`}>{m.val.toLocaleString()}</h3>
              </div>
            ))}
          </div>

          {/* Zero-error banner (mirrors the "0 ERRORS — Semua sistem aman" idea) */}
          {stats?.total === 0 && (
            <div className="flex items-center gap-3 px-5 py-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 light_sakura:bg-emerald-50 light_sakura:border-emerald-200 light_sakura:text-emerald-700 text-sm font-medium">
              <Activity size={18} className="shrink-0" />
              <span>{t("error_monitor.all_clear")}</span>
            </div>
          )}

          {/* By-source breakdown */}
          {sources.length > 0 && (
            <div className="bg-slate-900 light_sakura:bg-white p-6 rounded-3xl border border-slate-800 light_sakura:border-slate-100 shadow-sm">
              <p className="text-sm font-semibold text-slate-300 light_sakura:text-slate-700 mb-4">
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
                        <span className="font-mono text-slate-300 light_sakura:text-slate-700">{s.source}</span>
                        <span className="text-slate-400 light_sakura:text-slate-500">{s.count} ({pct}%)</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-slate-800 light_sakura:bg-slate-100 overflow-hidden">
                        <div className="h-full rounded-full bg-red-500/70 transition-all duration-500" style={{ width: `${pct}%` }} />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* Level filter */}
      <div className="flex items-center gap-2 p-2 bg-slate-800 light_sakura:bg-slate-50 rounded-2xl w-fit flex-wrap">
        {(["all", "error", "warning", "info"] as const).map((lvl) => (
          <button
            key={lvl}
            onClick={() => setLevelFilter(lvl)}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer
              ${levelFilter === lvl
                ? "bg-slate-700 light_sakura:bg-white text-white light_sakura:text-indigo-600 shadow-sm"
                : "text-slate-400 light_sakura:text-slate-500 hover:text-slate-200 light_sakura:hover:text-slate-700"}`}
          >
            {lvl === "all" ? t("admin.status_all") : t(`error_monitor.${lvl}`)}
          </button>
        ))}
        {sourceFilter !== "all" && (
          <button
            onClick={() => setSourceFilter("all")}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/30 cursor-pointer"
          >
            {sourceFilter} ✕
          </button>
        )}
      </div>

      {/* Log table */}
      <div className="overflow-hidden rounded-3xl border border-slate-800 light_sakura:border-slate-100 bg-slate-900 light_sakura:bg-white shadow-sm">
        {logsLoading ? (
          <div className="py-16 flex items-center justify-center">
            <Activity className="animate-pulse text-red-500" size={28} />
          </div>
        ) : logs.length === 0 ? (
          <EmptyState message={t("error_monitor.no_logs_found")} />
        ) : (
          <ScrollableTableWrapper>
            <table className="w-full text-left text-sm text-slate-300 light_sakura:text-slate-600 min-w-[820px]">
              <thead className="bg-slate-800 light_sakura:bg-slate-50 text-slate-400 light_sakura:text-slate-500 uppercase text-xs">
                <tr>
                  <th className="px-6 py-4 w-24">{t("error_monitor.col_level")}</th>
                  <th className="px-6 py-4 w-44">{t("error_monitor.col_source")}</th>
                  <th className="px-6 py-4">{t("error_monitor.col_message")}</th>
                  <th className="px-6 py-4 w-32">{t("error_monitor.col_time")}</th>
                  <th className="px-6 py-4 w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 light_sakura:divide-slate-100">
                {logs.map((log) => {
                  const cfg = LEVEL_CONFIG[log.level];
                  const LevelIcon = cfg.icon;
                  const isExpanded = expandedId === log.id;
                  const hasContext = log.context && Object.keys(log.context).length > 0;
                  return (
                    <React.Fragment key={log.id}>
                      <tr
                        className={`hover:bg-slate-800/50 light_sakura:hover:bg-slate-50/50 ${hasContext ? "cursor-pointer" : ""}`}
                        onClick={() => hasContext && setExpandedId(isExpanded ? null : log.id)}
                      >
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${cfg.bg} ${cfg.color}`}>
                            <LevelIcon size={12} />
                            {t(`error_monitor.${log.level}`)}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="font-mono text-xs text-slate-400 light_sakura:text-slate-500">{log.source}</span>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-slate-200 light_sakura:text-slate-800 line-clamp-2">{log.message}</p>
                        </td>
                        <td className="px-6 py-4 text-xs text-slate-400 light_sakura:text-slate-500 whitespace-nowrap">
                          {formatRelativeTime(log.created_at, t)}
                        </td>
                        <td className="px-6 py-4">
                          {hasContext && (isExpanded ? <ChevronUp size={16} className="text-slate-500" /> : <ChevronDown size={16} className="text-slate-500" />)}
                        </td>
                      </tr>
                      {isExpanded && hasContext && (
                        <tr className="bg-slate-950/40 light_sakura:bg-slate-50">
                          <td colSpan={5} className="px-6 py-4">
                            <p className="text-xs text-slate-500 mb-2">{formatDate(log.created_at)}{log.trace_id ? ` · trace: ${log.trace_id}` : ""}</p>
                            <pre className="text-xs text-slate-400 light_sakura:text-slate-600 whitespace-pre-wrap break-all font-mono bg-slate-900 light_sakura:bg-white p-3 rounded-xl border border-slate-800 light_sakura:border-slate-100">
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
          <select
            value={pageSize}
            onChange={(e) => {
              const val = e.target.value;
              setPageSize(val === "all" ? "all" : Number(val));
            }}
            className="bg-slate-800 border border-slate-700 text-slate-300 rounded px-2 py-1 text-xs light_sakura:bg-slate-50 light_sakura:border-rose-200 light_sakura:text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
          >
            <option value={10}>10</option>
            <option value={15}>15</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value="all">{t("common.all")}</option>
          </select>
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
                className="p-2 rounded-xl bg-slate-900 light_sakura:bg-white border border-slate-800 light_sakura:border-slate-200 text-slate-300 light_sakura:text-slate-600 hover:bg-slate-800 light_sakura:hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
              >
                <ChevronLeft size={14} />
              </button>
              <span className="font-medium text-white light_sakura:text-slate-800">{page + 1} / {totalPages}</span>
              <button
                disabled={page + 1 >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="p-2 rounded-xl bg-slate-900 light_sakura:bg-white border border-slate-800 light_sakura:border-slate-200 text-slate-300 light_sakura:text-slate-600 hover:bg-slate-800 light_sakura:hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
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
