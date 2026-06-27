import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { useLanguage } from "../contexts/LanguageContext";
import { useToast } from "../contexts/ToastContext";
import { useAdmin } from "../hooks/useAdmin";
import { useMaintenance } from "../contexts/MaintenanceContext";
import { LoadingOverlay } from "../components/LoadingOverlay";
import {
  Wrench,
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

  const [isActive, setIsActive] = useState(false);
  const [messageId, setMessageId] = useState("");
  const [messageEn, setMessageEn] = useState("");
  const [features, setFeatures] = useState<FeatureLockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingAction, setSavingAction] = useState<{ isOpen: boolean; message: string }>({
    isOpen: false,
    message: "",
  });

  const loadAll = useCallback(async () => {
    setLoading(true);
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
    } finally {
      setSavingAction({ isOpen: false, message: "" });
    }
  };

  const getFeatureLabel = (featureKey: string) => t(`admin.maintenance_feature.${featureKey}`);

  if (loading) {
    return <div className="py-12 text-center text-slate-500 text-sm light_sakura:text-rose-500">{t("admin.loading")}</div>;
  }

  return (
    <div className="space-y-6">
      {/* ── Global Maintenance Toggle ── */}
      <div className="bg-slate-900 light_sakura:bg-white p-8 rounded-3xl border border-slate-800 light_sakura:border-slate-100 shadow-sm space-y-6">
        <div className="border-b border-slate-800 light_sakura:border-slate-100 pb-5">
          <h2 className="font-bold text-xl text-white light_sakura:text-slate-800 flex items-center gap-2">
            <Wrench size={24} className="text-amber-500" />
            {t("admin.maintenance_title")}
          </h2>
          <p className="text-sm text-slate-400 light_sakura:text-slate-500 mt-1">
            {t("admin.maintenance_desc")}
          </p>
        </div>

        {/* Info: admin always bypass */}
        <div className="flex items-start gap-3 px-4 py-3 rounded-2xl bg-blue-950/30 border border-blue-800/40 light_sakura:bg-blue-50 light_sakura:border-blue-100">
          <Info size={16} className="text-blue-400 light_sakura:text-blue-500 mt-0.5 shrink-0" />
          <p className="text-xs text-blue-300 light_sakura:text-blue-600 leading-relaxed">
            {t("admin.maintenance_admin_bypass_note")}
          </p>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className={`p-3 rounded-2xl border ${isActive ? "bg-amber-900/20 light_sakura:bg-amber-50 border-amber-800/50 light_sakura:border-amber-100 text-amber-500 light_sakura:text-amber-600" : "bg-slate-800 light_sakura:bg-slate-50 border-slate-700 light_sakura:border-slate-100 text-slate-500"}`}>
              <Power size={20} />
            </div>
            <div>
              <p className="font-semibold text-white light_sakura:text-slate-900">
                {t("admin.maintenance_global_toggle_label")}
              </p>
              <p className="text-xs text-slate-400 light_sakura:text-slate-500">
                {isActive ? t("admin.maintenance_status_on") : t("admin.maintenance_status_off")}
              </p>
            </div>
          </div>

          <button
            onClick={() => setIsActive(v => !v)}
            className={`relative w-14 h-7 rounded-full transition-colors cursor-pointer shrink-0
              ${isActive ? "bg-amber-600" : "bg-slate-700 light_sakura:bg-slate-200"}`}
            aria-pressed={isActive}
          >
            <span
              className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white shadow transition-transform
                ${isActive ? "translate-x-7" : "translate-x-0"}`}
            />
          </button>
        </div>

        {/* Running text message editors */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-slate-300 light_sakura:text-slate-700 mb-2 flex items-center gap-2">
              <MessageSquareWarning size={16} /> {t("admin.maintenance_message_id_label")}
            </label>
            <textarea
              value={messageId}
              onChange={e => setMessageId(e.target.value)}
              rows={3}
              className="w-full px-4 py-3 rounded-2xl text-sm bg-slate-800 light_sakura:bg-slate-50 border border-slate-700 light_sakura:border-slate-200 text-white light_sakura:text-slate-900 placeholder-slate-500 focus:ring-2 focus:ring-amber-500 resize-none leading-relaxed"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 light_sakura:text-slate-700 mb-2 flex items-center gap-2">
              <MessageSquareWarning size={16} /> {t("admin.maintenance_message_en_label")}
            </label>
            <textarea
              value={messageEn}
              onChange={e => setMessageEn(e.target.value)}
              rows={3}
              className="w-full px-4 py-3 rounded-2xl text-sm bg-slate-800 light_sakura:bg-slate-50 border border-slate-700 light_sakura:border-slate-200 text-white light_sakura:text-slate-900 placeholder-slate-500 focus:ring-2 focus:ring-amber-500 resize-none leading-relaxed"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <button
            onClick={loadAll}
            className="px-6 py-3 text-sm font-semibold rounded-xl border border-slate-700 light_sakura:border-slate-200 hover:bg-slate-800 light_sakura:hover:bg-slate-50 text-slate-300 light_sakura:text-slate-600 cursor-pointer flex items-center gap-2"
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
      <div className="bg-slate-900 light_sakura:bg-white rounded-3xl border border-slate-800 light_sakura:border-slate-100 shadow-sm overflow-hidden">
        <div className="px-8 py-6 border-b border-slate-800 light_sakura:border-slate-100">
          <p className="font-semibold text-white light_sakura:text-slate-900">
            {t("admin.maintenance_feature_lock_title")}
          </p>
          <p className="text-xs text-slate-400 light_sakura:text-slate-500 mt-1">
            {t("admin.maintenance_feature_lock_desc")}
          </p>

          {/* Legend header */}
          <div className="flex items-center gap-6 mt-4">
            <div className="flex items-center gap-2 text-xs text-slate-400 light_sakura:text-slate-500">
              <Lock size={13} className="text-red-400" />
              <span>{t("admin.maintenance_col_lock")}</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-400 light_sakura:text-slate-500">
              <FlaskConical size={13} className="text-violet-400" />
              <span>{t("admin.maintenance_col_sandbox_bypass")}</span>
            </div>
          </div>
        </div>

        <div className="divide-y divide-slate-800 light_sakura:divide-slate-100">
          {features.map(feature => (
            <div key={feature.feature_key} className="flex items-center gap-6 px-8 py-5">
              {/* Icon + label */}
              <div className="flex items-center gap-4 flex-1 min-w-0">
                <div
                  className={`p-3 rounded-xl border shrink-0 ${
                    feature.is_locked
                      ? "bg-red-950/40 light_sakura:bg-red-50 border-red-900/50 light_sakura:border-red-100 text-red-400 light_sakura:text-red-600"
                      : "bg-emerald-950/40 light_sakura:bg-emerald-50 border-emerald-900/50 light_sakura:border-emerald-100 text-emerald-400 light_sakura:text-emerald-600"
                  }`}
                >
                  {feature.is_locked ? <Lock size={18} /> : <Unlock size={18} />}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white light_sakura:text-slate-900 truncate">
                    {getFeatureLabel(feature.feature_key)}
                  </p>
                  <p className="text-xs text-slate-400 light_sakura:text-slate-500 mt-0.5">
                    <code className="text-slate-500 light_sakura:text-slate-400 text-[10px]">
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
                  <FlaskConical size={14} className="text-violet-400 light_sakura:text-violet-500" />
                  <button
                    onClick={() =>
                      handleToggleSandboxBypass(feature.feature_key, !feature.bypass_in_sandbox)
                    }
                    disabled={!feature.is_locked}
                    className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer shrink-0
                      ${feature.bypass_in_sandbox ? "bg-violet-600" : "bg-slate-700 light_sakura:bg-slate-200"}`}
                    aria-pressed={feature.bypass_in_sandbox}
                    aria-label={`Sandbox bypass ${feature.feature_key}`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform
                        ${feature.bypass_in_sandbox ? "translate-x-5" : "translate-x-0"}`}
                    />
                  </button>
                </div>

                {/* Lock / Unlock main toggle */}
                <button
                  onClick={() => handleToggleFeature(feature.feature_key, !feature.is_locked)}
                  className={`relative w-14 h-7 rounded-full transition-colors cursor-pointer shrink-0
                    ${feature.is_locked ? "bg-red-600" : "bg-slate-700 light_sakura:bg-slate-200"}`}
                  aria-pressed={feature.is_locked}
                  aria-label={`Lock ${feature.feature_key}`}
                >
                  <span
                    className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white shadow transition-transform
                      ${feature.is_locked ? "translate-x-7" : "translate-x-0"}`}
                  />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <LoadingOverlay isOpen={savingAction.isOpen} message={savingAction.message} />
    </div>
  );
};
