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
      {/* Header */}
      <div>
        <h2 className="font-sans font-black text-lg text-white flex items-center gap-2 light_sakura:text-slate-800">
          <Wrench className="text-amber-400 light_sakura:text-rose-500" size={20} />
          {t("admin.maintenance_title")}
        </h2>
        <p className="text-xs text-slate-400 mt-0.5 light_sakura:text-slate-500">
          {t("admin.maintenance_desc")}
        </p>
      </div>

      {/* Global maintenance toggle card */}
      <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-5 space-y-4 light_sakura:bg-white light_sakura:border-rose-100">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl border ${isActive ? "bg-amber-500/10 border-amber-500/30 text-amber-400" : "bg-slate-900 border-slate-800 text-slate-500"}`}>
              <Power size={18} />
            </div>
            <div>
              <p className="font-sans font-bold text-sm text-slate-100 light_sakura:text-slate-800">
                {t("admin.maintenance_global_toggle_label")}
              </p>
              <p className="text-[10px] text-slate-400 light_sakura:text-slate-500">
                {isActive ? t("admin.maintenance_status_on") : t("admin.maintenance_status_off")}
              </p>
            </div>
          </div>

          {/* Switch */}
          <button
            onClick={() => setIsActive(v => !v)}
            className={`relative w-14 h-7 rounded-full transition-colors cursor-pointer shrink-0
              ${isActive ? "bg-amber-500/80" : "bg-slate-800"}`}
            aria-pressed={isActive}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform
                ${isActive ? "translate-x-7" : "translate-x-0"}`}
            />
          </button>
        </div>

        {/* Running text message editors */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1 flex items-center gap-1 light_sakura:text-slate-500">
              <MessageSquareWarning size={11} /> {t("admin.maintenance_message_id_label")}
            </label>
            <textarea
              value={messageId}
              onChange={e => setMessageId(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 rounded-xl text-xs bg-slate-900 border border-slate-800 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500 resize-none leading-relaxed light_sakura:bg-white light_sakura:border-rose-200 light_sakura:text-slate-800"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1 flex items-center gap-1 light_sakura:text-slate-500">
              <MessageSquareWarning size={11} /> {t("admin.maintenance_message_en_label")}
            </label>
            <textarea
              value={messageEn}
              onChange={e => setMessageEn(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 rounded-xl text-xs bg-slate-900 border border-slate-800 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500 resize-none leading-relaxed light_sakura:bg-white light_sakura:border-rose-200 light_sakura:text-slate-800"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button
            onClick={loadAll}
            className="px-4 py-2 text-xs font-bold rounded-xl border border-slate-800 hover:bg-slate-900 transition-colors cursor-pointer text-slate-300 flex items-center gap-1.5 light_sakura:border-rose-200 light_sakura:text-slate-700 light_sakura:hover:bg-rose-100"
          >
            <RefreshCw size={12} /> {t("admin.refresh")}
          </button>
          <button
            onClick={handleSaveGlobal}
            className="px-4 py-2 text-xs font-bold rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 hover:bg-amber-500/25 transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <Save size={12} /> {t("admin.maintenance_save_btn")}
          </button>
        </div>
      </div>

      {/* Per-feature lock list */}
      <div className="rounded-2xl border border-slate-800 bg-slate-950/40 overflow-hidden light_sakura:bg-white light_sakura:border-rose-100">
        <div className="px-5 py-4 border-b border-slate-800 light_sakura:border-rose-100">
          <p className="font-sans font-bold text-sm text-slate-100 light_sakura:text-slate-800">
            {t("admin.maintenance_feature_lock_title")}
          </p>
          <p className="text-[10px] text-slate-400 mt-0.5 light_sakura:text-slate-500">
            {t("admin.maintenance_feature_lock_desc")}
          </p>
        </div>

        <div className="divide-y divide-slate-800/50 light_sakura:divide-rose-100">
          {features.map(feature => (
            <div key={feature.feature_key} className="flex items-center justify-between gap-4 px-5 py-3.5">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg border ${feature.is_locked ? "bg-red-500/10 border-red-500/25 text-red-400" : "bg-emerald-500/10 border-emerald-500/25 text-emerald-400"}`}>
                  {feature.is_locked ? <Lock size={14} /> : <Unlock size={14} />}
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-200 light_sakura:text-slate-800">
                    {getFeatureLabel(feature.feature_key)}
                  </p>
                  <p className="text-[10px] text-slate-500">
                    {feature.is_locked ? t("admin.maintenance_feature_locked") : t("admin.maintenance_feature_unlocked")}
                  </p>
                </div>
              </div>

              <button
                onClick={() => handleToggleFeature(feature.feature_key, !feature.is_locked)}
                className={`relative w-12 h-6 rounded-full transition-colors cursor-pointer shrink-0
                  ${feature.is_locked ? "bg-red-500/70" : "bg-slate-800"}`}
                aria-pressed={feature.is_locked}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform
                    ${feature.is_locked ? "translate-x-6" : "translate-x-0"}`}
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
