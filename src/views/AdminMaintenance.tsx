import React, { useState, useEffect, useCallback } from "react";
import { AdminBackBar } from "../components/AdminBackBar";
import { ToggleSwitch } from "../components/ui/ToggleSwitch";
import { supabase } from "../lib/supabase";
import { useLanguage } from "../contexts/LanguageContext";
import { useToast } from "../contexts/ToastContext";
import { useThemeTokens } from "../hooks/useThemeTokens";
import { useAdmin } from "../hooks/useAdmin";
import { useMaintenance } from "../contexts/MaintenanceContext";
import { LoadingOverlay } from "../components/LoadingOverlay";
import { ErrorState } from "../components/ErrorState";
import { reportFrontendError } from "../lib/errorReporter";
import {
  Power,
  Lock,
  Unlock,
  MessageSquareWarning,
  RefreshCw,
  Save,
  FlaskConical,
  Info,
} from "lucide-react";

interface FeatureLockRow {
  feature_key: string;
  is_locked: boolean;
  /** Jika true, fitur tidak dikunci di lingkungan dev/sandbox meski is_locked=true. */
  bypass_in_sandbox: boolean;
}

export const AdminMaintenance: React.FC = () => {
  const { t } = useLanguage();
  const { showToast } = useToast();
  const { isAdmin } = useAdmin();
  const { refresh } = useMaintenance();
  const { tokens, cx } = useThemeTokens();

  const [isActive, setIsActive] = useState(false);
  const [messageId, setMessageId] = useState("");
  const [messageEn, setMessageEn] = useState("");
  const [features, setFeatures] = useState<FeatureLockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [savingAction, setSavingAction] = useState<{ isOpen: boolean; message: string }>({
    isOpen: false,
    message: "",
  });

  const loadAll = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const { data, error } = await supabase.rpc("get_maintenance_status");
      if (error) throw error;
      setIsActive(!!data?.is_active);
      setMessageId(data?.message_id || "");
      setMessageEn(data?.message_en || "");
      setFeatures(
        Array.isArray(data?.locked_features)
          ? data.locked_features.map((f: any) => ({
              feature_key: f.feature_key,
              is_locked: !!f.is_locked,
              bypass_in_sandbox: !!f.bypass_in_sandbox,
            }))
          : []
      );
    } catch (err: any) {
      showToast(err.message || t("admin.maintenance_load_error"), "error");
      setLoadError(true);
      void reportFrontendError({
        source: "frontend:admin-maintenance",
        message: err?.message || String(err),
        context: { action: "load-all" },
      });
    } finally {
      setLoading(false);
    }
  }, [showToast, t]);

  useEffect(() => {
    if (isAdmin) loadAll();
  }, [isAdmin, loadAll]);

  const handleSaveGlobal = async () => {
    setSavingAction({ isOpen: true, message: t("admin.maintenance_saving") });
    try {
      const { error } = await supabase.rpc("admin_set_maintenance_mode", {
        p_is_active: isActive,
        p_message_id: messageId,
        p_message_en: messageEn,
      });
      if (error) throw error;
      showToast(t("admin.maintenance_save_success"), "success");
      await refresh();
      await loadAll();
    } catch (err: any) {
      showToast(err.message || t("admin.maintenance_save_error"), "error");
      void reportFrontendError({
        source: "frontend:admin-maintenance",
        message: err?.message || String(err),
        context: { action: "save-maintenance-mode" },
      });
    } finally {
      setSavingAction({ isOpen: false, message: "" });
    }
  };

  const handleToggleFeature = async (featureKey: string, nextLocked: boolean) => {
    setSavingAction({ isOpen: true, message: t("admin.maintenance_saving") });
    try {
      const { error } = await supabase.rpc("admin_set_feature_lock", {
        p_feature_key: featureKey,
        p_is_locked: nextLocked,
      });
      if (error) throw error;
      setFeatures(prev =>
        prev.map(f => (f.feature_key === featureKey ? { ...f, is_locked: nextLocked } : f))
      );
      showToast(t("admin.maintenance_feature_update_success"), "success");
      await refresh();
    } catch (err: any) {
      showToast(err.message || t("admin.maintenance_feature_update_error"), "error");
      void reportFrontendError({
        source: "frontend:admin-maintenance",
        message: err?.message || String(err),
        context: { action: "toggle-feature-lock", featureKey, nextLocked },
      });
    } finally {
      setSavingAction({ isOpen: false, message: "" });
    }
  };

  /**
   * Toggle bypass_in_sandbox per fitur. Memanggil RPC terpisah agar
   * tidak menimpa status is_locked yang mungkin sedang aktif.
   */
  const handleToggleSandboxBypass = async (featureKey: string, nextBypass: boolean) => {
    setSavingAction({ isOpen: true, message: t("admin.maintenance_saving") });
    try {
      const { error } = await supabase.rpc("admin_set_feature_sandbox_bypass", {
        p_feature_key: featureKey,
        p_bypass_in_sandbox: nextBypass,
      });
      if (error) throw error;
      setFeatures(prev =>
        prev.map(f =>
          f.feature_key === featureKey ? { ...f, bypass_in_sandbox: nextBypass } : f
        )
      );
      showToast(t("admin.maintenance_feature_update_success"), "success");
      await refresh();
    } catch (err: any) {
      showToast(err.message || t("admin.maintenance_feature_update_error"), "error");
      void reportFrontendError({
        source: "frontend:admin-maintenance",
        message: err?.message || String(err),
        context: { action: "toggle-sandbox-bypass", featureKey, nextBypass },
      });
    } finally {
      setSavingAction({ isOpen: false, message: "" });
    }
  };

  const getFeatureLabel = (featureKey: string) => t(`admin.maintenance_feature.${featureKey}`);

  if (loading) {
    return <div className={cx("py-12 text-center", tokens.adminMaintenance.loadingText)}>{t("admin.loading")}</div>;
  }

  if (loadError) {
    return <ErrorState onRetry={loadAll} />;
  }

  return (
    <div className="space-y-6">
      <div className="relative">
        <div>
          <AdminBackBar />
        </div>
      </div>

      {/* ── Global Maintenance Toggle ── */}
      <div className={cx("p-6 sm:p-7 lg:p-8 space-y-6 rounded-2xl border shadow-sm", tokens.surface.card, tokens.border.accent)}>
        <div className={cx("border-b pb-5", tokens.border.default)}>
          <h1 className={cx("font-sans font-bold text-2xl tracking-tight", tokens.text.heading)}>
            {t("admin.maintenance_title")}
          </h1>
          <p className={cx("text-sm mt-1", tokens.text.muted)}>
            {t("admin.maintenance_desc")}
          </p>
        </div>

        {/* Info: admin always bypass */}
        <div className={cx("flex items-start gap-3 px-4 py-3 rounded-2xl", tokens.adminMaintenance.bypassNoteBanner)}>
          <Info size={16} className={cx("mt-0.5 shrink-0", tokens.adminMaintenance.bypassNoteIcon)} />
          <p className={cx("text-xs leading-relaxed", tokens.adminMaintenance.bypassNoteText)}>
            {t("admin.maintenance_admin_bypass_note")}
          </p>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className={`p-3 rounded-2xl border ${isActive ? tokens.adminMaintenance.toggleIconActive : tokens.toggle.inactiveIconBox}`}>
              <Power size={20} />
            </div>
            <div>
              <p className={cx("font-semibold", tokens.text.primary)}>
                {t("admin.maintenance_global_toggle_label")}
              </p>
              <p className={cx("text-xs", tokens.text.muted)}>
                {isActive ? t("admin.maintenance_status_on") : t("admin.maintenance_status_off")}
              </p>
            </div>
          </div>

          <ToggleSwitch
            checked={isActive}
            onChange={setIsActive}
            label={t("admin.maintenance_global_toggle_label")}
            tone="amber"
            size="lg"
            hideLabel
          />
        </div>

        {/* Running text message editors */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className={cx("block text-sm font-medium mb-2 flex items-center gap-2", tokens.text.secondary)}>
              <MessageSquareWarning size={16} /> {t("admin.maintenance_message_id_label")}
            </label>
            <textarea
              value={messageId}
              onChange={e => setMessageId(e.target.value)}
              rows={3}
              className={cx("w-full px-4 py-3 rounded-2xl text-sm border placeholder-slate-500 focus:ring-2 focus:ring-amber-500 resize-none leading-relaxed", tokens.text.primary, tokens.surface.subtle, tokens.border.strong)}
            />
          </div>
          <div>
            <label className={cx("block text-sm font-medium mb-2 flex items-center gap-2", tokens.text.secondary)}>
              <MessageSquareWarning size={16} /> {t("admin.maintenance_message_en_label")}
            </label>
            <textarea
              value={messageEn}
              onChange={e => setMessageEn(e.target.value)}
              rows={3}
              className={cx("w-full px-4 py-3 rounded-2xl text-sm border placeholder-slate-500 focus:ring-2 focus:ring-amber-500 resize-none leading-relaxed", tokens.text.primary, tokens.surface.subtle, tokens.border.strong)}
            />
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <button
            onClick={loadAll}
            className={cx("px-6 py-3 text-sm font-semibold rounded-xl border cursor-pointer flex items-center gap-2", tokens.text.label, tokens.border.strong, tokens.hover.surface)}
          >
            <RefreshCw size={16} /> {t("admin.refresh")}
          </button>
          <button
            onClick={handleSaveGlobal}
            className="px-6 py-3 text-sm font-semibold rounded-xl bg-amber-600 text-white hover:bg-amber-700 cursor-pointer flex items-center gap-2"
          >
            <Save size={16} /> {t("admin.maintenance_save_btn")}
          </button>
        </div>
      </div>

      {/* ── Per-feature lock list ── */}
      <div className={cx("rounded-2xl border shadow-sm overflow-hidden", tokens.surface.card, tokens.border.default)}>
        <div className={cx("px-8 py-6 border-b", tokens.border.default)}>
          <p className={cx("font-semibold", tokens.text.primary)}>
            {t("admin.maintenance_feature_lock_title")}
          </p>
          <p className={cx("text-xs mt-1", tokens.text.muted)}>
            {t("admin.maintenance_feature_lock_desc")}
          </p>

          {/* Legend header */}
          <div className="flex items-center gap-6 mt-4">
            <div className={cx("flex items-center gap-2 text-xs", tokens.text.muted)}>
              <Lock size={13} className="text-red-400" />
              <span>{t("admin.maintenance_col_lock")}</span>
            </div>
            <div className={cx("flex items-center gap-2 text-xs", tokens.text.muted)}>
              <FlaskConical size={13} className="text-violet-400" />
              <span>{t("admin.maintenance_col_sandbox_bypass")}</span>
            </div>
          </div>
        </div>

        <div className={cx("divide-y", tokens.errorMonitor.tableDivide)}>
          {features.map(feature => (
            <div key={feature.feature_key} className="flex items-center gap-6 px-8 py-5">
              {/* Icon + label */}
              <div className="flex items-center gap-4 flex-1 min-w-0">
                <div
                  className={`p-3 rounded-xl border shrink-0 ${
                    feature.is_locked
                      ? tokens.adminMaintenance.featureIconLocked
                      : tokens.adminMaintenance.featureIconUnlocked
                  }`}
                >
                  {feature.is_locked ? <Lock size={18} /> : <Unlock size={18} />}
                </div>
                <div className="min-w-0">
                  <p className={cx("text-sm font-semibold truncate", tokens.text.primary)}>
                    {getFeatureLabel(feature.feature_key)}
                  </p>
                  <p className={cx("text-xs mt-0.5", tokens.text.muted)}>
                    <code className={cx("text-[clamp(0.5625rem,2.6vw,0.625rem)]", tokens.text.faint)}>
                      {feature.feature_key}
                    </code>
                  </p>
                </div>
              </div>

              {/* Controls: Lock toggle + Sandbox bypass toggle */}
              <div className="flex items-center gap-5 shrink-0">
                {/* Sandbox bypass toggle — hanya tampil jika fitur sedang dikunci */}
                <div
                  className={`flex items-center gap-2 transition-opacity ${
                    feature.is_locked ? "opacity-100" : "opacity-30 pointer-events-none"
                  }`}
                  title={t("admin.maintenance_sandbox_bypass_tooltip")}
                >
                  <FlaskConical size={14} className={tokens.adminMaintenance.sandboxIcon} />
                  <ToggleSwitch
                    checked={feature.bypass_in_sandbox}
                    onChange={(next) => handleToggleSandboxBypass(feature.feature_key, next)}
                    disabled={!feature.is_locked}
                    label={`Sandbox bypass ${feature.feature_key}`}
                    tone="violet"
                    hideLabel
                  />
                </div>

                {/* Lock / Unlock main toggle */}
                <ToggleSwitch
                  checked={feature.is_locked}
                  onChange={(next) => handleToggleFeature(feature.feature_key, next)}
                  label={`Lock ${feature.feature_key}`}
                  tone="danger"
                  size="lg"
                  hideLabel
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <LoadingOverlay isOpen={savingAction.isOpen} message={savingAction.message} />
    </div>
  );
};
