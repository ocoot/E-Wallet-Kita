import React, { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../lib/supabase";
import { useLanguage } from "../contexts/LanguageContext";
import { useToast } from "../contexts/ToastContext";
import { useAdmin } from "../hooks/useAdmin";
import { LoadingOverlay } from "../components/LoadingOverlay";
import { ErrorState } from "../components/ErrorState";
import { EmptyState } from "../components/EmptyState";
import { ScrollableTableWrapper } from "../components/ScrollableTableWrapper";
import {
  DatabaseBackup,
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  Clock,
  HardDrive,
} from "lucide-react";

interface BackupLogRow {
  id: string;
  status: "running" | "success" | "failed";
  triggered_by: "cron" | "manual";
  file_name: string | null;
  file_size_bytes: number | null;
  storage_provider: string;
  error_message: string | null;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return "-";
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

export const AdminBackup: React.FC = () => {
  const { t, locale } = useLanguage();
  const { showToast } = useToast();
  const { isAdmin } = useAdmin();

  const [latest, setLatest] = useState<BackupLogRow | null>(null);
  const [history, setHistory] = useState<BackupLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [triggering, setTriggering] = useState(false);

  // Dipakai untuk polling singkat setelah tombol "Backup Sekarang" ditekan,
  // karena workflow GitHub Actions butuh beberapa detik untuk mulai &
  // baris log baru muncul di backup_logs.
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc("get_backup_status");
      if (error) throw error;
      setLatest(data?.latest ?? null);
      setHistory(Array.isArray(data?.history) ? data.history : []);
      setLoadError(false);
    } catch (err: any) {
      console.error(err);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) loadStatus();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [isAdmin, loadStatus]);

  const handleTriggerBackup = async () => {
    setTriggering(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const jwtToken = sessionData.session?.access_token;

      const res = await fetch("/api/admin/backup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${jwtToken}`,
        },
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result?.error || "Gagal memicu backup");

      showToast(t("admin.backup_trigger_success"), "success");

      // Poll status tiap 5 detik selama 2 menit supaya baris "running" lalu
      // "success"/"failed" dari GitHub Actions kelihatan tanpa refresh manual.
      let attempts = 0;
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        attempts += 1;
        await loadStatus();
        if (attempts >= 24 && pollRef.current) {
          clearInterval(pollRef.current);
        }
      }, 5000);
    } catch (err: any) {
      showToast(err.message || t("admin.backup_trigger_error"), "error");
    } finally {
      setTriggering(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (loadError) {
    return <ErrorState onRetry={loadStatus} />;
  }

  const statusBadge = (status: BackupLogRow["status"]) => {
    if (status === "success")
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          <CheckCircle2 className="w-3 h-3" /> {t("admin.backup_status_success")}
        </span>
      );
    if (status === "failed")
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black bg-red-500/10 text-red-400 border border-red-500/20">
          <XCircle className="w-3 h-3" /> {t("admin.backup_status_failed")}
        </span>
      );
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black bg-amber-500/10 text-amber-400 border border-amber-500/20">
        <Loader2 className="w-3 h-3 animate-spin" /> {t("admin.backup_status_running")}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      <LoadingOverlay isOpen={triggering} message={t("admin.backup_triggering")} />

      {/* Card status terakhir */}
      <div className="bg-slate-900 light_sakura:bg-white p-6 md:p-8 rounded-3xl border border-slate-800 light_sakura:border-slate-100 shadow-sm">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 flex items-center justify-center shrink-0">
              <DatabaseBackup className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <h3 className="font-black text-sm text-slate-100 light_sakura:text-slate-800">
                {t("admin.backup_title")}
              </h3>
              <p className="text-xs text-slate-400 light_sakura:text-slate-500 mt-1 max-w-md">
                {t("admin.backup_description")}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={loadStatus}
              className="px-3 py-2 text-xs font-bold rounded-xl border border-slate-800 hover:bg-slate-800 transition-colors cursor-pointer text-slate-300 light_sakura:border-rose-200 light_sakura:text-slate-700 light_sakura:hover:bg-rose-100 flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              {t("admin.refresh")}
            </button>
            <button
              onClick={handleTriggerBackup}
              disabled={triggering || latest?.status === "running"}
              className="px-4 py-2 text-xs font-black rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              <DatabaseBackup className="w-3.5 h-3.5" />
              {t("admin.backup_trigger_now")}
            </button>
          </div>
        </div>

        {latest ? (
          <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4 space-y-1.5 light_sakura:bg-rose-100/10 light_sakura:border-rose-200">
              <p className="text-[10px] uppercase font-black tracking-wider text-slate-400 light_sakura:text-slate-600">
                {t("admin.backup_last_status")}
              </p>
              {statusBadge(latest.status)}
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4 space-y-1.5 light_sakura:bg-rose-100/10 light_sakura:border-rose-200">
              <p className="text-[10px] uppercase font-black tracking-wider text-slate-400 light_sakura:text-slate-600 flex items-center gap-1">
                <Clock className="w-3 h-3" /> {t("admin.backup_last_time")}
              </p>
              <p className="text-xs font-bold text-slate-200 light_sakura:text-slate-700">
                {new Date(latest.started_at).toLocaleString(locale === "id" ? "id-ID" : "en-US")}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4 space-y-1.5 light_sakura:bg-rose-100/10 light_sakura:border-rose-200">
              <p className="text-[10px] uppercase font-black tracking-wider text-slate-400 light_sakura:text-slate-600 flex items-center gap-1">
                <HardDrive className="w-3 h-3" /> {t("admin.backup_size")}
              </p>
              <p className="text-xs font-bold text-slate-200 light_sakura:text-slate-700">
                {formatBytes(latest.file_size_bytes)}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4 space-y-1.5 light_sakura:bg-rose-100/10 light_sakura:border-rose-200">
              <p className="text-[10px] uppercase font-black tracking-wider text-slate-400 light_sakura:text-slate-600">
                {t("admin.backup_destination")}
              </p>
              <p className="text-xs font-bold text-slate-200 light_sakura:text-slate-700 capitalize">
                Google Drive
              </p>
            </div>
          </div>
        ) : (
          <div className="mt-6">
            <EmptyState
              title={t("admin.backup_empty_title")}
              description={t("admin.backup_empty_description")}
            />
          </div>
        )}

        {latest?.status === "failed" && latest.error_message && (
          <div className="mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400">
            {latest.error_message}
          </div>
        )}
      </div>

      {/* Riwayat backup */}
      <div className="bg-slate-900 light_sakura:bg-white p-6 md:p-8 rounded-3xl border border-slate-800 light_sakura:border-slate-100 shadow-sm">
        <h3 className="font-black text-sm text-slate-100 light_sakura:text-slate-800 mb-4">
          {t("admin.backup_history")}
        </h3>

        {history.length === 0 ? (
          <EmptyState
            title={t("admin.backup_empty_title")}
            description={t("admin.backup_empty_description")}
          />
        ) : (
          <ScrollableTableWrapper>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[10px] uppercase font-black tracking-wider text-slate-400 light_sakura:text-slate-600 border-b border-slate-800 light_sakura:border-slate-200">
                  <th className="py-2 pr-4">{t("admin.backup_col_time")}</th>
                  <th className="py-2 pr-4">{t("admin.backup_col_status")}</th>
                  <th className="py-2 pr-4">{t("admin.backup_col_trigger")}</th>
                  <th className="py-2 pr-4">{t("admin.backup_col_file")}</th>
                  <th className="py-2 pr-4">{t("admin.backup_size")}</th>
                </tr>
              </thead>
              <tbody>
                {history.map(row => (
                  <tr
                    key={row.id}
                    className="border-b border-slate-800/50 light_sakura:border-slate-100 last:border-0"
                  >
                    <td className="py-2.5 pr-4 whitespace-nowrap text-slate-300 light_sakura:text-slate-700">
                      {new Date(row.started_at).toLocaleString(locale === "id" ? "id-ID" : "en-US")}
                    </td>
                    <td className="py-2.5 pr-4">{statusBadge(row.status)}</td>
                    <td className="py-2.5 pr-4 capitalize text-slate-400 light_sakura:text-slate-500">
                      {row.triggered_by === "manual" ? t("admin.backup_manual") : t("admin.backup_scheduled")}
                    </td>
                    <td className="py-2.5 pr-4 text-slate-400 light_sakura:text-slate-500 font-mono">
                      {row.file_name || "-"}
                    </td>
                    <td className="py-2.5 pr-4 text-slate-400 light_sakura:text-slate-500">
                      {formatBytes(row.file_size_bytes)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollableTableWrapper>
        )}
      </div>
    </div>
  );
};
