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
} from "lucide-react";

interface FeatureLockRow {
  feature_key: string;
  is_locked: boolean;
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
      setFeatures(Array.isArray(data?.locked_features) ? data.locked_features : []);
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

  // Label tampilan per fitur ditarik dari kamus i18n menggunakan feature_key
  // sebagai bagian dari translation key, supaya tidak ada teks fitur yang
  // di-hardcode di komponen ini.
  const getFeatureLabel = (featureKey: string) => t(`admin.maintenance_feature.${featureKey}`);

  if (loading) {
    return <div className="py-12 text-center text-slate-500 text-sm light_sakura:text-rose-500">{t("admin.loading")}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="bg-slate-900 light_sakura:bg-white p-8 rounded-3xl border border-slate-800 light_sakura:border-slate-100 shadow-sm space-y-6">
        {/* Header inside Card Container */}
        <div className="border-b border-slate-800 light_sakura:border-slate-100 pb-5">
          <h2 className="font-bold text-xl text-white light_sakura:text-slate-800 flex items-center gap-2">
            <Wrench size={24} className="text-amber-500" />
            {t("admin.maintenance_title")}
          </h2>
          <p className="text-sm text-slate-400 light_sakura:text-slate-500 mt-1">
            {t("admin.maintenance_desc")}
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

          {/* Switch */}
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

      {/* Per-feature lock list */}
      <div className="bg-slate-900 light_sakura:bg-white rounded-3xl border border-slate-800 light_sakura:border-slate-100 shadow-sm overflow-hidden">
        <div className="px-8 py-6 border-b border-slate-800 light_sakura:border-slate-100">
          <p className="font-semibold text-white light_sakura:text-slate-900">
            {t("admin.maintenance_feature_lock_title")}
          </p>
          <p className="text-xs text-slate-400 light_sakura:text-slate-500 mt-1">
            {t("admin.maintenance_feature_lock_desc")}
          </p>
        </div>

        <div className="divide-y divide-slate-800 light_sakura:divide-slate-100">
          {features.map(feature => (
            <div key={feature.feature_key} className="flex items-center justify-between gap-6 px-8 py-5">
              <div className="flex items-center gap-4">
                <div className={`p-3 rounded-xl border ${feature.is_locked ? "bg-red-950/40 light_sakura:bg-red-50 border-red-900/50 light_sakura:border-red-100 text-red-400 light_sakura:text-red-600" : "bg-emerald-950/40 light_sakura:bg-emerald-50 border-emerald-900/50 light_sakura:border-emerald-100 text-emerald-400 light_sakura:text-emerald-600"}`}>
                  {feature.is_locked ? <Lock size={18} /> : <Unlock size={18} />}
                </div>
                <div>
                  <p className="text-sm font-semibold text-white light_sakura:text-slate-900">
                    {getFeatureLabel(feature.feature_key)}
                  </p>
                  <p className="text-xs text-slate-400 light_sakura:text-slate-500">
                    {feature.is_locked ? t("admin.maintenance_feature_locked") : t("admin.maintenance_feature_unlocked")}
                  </p>
                </div>
              </div>

              <button
                onClick={() => handleToggleFeature(feature.feature_key, !feature.is_locked)}
                className={`relative w-14 h-7 rounded-full transition-colors cursor-pointer shrink-0
                  ${feature.is_locked ? "bg-red-600" : "bg-slate-700 light_sakura:bg-slate-200"}`}
                aria-pressed={feature.is_locked}
              >
                <span
                  className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white shadow transition-transform
                    ${feature.is_locked ? "translate-x-7" : "translate-x-0"}`}
                />
              </button>
            </div>
          ))}
        </div>
      </div>

      <LoadingOverlay isOpen={savingAction.isOpen} message={savingAction.message} />
    </div>
  );
};
