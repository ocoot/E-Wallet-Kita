import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { AdminBackBar } from "../components/AdminBackBar";
import { supabase } from "../lib/supabase";
import { useLanguage } from "../contexts/LanguageContext";
import { useToast } from "../contexts/ToastContext";
import { useThemeTokens } from "../hooks/useThemeTokens";
import { useAdmin } from "../hooks/useAdmin";
import { LoadingOverlay } from "../components/LoadingOverlay";
import { ErrorState } from "../components/ErrorState";
import { EmptyState } from "../components/EmptyState";
import { ScrollableTableWrapper } from "../components/ScrollableTableWrapper";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { useLockBodyScroll } from "../hooks/useLockBodyScroll";
import { useDialogA11y } from "../hooks/useDialogA11y";
import {
  DatabaseBackup,
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  Clock,
  HardDrive,
  RotateCcw,
  Trash2,
  AlertTriangle,
  X,
} from "lucide-react";

interface BackupLogRow {
  id: string;
  status: "running" | "success" | "failed";
  triggered_by: "cron" | "manual" | "pre_restore";
  file_name: string | null;
  file_size_bytes: number | null;
  storage_provider: string;
  error_message: string | null;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  deleted_at: string | null;
  deleted_by: string | null;
}

interface RestoreLogRow {
  id: string;
  source_backup_log_id: string | null;
  status: "running" | "success" | "failed";
  scope: "full" | "table";
  table_names: string[] | null;
  triggered_by_admin: string | null;
  error_message: string | null;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
}

interface RestorableTable {
  table_name: string;
  label_id: string;
  label_en: string;
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return "-";
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

const RESTORE_CONFIRM_WORD = "RESTORE";
const DELETE_CONFIRM_WORD = "HAPUS";

export const AdminBackup: React.FC = () => {
  const { t, locale } = useLanguage();
  const { showToast } = useToast();
  const { isAdmin } = useAdmin();
  const { tokens, cx } = useThemeTokens();

  const [latest, setLatest] = useState<BackupLogRow | null>(null);
  const [history, setHistory] = useState<BackupLogRow[]>([]);
  const [restoreHistory, setRestoreHistory] = useState<RestoreLogRow[]>([]);
  const [restorableTables, setRestorableTables] = useState<RestorableTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [triggering, setTriggering] = useState(false);

  // Bulk delete
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  // Restore
  const [restoreTarget, setRestoreTarget] = useState<BackupLogRow | null>(null);
  const [restoreScope, setRestoreScope] = useState<"full" | "table">("full");
  const [restoreSelectedTables, setRestoreSelectedTables] = useState<Set<string>>(new Set());
  const [restoreConfirmText, setRestoreConfirmText] = useState("");
  const [restoreSubmitting, setRestoreSubmitting] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc("get_backup_status");
      if (error) throw error;
      setLatest(data?.latest ?? null);
      setHistory(Array.isArray(data?.history) ? data.history : []);
      setRestoreHistory(Array.isArray(data?.restore_history) ? data.restore_history : []);
      setLoadError(false);
    } catch (err: any) {
      console.error(err);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadRestorableTables = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("backup_restorable_tables")
        .select("table_name, label_id, label_en")
        .eq("is_enabled", true)
        .order("table_name");
      if (error) throw error;
      setRestorableTables(data ?? []);
    } catch (err) {
      // Soft-fail: fitur restore per-tabel jadi tidak bisa dipakai, tapi
      // halaman utama (status + trigger backup) tetap harus berfungsi.
      console.error("Gagal memuat daftar tabel yang boleh di-restore:", err);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) {
      loadStatus();
      loadRestorableTables();
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [isAdmin, loadStatus, loadRestorableTables]);

  const startPolling = () => {
    let attempts = 0;
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      attempts += 1;
      await loadStatus();
      if (attempts >= 24 && pollRef.current) {
        clearInterval(pollRef.current);
      }
    }, 5000);
  };

  const callBackupApi = async (body: Record<string, unknown>) => {
    const { data: sessionData } = await supabase.auth.getSession();
    const jwtToken = sessionData.session?.access_token;

    const res = await fetch("/api/admin/backup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${jwtToken}`,
      },
      body: JSON.stringify(body),
    });

    const result = await res.json();
    if (!res.ok) throw new Error(result?.error || "Request gagal");
    return result;
  };

  const handleTriggerBackup = async () => {
    setTriggering(true);
    try {
      await callBackupApi({ action: "backup" });
      showToast(t("admin.backup_trigger_success"), "success");
      startPolling();
    } catch (err: any) {
      showToast(err.message || t("admin.backup_trigger_error"), "error");
    } finally {
      setTriggering(false);
    }
  };

  // ── Restore ──────────────────────────────────────────────
  const openRestoreModal = (row: BackupLogRow) => {
    setRestoreTarget(row);
    setRestoreScope("full");
    setRestoreSelectedTables(new Set());
    setRestoreConfirmText("");
  };

  const closeRestoreModal = () => {
    if (restoreSubmitting) return;
    setRestoreTarget(null);
  };

  const toggleRestoreTable = (tableName: string) => {
    setRestoreSelectedTables(prev => {
      const next = new Set(prev);
      if (next.has(tableName)) next.delete(tableName);
      else next.add(tableName);
      return next;
    });
  };

  const restoreConfirmDisabled =
    restoreSubmitting ||
    restoreConfirmText.trim().toUpperCase() !== RESTORE_CONFIRM_WORD ||
    (restoreScope === "table" && restoreSelectedTables.size === 0);

  const handleConfirmRestore = async () => {
    if (!restoreTarget || restoreConfirmDisabled) return;
    setRestoreSubmitting(true);
    try {
      const result = await callBackupApi({
        action: "restore",
        backup_log_id: restoreTarget.id,
        scope: restoreScope,
        table_names: restoreScope === "table" ? Array.from(restoreSelectedTables) : undefined,
      });
      showToast(t("admin.backup_restore_success"), "success");
      setRestoreTarget(null);
      startPolling();
      void result;
    } catch (err: any) {
      showToast(err.message || t("admin.backup_restore_error"), "error");
    } finally {
      setRestoreSubmitting(false);
    }
  };

  const restorePanelRef = useRef<HTMLDivElement>(null);
  useLockBodyScroll(restoreTarget !== null);
  useDialogA11y(restoreTarget !== null, restorePanelRef, closeRestoreModal);

  // ── Bulk delete ──────────────────────────────────────────
  const selectableIds = useMemo(
    () => history.filter(h => h.status !== "running" && !h.deleted_at).map(h => h.id),
    [history]
  );

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIds(prev => {
      if (prev.size === selectableIds.length) return new Set();
      return new Set(selectableIds);
    });
  };

  const openDeleteModal = () => {
    if (selectedIds.size === 0) return;
    setDeleteConfirmText("");
    setDeleteModalOpen(true);
  };

  const deleteConfirmDisabled =
    deleteSubmitting || deleteConfirmText.trim().toUpperCase() !== DELETE_CONFIRM_WORD;

  const handleConfirmDelete = async () => {
    if (deleteConfirmDisabled) return;
    setDeleteSubmitting(true);
    try {
      const result = await callBackupApi({
        action: "delete",
        backup_log_ids: Array.from(selectedIds),
      });
      const skippedCount = Array.isArray(result?.skipped) ? result.skipped.length : 0;
      showToast(
        skippedCount > 0
          ? t("admin.backup_delete_success_partial", { skipped: skippedCount })
          : t("admin.backup_delete_success"),
        "success"
      );
      setSelectedIds(new Set());
      setDeleteModalOpen(false);
      startPolling();
    } catch (err: any) {
      showToast(err.message || t("admin.backup_delete_error"), "error");
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const deletePanelRef = useRef<HTMLDivElement>(null);
  useLockBodyScroll(deleteModalOpen);
  useDialogA11y(deleteModalOpen, deletePanelRef, () => !deleteSubmitting && setDeleteModalOpen(false));

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

  const statusBadge = (status: "running" | "success" | "failed") => {
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

  const restorableLabel = (tbl: RestorableTable) => (locale === "id" ? tbl.label_id : tbl.label_en);

  return (
    <div className="space-y-6">
      <AdminBackBar />

      <LoadingOverlay isOpen={triggering} message={t("admin.backup_triggering")} />

      {/* Card status terakhir */}
      <div className={cx("p-6 md:p-8 rounded-3xl border shadow-sm", tokens.surface.card, tokens.border.default)}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 flex items-center justify-center shrink-0">
              <DatabaseBackup className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <h3 className={tokens.adminBackup.heading}>
                {t("admin.backup_title")}
              </h3>
              <p className={cx("text-xs mt-1 max-w-md", tokens.text.muted)}>
                {t("admin.backup_description")}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={loadStatus}
              className={cx(tokens.adminBackup.btnSecondary, tokens.text.secondary)}
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
            <div className={tokens.adminBackup.cardBgBorder}>
              <p className={cx("text-[10px] uppercase font-black tracking-wider", tokens.text.mutedAlt)}>
                {t("admin.backup_last_status")}
              </p>
              {statusBadge(latest.status)}
            </div>
            <div className={tokens.adminBackup.cardBgBorder}>
              <p className={cx("text-[10px] uppercase font-black tracking-wider flex items-center gap-1", tokens.text.mutedAlt)}>
                <Clock className="w-3 h-3" /> {t("admin.backup_last_time")}
              </p>
              <p className={tokens.adminBackup.cardText}>
                {new Date(latest.started_at).toLocaleString(locale === "id" ? "id-ID" : "en-US")}
              </p>
            </div>
            <div className={tokens.adminBackup.cardBgBorder}>
              <p className={cx("text-[10px] uppercase font-black tracking-wider flex items-center gap-1", tokens.text.mutedAlt)}>
                <HardDrive className="w-3 h-3" /> {t("admin.backup_size")}
              </p>
              <p className={tokens.adminBackup.cardText}>
                {formatBytes(latest.file_size_bytes)}
              </p>
            </div>
            <div className={tokens.adminBackup.cardBgBorder}>
              <p className={cx("text-[10px] uppercase font-black tracking-wider", tokens.text.mutedAlt)}>
                {t("admin.backup_destination")}
              </p>
              <p className={cx(tokens.adminBackup.cardText, "capitalize")}>
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
      <div className={cx("p-6 md:p-8 rounded-3xl border shadow-sm", tokens.surface.card, tokens.border.default)}>
        <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
          <h3 className={cx("font-black text-sm", tokens.adminBackup.heading)}>
            {t("admin.backup_history")}
          </h3>
          {selectedIds.size > 0 && (
            <button
              onClick={openDeleteModal}
              className="px-3 py-2 text-xs font-black rounded-xl bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {t("admin.backup_delete_selected", { count: selectedIds.size })}
            </button>
          )}
        </div>

        {history.length === 0 ? (
          <EmptyState
            title={t("admin.backup_empty_title")}
            description={t("admin.backup_empty_description")}
          />
        ) : (
          <ScrollableTableWrapper>
            <table className="w-full text-xs">
              <thead>
                <tr className={cx(tokens.adminBackup.tableHeader, tokens.text.mutedAlt)}>
                  <th className="py-2 pr-3 w-8">
                    <input
                      type="checkbox"
                      aria-label={t("admin.backup_select_all")}
                      checked={selectableIds.length > 0 && selectedIds.size === selectableIds.length}
                      onChange={toggleSelectAll}
                      disabled={selectableIds.length === 0}
                      className="w-3.5 h-3.5 rounded accent-indigo-500 cursor-pointer"
                    />
                  </th>
                  <th className="py-2 pr-4">{t("admin.backup_col_time")}</th>
                  <th className="py-2 pr-4">{t("admin.backup_col_status")}</th>
                  <th className="py-2 pr-4">{t("admin.backup_col_trigger")}</th>
                  <th className="py-2 pr-4">{t("admin.backup_col_file")}</th>
                  <th className="py-2 pr-4">{t("admin.backup_size")}</th>
                  <th className="py-2 pr-4 text-right">{t("admin.backup_col_actions")}</th>
                </tr>
              </thead>
              <tbody>
                {history.map(row => {
                  const selectable = row.status !== "running" && !row.deleted_at;
                  return (
                    <tr
                      key={row.id}
                      className={cx(tokens.adminBackup.tableRow, row.deleted_at && "opacity-40")}
                    >
                      <td className="py-2.5 pr-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(row.id)}
                          onChange={() => toggleSelect(row.id)}
                          disabled={!selectable}
                          className="w-3.5 h-3.5 rounded accent-indigo-500 cursor-pointer disabled:cursor-not-allowed"
                        />
                      </td>
                      <td className={cx("py-2.5 pr-4 whitespace-nowrap", tokens.text.secondary)}>
                        {new Date(row.started_at).toLocaleString(locale === "id" ? "id-ID" : "en-US")}
                      </td>
                      <td className="py-2.5 pr-4">
                        {row.deleted_at ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black bg-slate-500/10 text-slate-400 border border-slate-500/20">
                            {t("admin.backup_deleted_badge")}
                          </span>
                        ) : (
                          statusBadge(row.status)
                        )}
                      </td>
                      <td className={cx("py-2.5 pr-4 capitalize", tokens.text.muted)}>
                        {row.triggered_by === "manual"
                          ? t("admin.backup_manual")
                          : row.triggered_by === "pre_restore"
                            ? t("admin.backup_pre_restore")
                            : t("admin.backup_scheduled")}
                      </td>
                      <td className={cx("py-2.5 pr-4 font-mono", tokens.text.muted)}>
                        {row.file_name || "-"}
                      </td>
                      <td className={cx("py-2.5 pr-4", tokens.text.muted)}>
                        {formatBytes(row.file_size_bytes)}
                      </td>
                      <td className="py-2.5 pr-4 text-right">
                        {row.status === "success" && !row.deleted_at && (
                          <button
                            onClick={() => openRestoreModal(row)}
                            title={t("admin.backup_restore")}
                            className="p-1.5 rounded-lg text-indigo-400 hover:bg-indigo-500/10 transition-colors cursor-pointer"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </ScrollableTableWrapper>
        )}
      </div>

      {/* Riwayat restore */}
      <div className={cx("p-6 md:p-8 rounded-3xl border shadow-sm", tokens.surface.card, tokens.border.default)}>
        <h3 className={cx("font-black text-sm mb-4", tokens.adminBackup.heading)}>
          {t("admin.backup_restore_history")}
        </h3>

        {restoreHistory.length === 0 ? (
          <EmptyState
            title={t("admin.backup_restore_empty_title")}
            description={t("admin.backup_restore_empty_description")}
          />
        ) : (
          <ScrollableTableWrapper>
            <table className="w-full text-xs">
              <thead>
                <tr className={cx(tokens.adminBackup.tableHeader, tokens.text.mutedAlt)}>
                  <th className="py-2 pr-4">{t("admin.backup_col_time")}</th>
                  <th className="py-2 pr-4">{t("admin.backup_col_status")}</th>
                  <th className="py-2 pr-4">{t("admin.backup_restore_col_scope")}</th>
                  <th className="py-2 pr-4">{t("admin.backup_restore_col_tables")}</th>
                </tr>
              </thead>
              <tbody>
                {restoreHistory.map(row => (
                  <tr
                    key={row.id}
                    className={tokens.adminBackup.tableRow}
                  >
                    <td className={cx("py-2.5 pr-4 whitespace-nowrap", tokens.text.secondary)}>
                      {new Date(row.started_at).toLocaleString(locale === "id" ? "id-ID" : "en-US")}
                    </td>
                    <td className="py-2.5 pr-4">{statusBadge(row.status)}</td>
                    <td className={cx("py-2.5 pr-4", tokens.text.muted)}>
                      {row.scope === "full"
                        ? t("admin.backup_restore_scope_full")
                        : t("admin.backup_restore_scope_table")}
                    </td>
                    <td className={cx("py-2.5 pr-4 font-mono", tokens.text.muted)}>
                      {row.table_names?.join(", ") || "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollableTableWrapper>
        )}
      </div>

      {/* ── Modal: konfirmasi restore ───────────────────────── */}
      {restoreTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs"
            onClick={closeRestoreModal}
          />
          <div
            ref={restorePanelRef}
            role="dialog"
            aria-modal="true"
            tabIndex={-1}
            className={cx("relative z-10 w-full max-w-md my-auto max-h-[85vh] overflow-y-auto rounded-2xl border border-amber-500/30 p-6 shadow-2xl outline-none", tokens.surface.card)}
          >
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="flex items-center gap-3">
                <div className="rounded-full p-2.5 bg-amber-500/15 text-amber-400 shrink-0">
                  <AlertTriangle size={20} />
                </div>
                <h3 className={cx("font-black text-sm", tokens.adminBackup.heading)}>
                  {t("admin.backup_restore_confirm_title")}
                </h3>
              </div>
              <button
                onClick={closeRestoreModal}
                className="text-slate-400 hover:text-slate-200 cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className={cx("text-xs mb-3 font-mono break-all", tokens.text.mutedAlt)}>
              {restoreTarget.file_name}
            </p>

            {/* Pilihan scope */}
            <div className="space-y-2 mb-4">
              <label className={tokens.adminBackup.label}>
                <input
                  type="radio"
                  name="restore_scope"
                  checked={restoreScope === "full"}
                  onChange={() => setRestoreScope("full")}
                  className="mt-0.5 accent-amber-500"
                />
                <span>
                  <span className={tokens.adminBackup.labelSpan}>
                    {t("admin.backup_restore_scope_full")}
                  </span>
                  <span className="block text-[11px] text-slate-500 mt-0.5">
                    {t("admin.backup_restore_warning_full")}
                  </span>
                </span>
              </label>

              <label className={tokens.adminBackup.label}>
                <input
                  type="radio"
                  name="restore_scope"
                  checked={restoreScope === "table"}
                  onChange={() => setRestoreScope("table")}
                  className="mt-0.5 accent-amber-500"
                />
                <span>
                  <span className={tokens.adminBackup.labelSpan}>
                    {t("admin.backup_restore_scope_table")}
                  </span>
                  <span className="block text-[11px] text-slate-500 mt-0.5">
                    {t("admin.backup_restore_warning_table")}
                  </span>
                </span>
              </label>
            </div>

            {restoreScope === "table" && (
              <div className="mb-4">
                <p className="text-[10px] uppercase font-black tracking-wider text-slate-400 mb-2">
                  {t("admin.backup_restore_select_tables")}
                </p>
                {restorableTables.length === 0 ? (
                  <p className="text-[11px] text-slate-500">
                    {t("admin.backup_restorable_table_fetch_error")}
                  </p>
                ) : (
                  <div className="grid grid-cols-1 gap-1.5 max-h-40 overflow-y-auto pr-1">
                    {restorableTables.map(tbl => (
                      <label
                        key={tbl.table_name}
                        className={cx("flex items-center gap-2 text-xs cursor-pointer", tokens.text.secondary)}
                      >
                        <input
                          type="checkbox"
                          checked={restoreSelectedTables.has(tbl.table_name)}
                          onChange={() => toggleRestoreTable(tbl.table_name)}
                          className="w-3.5 h-3.5 rounded accent-amber-500 cursor-pointer"
                        />
                        {restorableLabel(tbl)}
                        <span className="text-slate-600 font-mono text-[10px]">
                          ({tbl.table_name})
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="mb-5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-400 leading-relaxed">
              {t("admin.backup_restore_maintenance_notice")}
            </div>

            <Input
              label={t("admin.backup_restore_confirm_input_label", { word: RESTORE_CONFIRM_WORD })}
              placeholder={RESTORE_CONFIRM_WORD}
              value={restoreConfirmText}
              onChange={e => setRestoreConfirmText(e.target.value)}
              accent="danger"
              autoComplete="off"
            />

            <div className="flex items-center justify-end gap-3 mt-5">
              <Button variant="ghost" onClick={closeRestoreModal} disabled={restoreSubmitting}>
                {t("admin.backup_restore_cancel")}
              </Button>
              <Button
                variant="danger"
                onClick={handleConfirmRestore}
                disabled={restoreConfirmDisabled}
                isLoading={restoreSubmitting}
              >
                {t("admin.backup_restore_button_confirm")}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: konfirmasi bulk delete ───────────────────── */}
      {deleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs"
            onClick={() => !deleteSubmitting && setDeleteModalOpen(false)}
          />
          <div
            ref={deletePanelRef}
            role="dialog"
            aria-modal="true"
            tabIndex={-1}
            className={cx("relative z-10 w-full max-w-sm my-auto rounded-2xl border border-red-500/30 p-6 shadow-2xl outline-none", tokens.surface.card)}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="rounded-full p-2.5 bg-red-500/15 text-red-400 shrink-0">
                <Trash2 size={20} />
              </div>
              <h3 className={cx("font-black text-sm", tokens.adminBackup.heading)}>
                {t("admin.backup_delete_confirm_title")}
              </h3>
            </div>

            <p className={cx("text-xs mb-4", tokens.text.mutedAlt)}>
              {t("admin.backup_delete_confirm_desc", { count: selectedIds.size })}
            </p>

            <Input
              label={t("admin.backup_delete_confirm_input_label", { word: DELETE_CONFIRM_WORD })}
              placeholder={DELETE_CONFIRM_WORD}
              value={deleteConfirmText}
              onChange={e => setDeleteConfirmText(e.target.value)}
              accent="danger"
              autoComplete="off"
            />

            <div className="flex items-center justify-end gap-3 mt-5">
              <Button
                variant="ghost"
                onClick={() => setDeleteModalOpen(false)}
                disabled={deleteSubmitting}
              >
                {t("admin.backup_restore_cancel")}
              </Button>
              <Button
                variant="danger"
                onClick={handleConfirmDelete}
                disabled={deleteConfirmDisabled}
                isLoading={deleteSubmitting}
              >
                {t("admin.backup_delete_button_confirm")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
