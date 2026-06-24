import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { useLanguage } from "../contexts/LanguageContext";
import { useAdmin } from "../hooks/useAdmin";
import { LoadingOverlay } from "../components/LoadingOverlay";
import {
  Brain,
  RefreshCw,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Activity,
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
  const { t } = useLanguage();
  const { isAdmin } = useAdmin();

  const [summary, setSummary]     = useState<AiUsageSummary | null>(null);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [period, setPeriod]       = useState<PeriodOption>(30);

  const load = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) setRefreshing(true);
    else setLoading(true);

    const { data, error } = await supabase.rpc("get_ai_usage_summary", {
      p_days: period,
    });

    if (!error && data) {
      setSummary(data as AiUsageSummary);
    } else {
      console.error("[AdminAiMonitor] RPC error:", error);
    }
    setLoading(false);
    setRefreshing(false);
  }, [period]);

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

  if (!isAdmin) return null;

  const byProvider = summary?.by_provider ?? [];
  const byKey      = summary?.by_key ?? [];

  // Total panggilan semua provider untuk persentase relatif antar provider
  const grandTotal = byProvider.reduce((s, p) => s + p.total_calls, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-slate-100 flex items-center gap-2 light_sakura:text-slate-800">
            <Brain size={18} className="text-teal-400 light_sakura:text-rose-500" />
            {t("ai_monitor.title")}
          </h2>
          <p className="text-xs text-slate-400 mt-0.5 light_sakura:text-slate-500">
            {t("ai_monitor.desc")}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Period selector */}
          <div className="flex rounded-xl border border-slate-800 overflow-hidden light_sakura:border-rose-200">
            {PERIOD_OPTIONS.map((d) => (
              <button
                key={d}
                onClick={() => setPeriod(d)}
                className={`px-3 py-1.5 text-[10px] font-black cursor-pointer transition-colors
                  ${period === d
                    ? "bg-teal-500/20 text-teal-400 light_sakura:bg-rose-100 light_sakura:text-rose-600"
                    : "text-slate-500 hover:text-slate-300 light_sakura:hover:text-slate-600"
                  }`}
              >
                {d}{t("ai_monitor.days_suffix")}
              </button>
            ))}
          </div>

          <button
            onClick={() => load(true)}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-black rounded-xl border border-slate-800 hover:bg-slate-900 transition-colors cursor-pointer text-slate-300 disabled:opacity-50 light_sakura:border-rose-200 light_sakura:text-slate-700 light_sakura:hover:bg-rose-50"
          >
            <RefreshCw size={11} className={refreshing ? "animate-spin" : ""} />
            {t("ai_monitor.refresh")}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="py-20 flex items-center justify-center">
          <Activity className="animate-pulse text-teal-400" size={28} />
        </div>
      ) : (
        <>
          {/* Provider Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {byProvider.length === 0 ? (
              <div className="col-span-3 py-12 text-center text-slate-500 text-sm border border-dashed border-slate-800 rounded-2xl">
                {t("ai_monitor.no_data")}
              </div>
            ) : (
              byProvider.map((p) => {
                const colors = PROVIDER_COLORS[p.provider] ?? PROVIDER_COLORS.gemini;
                const sRate  = successRate(p.success_calls, p.total_calls);
                const qRate  = quotaRate(p.quota_exceeded_calls, p.total_calls);
                const sharePercent = grandTotal > 0 ? Math.round((p.total_calls / grandTotal) * 100) : 0;

                return (
                  <div
                    key={p.provider}
                    className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4 space-y-3 light_sakura:bg-rose-50/40 light_sakura:border-rose-200"
                  >
                    <div className="flex items-center justify-between">
                      <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black uppercase border ${colors.badge}`}>
                        {p.provider}
                      </span>
                      <span className="text-[10px] text-slate-400">{sharePercent}% {t("ai_monitor.share_of_total")}</span>
                    </div>

                    <div>
                      <p className="text-2xl font-black text-slate-100 light_sakura:text-slate-800">
                        {p.total_calls.toLocaleString()}
                      </p>
                      <p className="text-[10px] text-slate-400">{t("ai_monitor.total_calls")}</p>
                    </div>

                    {/* Success rate bar */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] text-slate-400">
                        <span className="flex items-center gap-1">
                          <CheckCircle size={9} className="text-emerald-400" />
                          {t("ai_monitor.success_rate")}
                        </span>
                        <span className="font-bold text-emerald-400">{sRate}%</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${colors.bar} opacity-80 transition-all duration-500`}
                          style={{ width: `${sRate}%` }}
                        />
                      </div>
                    </div>

                    {/* Quota exceeded */}
                    {qRate > 0 && (
                      <div className="flex items-center gap-1.5 text-[10px] text-amber-400">
                        <AlertTriangle size={9} />
                        {qRate}% {t("ai_monitor.quota_exceeded")}
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <div className="bg-slate-900/60 rounded-xl p-2 light_sakura:bg-rose-100/40">
                        <p className="text-xs font-black text-emerald-400">{p.success_calls.toLocaleString()}</p>
                        <p className="text-[9px] text-slate-500">{t("ai_monitor.success")}</p>
                      </div>
                      <div className="bg-slate-900/60 rounded-xl p-2 light_sakura:bg-rose-100/40">
                        <p className="text-xs font-black text-red-400">{p.failed_calls.toLocaleString()}</p>
                        <p className="text-[9px] text-slate-500">{t("ai_monitor.failed")}</p>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Per-Key Detail Table */}
          {byKey.length > 0 && (
            <div className="rounded-2xl border border-slate-800 bg-slate-950/40 overflow-hidden light_sakura:bg-rose-50/40 light_sakura:border-rose-200">
              <div className="px-5 py-4 border-b border-slate-800 light_sakura:border-rose-200">
                <h3 className="text-sm font-black text-slate-200 light_sakura:text-slate-700">
                  {t("ai_monitor.per_key_title")}
                </h3>
                <p className="text-[10px] text-slate-400 mt-0.5">{t("ai_monitor.per_key_desc")}</p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-900/60 text-[10px] font-black text-slate-400 uppercase tracking-wider light_sakura:border-rose-200 light_sakura:bg-rose-100/30">
                      <th className="px-4 py-3">{t("ai_monitor.col_key")}</th>
                      <th className="px-4 py-3">{t("ai_monitor.col_model")}</th>
                      <th className="px-4 py-3 text-right">{t("ai_monitor.col_total")}</th>
                      <th className="px-4 py-3">{t("ai_monitor.col_success_rate")}</th>
                      <th className="px-4 py-3 text-right">{t("ai_monitor.col_quota")}</th>
                      <th className="px-4 py-3">{t("ai_monitor.col_last_used")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50 light_sakura:divide-rose-200/50">
                    {byKey.map((k) => {
                      const colors  = PROVIDER_COLORS[k.provider] ?? PROVIDER_COLORS.gemini;
                      const sRate   = successRate(k.success_calls, k.total_calls);
                      const qRate   = quotaRate(k.quota_exceeded_calls, k.total_calls);
                      const hasQuotaIssue = qRate > 10;

                      return (
                        <tr
                          key={`${k.provider}-${k.key_alias}`}
                          className="hover:bg-slate-900/20 transition-colors light_sakura:hover:bg-rose-50/50"
                        >
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase border mr-2 ${colors.badge}`}>
                              {k.provider}
                            </span>
                            <span className="font-mono text-[10px] text-slate-300 light_sakura:text-slate-600">
                              {k.key_alias}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-mono text-[10px] text-slate-400">
                            {k.model}
                          </td>
                          <td className="px-4 py-3 text-right text-xs font-bold text-slate-200 light_sakura:text-slate-700">
                            {k.total_calls.toLocaleString()}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2 min-w-[100px]">
                              <div className="flex-1 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all ${sRate >= 80 ? "bg-emerald-500" : sRate >= 50 ? "bg-amber-500" : "bg-red-500"}`}
                                  style={{ width: `${sRate}%` }}
                                />
                              </div>
                              <span className={`text-[10px] font-bold w-8 ${sRate >= 80 ? "text-emerald-400" : sRate >= 50 ? "text-amber-400" : "text-red-400"}`}>
                                {sRate}%
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            {hasQuotaIssue ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-400">
                                <AlertTriangle size={9} />
                                {qRate}%
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-500">{qRate}%</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {k.last_used_at ? (
                              <div>
                                <p className="text-[10px] text-slate-300 light_sakura:text-slate-600">
                                  {formatRelativeTime(k.last_used_at, t)}
                                </p>
                                <p className="text-[9px] text-slate-500">
                                  {new Date(k.last_used_at).toLocaleDateString()}
                                </p>
                              </div>
                            ) : (
                              <span className="text-[10px] text-slate-600">{t("ai_monitor.never")}</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Failed / Quota Warning notice */}
          {byKey.some((k) => quotaRate(k.quota_exceeded_calls, k.total_calls) > 20) && (
            <div className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 px-4 py-3">
              <AlertTriangle size={14} className="text-amber-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-bold text-amber-400">{t("ai_monitor.high_quota_warning_title")}</p>
                <p className="text-[10px] text-amber-400/70 mt-0.5">{t("ai_monitor.high_quota_warning_desc")}</p>
              </div>
            </div>
          )}

          {/* Footer info */}
          {summary && (
            <p className="text-[10px] text-slate-600 text-center">
              {t("ai_monitor.footer_since")} {new Date(summary.since).toLocaleDateString()} — {summary.period_days} {t("ai_monitor.footer_days")}
            </p>
          )}
        </>
      )}

      <LoadingOverlay isOpen={refreshing || loading} message={t("ai_monitor.loading")} />
    </div>
  );
};
