import React, { useState, useEffect, useCallback } from "react";
import { CollapsingPageHeader } from "../components/CollapsingPageHeader";
import { Card } from "../components/ui/Card";
import { Modal } from "../components/Modal";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
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
import { audioFeedback } from "../lib/audio";
import {
  ShieldAlert,
  ShieldX,
  ShieldCheck,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Ban,
  Unlock,
  Plus,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface SecurityEventRow {
  id: number;
  ip: string;
  path: string | null;
  method: string | null;
  event_type: "suspicious_path" | "rate_limit_hit" | "blocked_request" | "auth_failure";
  user_agent: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

interface BlockedIpRow {
  id: number;
  ip: string;
  reason: string;
  banned_by: string | null;
  banned_at: string;
  expires_at: string | null;
  is_active: boolean;
}

interface TopIpStat {
  ip: string;
  event_count: number;
}

interface SecurityStats {
  period_hours: number;
  total_events: number;
  suspicious_path_count: number;
  rate_limit_hit_count: number;
  blocked_request_count: number;
  currently_banned_count: number;
  top_ips: TopIpStat[] | null;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const PERIOD_OPTIONS = [
  { hours: 24, labelKey: "error_monitor.period_24h" },
  { hours: 168, labelKey: "error_monitor.period_7d" },
  { hours: 720, labelKey: "error_monitor.period_30d" },
] as const;

const EVENT_TYPE_CONFIG: Record<SecurityEventRow["event_type"], { color: string; bg: string }> = {
  suspicious_path:  { color: themeTokens.securityMonitor.eventSuspiciousColor,  bg: themeTokens.securityMonitor.eventSuspiciousBg },
  blocked_request:  { color: themeTokens.securityMonitor.eventBlockedColor,    bg: themeTokens.securityMonitor.eventBlockedBg },
  rate_limit_hit:   { color: themeTokens.securityMonitor.eventRateLimitColor,  bg: themeTokens.securityMonitor.eventRateLimitBg },
  auth_failure:     { color: themeTokens.securityMonitor.eventAuthFailureColor, bg: themeTokens.securityMonitor.eventAuthFailureBg },
};

// ─── Component ───────────────────────────────────────────────────────────────

export const AdminSecurityMonitor: React.FC = () => {
  const { t, locale } = useLanguage();
  const { showToast } = useToast();
  const { isAdmin } = useAdmin();
  const { tokens, cx } = useThemeTokens();

  const [activeTab, setActiveTab] = useState<"events" | "blocked">("events");

  const [stats, setStats] = useState<SecurityStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [periodHours, setPeriodHours] = useState<24 | 168 | 720>(24);

  const [events, setEvents] = useState<SecurityEventRow[]>([]);
  const [eventsTotal, setEventsTotal] = useState(0);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [eventsError, setEventsError] = useState(false);
  const [eventTypeFilter, setEventTypeFilter] = useState<"all" | SecurityEventRow["event_type"]>("all");
  const [page, setPage] = useState(0);
  const pageSize = 15;

  const [blockedIps, setBlockedIps] = useState<BlockedIpRow[]>([]);
  const [blockedLoading, setBlockedLoading] = useState(true);
  const [blockedError, setBlockedError] = useState(false);

  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<{ isOpen: boolean; message: string }>({ isOpen: false, message: "" });

  const [banModalOpen, setBanModalOpen] = useState(false);
  const [banIpInput, setBanIpInput] = useState("");
  const [banReasonInput, setBanReasonInput] = useState("");
  const [banSubmitting, setBanSubmitting] = useState(false);

  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    type: "warning" | "danger" | "info" | "success";
    action: () => Promise<void>;
  }>({ isOpen: false, title: "", description: "", type: "info", action: async () => {} });

  const loadStats = useCallback(async () => {
    const { data, error } = await supabase.rpc("admin_get_security_stats", { p_hours: periodHours });
    if (error) {
      console.error("[AdminSecurityMonitor] stats RPC error:", error);
      void reportFrontendError({
        source: "frontend:admin-security-monitor",
        message: error.message,
        context: { fn: "loadStats", periodHours },
      });
      return;
    }
    setStats(data as SecurityStats);
  }, [periodHours]);

  const loadEvents = useCallback(async () => {
    setEventsLoading(true);
    setEventsError(false);
    try {
      const [eventsRes, countRes] = await Promise.all([
        supabase.rpc("admin_list_security_events", {
          p_limit: pageSize,
          p_offset: page * pageSize,
          p_event_type: eventTypeFilter,
        }),
        supabase.rpc("admin_count_security_events", { p_event_type: eventTypeFilter }),
      ]);
      if (eventsRes.error) throw eventsRes.error;
      if (countRes.error) throw countRes.error;
      setEvents(eventsRes.data || []);
      setEventsTotal(countRes.data || 0);
    } catch (err: any) {
      showToast(err.message || t("toast.error_general"), "error");
      void reportFrontendError({
        source: "frontend:admin-security-monitor",
        message: err instanceof Error ? err.message : String(err),
        context: { fn: "loadEvents", page, eventTypeFilter },
      });
      setEventsError(true);
    } finally {
      setEventsLoading(false);
    }
  }, [page, eventTypeFilter, showToast, t]);

  const loadBlockedIps = useCallback(async () => {
    setBlockedLoading(true);
    setBlockedError(false);
    try {
      const { data, error } = await supabase.rpc("admin_list_blocked_ips");
      if (error) throw error;
      setBlockedIps(data || []);
    } catch (err: any) {
      showToast(err.message || t("toast.error_general"), "error");
      void reportFrontendError({
        source: "frontend:admin-security-monitor",
        message: err instanceof Error ? err.message : String(err),
        context: { fn: "loadBlockedIps" },
      });
      setBlockedError(true);
    } finally {
      setBlockedLoading(false);
    }
  }, [showToast, t]);

  useEffect(() => { setPage(0); }, [eventTypeFilter]);

  useEffect(() => {
    if (isAdmin) { setStatsLoading(true); loadStats().finally(() => setStatsLoading(false)); }
  }, [isAdmin, loadStats]);

  useEffect(() => {
    if (isAdmin) loadEvents();
  }, [isAdmin, loadEvents]);

  useEffect(() => {
    if (isAdmin) loadBlockedIps();
  }, [isAdmin, loadBlockedIps]);

  if (!isAdmin) return null;

  const totalPages = Math.ceil(eventsTotal / pageSize);

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString(locale === "id" ? "id-ID" : "en-US", {
      day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit",
    });

  const formatRelativeTime = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return t("error_monitor.just_now");
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    return `${Math.floor(hrs / 24)}d`;
  };

  const handleRefresh = async () => {
    audioFeedback.playClick();
    setRefreshing(true);
    try {
      await Promise.all([loadStats(), loadEvents(), loadBlockedIps()]);
      showToast(t("admin.refresh_success"), "success");
    } catch (err: any) {
      showToast(err.message || t("toast.error_general"), "error");
    } finally {
      setRefreshing(false);
    }
  };

  const openBanModal = (prefillIp?: string) => {
    audioFeedback.playClick();
    setBanIpInput(prefillIp || "");
    setBanReasonInput("");
    setBanModalOpen(true);
  };

  const submitBan = async () => {
    const ip = banIpInput.trim();
    if (!ip) {
      showToast(t("security_monitor.ban_ip_required"), "error");
      return;
    }
    setBanSubmitting(true);
    try {
      const { error } = await supabase.rpc("admin_ban_ip", {
        p_ip: ip,
        p_reason: banReasonInput.trim() || null,
      });
      if (error) throw error;
      showToast(t("security_monitor.ban_success"), "success");
      setBanModalOpen(false);
      setBanIpInput("");
      setBanReasonInput("");
      await loadBlockedIps();
      await loadStats();
    } catch (err: any) {
      showToast(err.message || t("toast.error_general"), "error");
      void reportFrontendError({
        source: "frontend:admin-security-monitor",
        message: err instanceof Error ? err.message : String(err),
        context: { fn: "submitBan", ip },
      });
    } finally {
      setBanSubmitting(false);
    }
  };

  const handleUnban = (ip: string) => {
    setConfirmModal({
      isOpen: true,
      title: t("security_monitor.unban_title"),
      description: t("security_monitor.unban_confirm").replace("{ip}", ip),
      type: "warning",
      action: async () => {
        setActionLoading({ isOpen: true, message: t("admin.processing") });
        try {
          const { error } = await supabase.rpc("admin_unban_ip", { p_ip: ip });
          if (error) throw error;
          showToast(t("security_monitor.unban_success"), "success");
          await loadBlockedIps();
          await loadStats();
        } catch (err: any) {
          showToast(err.message || t("toast.error_general"), "error");
          void reportFrontendError({
            source: "frontend:admin-security-monitor",
            message: err instanceof Error ? err.message : String(err),
            context: { fn: "handleUnban", ip },
          });
        } finally {
          setActionLoading({ isOpen: false, message: "" });
        }
      },
    });
  };

  return (
    <CollapsingPageHeader
      title={t("security_monitor.title")}
      subtitle={t("security_monitor.desc")}
      backTo="/admin"
      actions={
        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
          aria-label={t("admin.refresh_data")}
          className={cx("p-3.5 rounded-full cursor-pointer active:scale-[0.92] transition-transform focus:outline-none disabled:opacity-50", tokens.text.secondary)}
        >
          <RefreshCw size={18} className={refreshing ? "animate-spin" : ""} />
        </button>
      }
    >
      <div className={cx("overflow-hidden rounded-2xl border shadow-sm", tokens.surface.card, tokens.border.accent)}>
        <div className="h-1 w-full bg-gradient-to-r from-red-600/80 via-amber-500/60 to-red-400/80" />
        <div className="p-6 sm:p-7 lg:p-8">
          <div className="flex justify-end">
            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              <div className={cx("flex rounded-xl border p-1", tokens.errorMonitor.tabBorder, tokens.surface.subtle)}>
                {PERIOD_OPTIONS.map((p) => (
                  <button
                    key={p.hours}
                    onClick={() => setPeriodHours(p.hours)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg cursor-pointer transition-colors
                      ${periodHours === p.hours ? tokens.errorMonitor.tabActive : tokens.errorMonitor.tabInactive}`}
                  >
                    {t(p.labelKey)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {statsLoading ? (
        <div className="py-16 flex items-center justify-center">
          <ShieldAlert className="animate-pulse text-red-500" size={28} />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              { label: t("security_monitor.stat_total"), val: stats?.total_events ?? 0, color: "text-slate-200" },
              { label: t("security_monitor.stat_suspicious"), val: stats?.suspicious_path_count ?? 0, color: "text-red-400" },
              { label: t("security_monitor.stat_blocked"), val: stats?.blocked_request_count ?? 0, color: "text-amber-400" },
              { label: t("security_monitor.stat_rate_limited"), val: stats?.rate_limit_hit_count ?? 0, color: "text-indigo-400" },
              { label: t("security_monitor.stat_banned_now"), val: stats?.currently_banned_count ?? 0, color: "text-red-500" },
            ].map((m, i) => (
              <div key={i} className={cx("rounded-2xl border p-4 shadow-sm", tokens.errorMonitor.statCardBg, tokens.border.default)}>
                <p className={cx("text-xs font-medium", tokens.text.muted)}>{m.label}</p>
                <h3 className={`font-bold text-2xl mt-1 ${m.color}`}>{m.val.toLocaleString()}</h3>
              </div>
            ))}
          </div>

          {stats?.total_events === 0 && (
            <div className={cx("flex items-center gap-3 px-5 py-4 rounded-2xl border text-sm font-medium", tokens.errorMonitor.allClearBanner)}>
              <ShieldCheck size={18} className="shrink-0" />
              <span>{t("security_monitor.all_clear")}</span>
            </div>
          )}

          {stats?.top_ips && stats.top_ips.length > 0 && (
            <Card padding="md" border="neutral" elevation="sm">
              <p className={cx("text-sm font-semibold mb-4", tokens.text.secondary)}>
                {t("security_monitor.top_ips_title")}
              </p>
              <div className="space-y-2">
                {stats.top_ips.map((row) => (
                  <div key={row.ip} className={cx("flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5", tokens.border.default)}>
                    <span className={cx("font-mono text-xs font-semibold", tokens.text.secondary)}>{row.ip}</span>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className={cx("text-xs", tokens.text.muted)}>{t("security_monitor.events_count").replace("{count}", String(row.event_count))}</span>
                      <button
                        onClick={() => openBanModal(row.ip)}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 cursor-pointer transition-colors"
                      >
                        <Ban size={11} /> {t("security_monitor.ban_action")}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}

      {/* Tabs: Events vs Blocked IPs */}
      <div className={cx("flex items-center gap-2 p-2 rounded-2xl w-fit flex-wrap", tokens.surface.subtle)}>
        <button
          onClick={() => setActiveTab("events")}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer
            ${activeTab === "events" ? tokens.errorMonitor.tabActive : tokens.errorMonitor.tabInactive}`}
        >
          {t("security_monitor.tab_events")}
        </button>
        <button
          onClick={() => setActiveTab("blocked")}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer
            ${activeTab === "blocked" ? tokens.errorMonitor.tabActive : tokens.errorMonitor.tabInactive}`}
        >
          {t("security_monitor.tab_blocked")} {blockedIps.filter(b => b.is_active).length > 0 ? `(${blockedIps.filter(b => b.is_active).length})` : ""}
        </button>
        <button
          onClick={() => setBanModalOpen((v) => !v)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 cursor-pointer transition-colors ml-auto"
        >
          <Plus size={13} /> {t("security_monitor.ban_manual")}
        </button>
      </div>

      {banModalOpen && (
        <div className={cx("p-6 sm:p-7 rounded-2xl border shadow-sm", tokens.surface.card, tokens.border.accent)}>
          <h2 className={cx("text-lg font-bold mb-5", tokens.text.onSurface)}>{t("security_monitor.ban_manual")}</h2>
          <div className="flex flex-col sm:flex-row gap-4 items-end">
            <div className="flex-1">
              <label className={cx("block text-sm font-medium mb-1.5", tokens.text.secondary)}>
                {t("security_monitor.ban_ip_label")}
              </label>
              <Input placeholder="203.0.113.42" value={banIpInput} onChange={(e) => setBanIpInput(e.target.value)} accent="indigo" />
            </div>
            <div className="flex-1">
              <label className={cx("block text-sm font-medium mb-1.5", tokens.text.secondary)}>
                {t("security_monitor.ban_reason_label")}
              </label>
              <Input placeholder={t("security_monitor.ban_reason_placeholder")} value={banReasonInput} onChange={(e) => setBanReasonInput(e.target.value)} accent="indigo" />
            </div>
            <Button
              variant="primary"
              onClick={submitBan}
              disabled={banSubmitting}
              isLoading={banSubmitting}
              icon={<Ban size={18} />}
              className="w-full sm:w-auto px-6 py-3.5 rounded-xl font-semibold shadow-md active:scale-95"
            >
              {t("security_monitor.ban_action")}
            </Button>
          </div>
        </div>
      )}

      {activeTab === "events" && (
        <>
          <div className="flex items-center gap-2 flex-wrap">
            <DropdownField
              className="w-56"
              value={eventTypeFilter}
              onChange={(v) => setEventTypeFilter(v as any)}
              options={[
                { value: "all", label: t("admin.status_all") },
                { value: "suspicious_path", label: t("security_monitor.event_suspicious_path") },
                { value: "blocked_request", label: t("security_monitor.event_blocked_request") },
                { value: "rate_limit_hit", label: t("security_monitor.event_rate_limit_hit") },
                { value: "auth_failure", label: t("security_monitor.event_auth_failure") },
              ]}
            />
          </div>

          <div className={cx("rounded-2xl border shadow-sm overflow-hidden", tokens.surface.card, tokens.border.default)}>
            {eventsLoading ? (
              <div className="py-16 flex items-center justify-center">
                <ShieldAlert className="animate-pulse text-red-500" size={28} />
              </div>
            ) : eventsError ? (
              <ErrorState onRetry={loadEvents} />
            ) : events.length === 0 ? (
              <EmptyState message={t("security_monitor.no_events_found")} />
            ) : (
              <ScrollableTableWrapper>
                <table className={cx("w-full text-left text-sm min-w-[860px]", tokens.text.label)}>
                  <thead className={cx("uppercase text-xs", tokens.text.muted, tokens.surface.subtle)}>
                    <tr className={tokens.divide.tableColumn}>
                      <th className="px-6 py-4 w-40">{t("security_monitor.col_type")}</th>
                      <th className="px-6 py-4 w-36">{t("security_monitor.col_ip")}</th>
                      <th className="px-6 py-4">{t("security_monitor.col_path")}</th>
                      <th className="px-6 py-4 w-28">{t("error_monitor.col_time")}</th>
                      <th className="px-6 py-4 w-24" />
                    </tr>
                  </thead>
                  <tbody className={cx("divide-y", tokens.errorMonitor.tableDivide)}>
                    {events.map((ev) => {
                      const cfg = EVENT_TYPE_CONFIG[ev.event_type];
                      return (
                        <tr key={ev.id} className={cx(tokens.errorMonitor.tableRowHover, tokens.divide.tableColumn)}>
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border ${cfg.bg} ${cfg.color}`}>
                              {t(`security_monitor.event_${ev.event_type}`)}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <span className={cx("font-mono text-xs", tokens.text.secondary)}>{ev.ip}</span>
                          </td>
                          <td className="px-6 py-4">
                            <p className={cx("font-mono text-xs line-clamp-1 break-all", tokens.text.muted)}>
                              {ev.method ? `${ev.method} ` : ""}{ev.path || "-"}
                            </p>
                          </td>
                          <td className={cx("px-6 py-4 text-xs whitespace-nowrap", tokens.text.muted)}>
                            {formatRelativeTime(ev.created_at)}
                          </td>
                          <td className="px-6 py-4">
                            <button
                              onClick={() => openBanModal(ev.ip)}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 cursor-pointer transition-colors"
                            >
                              <Ban size={11} /> {t("security_monitor.ban_action")}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </ScrollableTableWrapper>
            )}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-end gap-4 px-2 mt-4 font-sans text-xs text-slate-400">
              <span className={cx(tokens.text.onSurface, "font-medium")}>{page + 1} / {totalPages}</span>
              <div className="flex items-center gap-2">
                <button
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                  className={cx("p-2 rounded-xl border disabled:opacity-50 cursor-pointer", tokens.errorMonitor.paginationBtn, tokens.text.label, tokens.surface.card, tokens.hover.surface)}
                >
                  <ChevronLeft size={14} />
                </button>
                <button
                  disabled={page + 1 >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className={cx("p-2 rounded-xl border disabled:opacity-50 cursor-pointer", tokens.errorMonitor.paginationBtn, tokens.text.label, tokens.surface.card, tokens.hover.surface)}
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {activeTab === "blocked" && (
        <div className={cx("rounded-2xl border shadow-sm overflow-hidden", tokens.surface.card, tokens.border.default)}>
          {blockedLoading ? (
            <div className="py-16 flex items-center justify-center">
              <ShieldAlert className="animate-pulse text-red-500" size={28} />
            </div>
          ) : blockedError ? (
            <ErrorState onRetry={loadBlockedIps} />
          ) : blockedIps.length === 0 ? (
            <EmptyState message={t("security_monitor.no_blocked_ips")} />
          ) : (
            <ScrollableTableWrapper>
              <table className={cx("w-full text-left text-sm min-w-[860px]", tokens.text.label)}>
                <thead className={cx("uppercase text-xs", tokens.text.muted, tokens.surface.subtle)}>
                  <tr className={tokens.divide.tableColumn}>
                    <th className="px-6 py-4 w-36">{t("security_monitor.col_ip")}</th>
                    <th className="px-6 py-4">{t("security_monitor.col_reason")}</th>
                    <th className="px-6 py-4 w-28">{t("security_monitor.col_status")}</th>
                    <th className="px-6 py-4 w-32">{t("security_monitor.col_banned_at")}</th>
                    <th className="px-6 py-4 w-28" />
                  </tr>
                </thead>
                <tbody className={cx("divide-y", tokens.errorMonitor.tableDivide)}>
                  {blockedIps.map((b) => (
                    <tr key={b.id} className={cx(tokens.errorMonitor.tableRowHover, tokens.divide.tableColumn, !b.is_active ? "opacity-50" : "")}>
                      <td className="px-6 py-4">
                        <span className={cx("font-mono text-xs font-semibold", tokens.text.secondary)}>{b.ip}</span>
                      </td>
                      <td className="px-6 py-4">
                        <p className={cx("text-xs line-clamp-2", tokens.text.muted)}>{b.reason}</p>
                        {b.expires_at && (
                          <p className={cx("text-[10px] mt-0.5", tokens.text.muted)}>
                            {t("security_monitor.expires_at")} {formatDate(b.expires_at)}
                          </p>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {b.is_active ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-semibold bg-red-500/10 text-red-400 border border-red-500/20">
                            <ShieldX size={11} /> {t("security_monitor.status_banned")}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <ShieldCheck size={11} /> {t("security_monitor.status_unbanned")}
                          </span>
                        )}
                      </td>
                      <td className={cx("px-6 py-4 text-xs whitespace-nowrap", tokens.text.muted)}>
                        {formatRelativeTime(b.banned_at)}
                        {!b.banned_by && (
                          <p className="text-[10px] text-amber-400 mt-0.5">{t("security_monitor.auto_banned")}</p>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {b.is_active && (
                          <button
                            onClick={() => handleUnban(b.ip)}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 cursor-pointer transition-colors"
                          >
                            <Unlock size={11} /> {t("security_monitor.unban_action")}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollableTableWrapper>
          )}
        </div>
      )}

      {/* Confirmation helper Modal (unban) */}
      <Modal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        description={confirmModal.description}
        type={confirmModal.type}
        confirmLabel={t("admin.proceed")}
        cancelLabel={t("admin.cancel")}
        onConfirm={async () => {
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
          await confirmModal.action();
        }}
        onCancel={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
      />

      <LoadingOverlay isOpen={refreshing || actionLoading.isOpen} message={actionLoading.message || t("admin.loading_data")} />
    </CollapsingPageHeader>
  );
};
