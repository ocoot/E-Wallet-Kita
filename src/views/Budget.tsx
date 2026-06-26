import React, { useState } from "react";
import { useLanguage } from "../contexts/LanguageContext";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { dbService } from "../lib/db";
import { useCategories } from "../hooks/useCategories";
import { useBudgets } from "../hooks/useBudgets";
import { Modal } from "../components/Modal";
import { EmptyState } from "../components/EmptyState";
import { motion } from "motion/react";
import { audioFeedback } from "../lib/audio";
import { PiggyBank, Trash2, AlertTriangle, CheckCircle2 } from "lucide-react";

export const Budget: React.FC = () => {
  const { t, locale } = useLanguage();
  const { user } = useAuth();
  const { showToast } = useToast();
  const { categories, loading: loadingCategories } = useCategories();
  const { budgets, loading: loadingBudgets, refresh } = useBudgets(user?.id);

  // Hanya kategori expense/both yang relevan untuk budget pengeluaran
  const expenseCategories = categories.filter((c) => c.type === "expense" || c.type === "both");

  // Draft input state per category key (belum disimpan)
  const [drafts, setDrafts] = useState<Record<string, { limit: string; threshold: string }>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const formatIDR = (num: number) => "Rp" + Math.round(num).toLocaleString("id-ID");

  const getLabel = (key: string) => {
    const cat = categories.find((c) => c.key === key);
    if (!cat) return key;
    return locale === "id" ? cat.label_id || cat.key : cat.label_en || cat.key;
  };

  const getDraft = (key: string) => {
    const existing = budgets.find((b) => b.category_key === key);
    return (
      drafts[key] || {
        limit: existing ? String(existing.monthly_limit) : "",
        threshold: existing ? String(existing.alert_threshold_percent) : "80"
      }
    );
  };

  const updateDraft = (key: string, field: "limit" | "threshold", value: string) => {
    setDrafts((prev) => ({
      ...prev,
      [key]: { ...getDraft(key), [field]: value }
    }));
  };

  const handleSave = async (key: string) => {
    if (!user) return;
    const draft = getDraft(key);
    const limitNum = Number(draft.limit);
    const thresholdNum = Number(draft.threshold);

    if (!limitNum || limitNum <= 0 || isNaN(limitNum)) {
      audioFeedback.playDullPluck();
      showToast(t("budget.invalid_limit"), "error");
      return;
    }
    if (!thresholdNum || thresholdNum < 1 || thresholdNum > 100 || isNaN(thresholdNum)) {
      audioFeedback.playDullPluck();
      showToast(t("budget.invalid_threshold"), "error");
      return;
    }

    setSavingKey(key);
    try {
      await dbService.upsertBudget(user.id, key, limitNum, thresholdNum);
      audioFeedback.playClick();
      showToast(t("budget.save_success"), "success");
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      await refresh();
    } catch (err) {
      console.error("Error saving budget:", err);
      showToast(t("budget.save_error"), "error");
    } finally {
      setSavingKey(null);
    }
  };

  const handleDeleteConfirmed = async () => {
    if (!user || !deleteTarget) return;
    setIsDeleting(true);
    try {
      const ok = await dbService.deleteBudget(user.id, deleteTarget);
      if (ok) {
        showToast(t("budget.delete_success"), "success");
        await refresh();
      } else {
        showToast(t("budget.delete_error"), "error");
      }
    } catch (err) {
      console.error("Error deleting budget:", err);
      showToast(t("budget.delete_error"), "error");
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  };

  const statusBadge = (status: "safe" | "warning" | "danger") => {
    if (status === "danger") {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-red-500/15 text-red-400 light_sakura:bg-red-50 light_sakura:text-red-600">
          <AlertTriangle size={12} /> {t("budget.status_danger")}
        </span>
      );
    }
    if (status === "warning") {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-amber-500/15 text-amber-400 light_sakura:bg-amber-50 light_sakura:text-amber-600">
          <AlertTriangle size={12} /> {t("budget.status_warning")}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-500/15 text-emerald-400 light_sakura:bg-emerald-50 light_sakura:text-emerald-600">
        <CheckCircle2 size={12} /> {t("budget.status_safe")}
      </span>
    );
  };

  const loading = loadingCategories || loadingBudgets;

  return (
    <div className="space-y-6 pb-12">
      {/* Header Container */}
      <div className="p-5 rounded-2xl bg-slate-900/40 border border-slate-800/50 light_sakura:bg-rose-50/20 light_sakura:border-rose-100/50 flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-400 light_sakura:bg-rose-500/10 light_sakura:text-rose-500 shrink-0">
          <PiggyBank size={24} />
        </div>
        <div>
          <h1 className="font-sans font-bold text-lg text-white light_sakura:text-slate-900">
            {t("budget.page_title")}
          </h1>
          <p className="text-xs text-slate-400 light_sakura:text-slate-600 mt-1 max-w-xl leading-relaxed">
            {t("budget.page_subtitle")}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-slate-400 light_sakura:text-slate-500">…</div>
      ) : expenseCategories.length === 0 ? (
        <EmptyState message={t("budget.empty_state_desc")} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {expenseCategories.map((cat) => {
            const existing = budgets.find((b) => b.category_key === cat.key);
            const draft = getDraft(cat.key);
            const percent = existing ? Math.min(100, Math.round(existing.percent)) : 0;
            const barColor = !existing
              ? "bg-slate-700"
              : existing.status === "danger"
                ? "bg-red-500"
                : existing.status === "warning"
                  ? "bg-amber-500"
                  : "bg-emerald-500";

            return (
              <motion.div
                key={cat.key}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-5 rounded-2xl border bg-slate-900/60 border-slate-800 light_sakura:bg-white light_sakura:border-rose-100 space-y-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-sans font-semibold text-sm text-slate-100 light_sakura:text-slate-800 truncate">
                    {getLabel(cat.key)}
                  </h3>
                  {existing ? statusBadge(existing.status) : (
                    <span className="text-[11px] font-medium text-slate-500 light_sakura:text-slate-400">
                      {t("budget.no_budget_set")}
                    </span>
                  )}
                </div>

                {existing && (
                  <div className="space-y-1.5">
                    <div className="h-2 rounded-full bg-slate-800 light_sakura:bg-rose-100 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${barColor}`}
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-400 light_sakura:text-slate-500">
                      <span>{t("budget.spent_of_limit", { spent: formatIDR(existing.spent), limit: formatIDR(existing.monthly_limit) })}</span>
                      <span>{t("budget.percent_used", { percent: Math.round(existing.percent) })}</span>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 light_sakura:text-slate-500 mb-1">
                      {t("budget.monthly_limit_label")}
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={draft.limit}
                      onChange={(e) => updateDraft(cat.key, "limit", e.target.value)}
                      className="w-full px-3 py-2 rounded-xl text-sm bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-indigo-500 light_sakura:bg-rose-50/50 light_sakura:border-rose-200 light_sakura:text-slate-800"
                      placeholder="500000"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 light_sakura:text-slate-500 mb-1">
                      {t("budget.alert_threshold_label")}
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={draft.threshold}
                      onChange={(e) => updateDraft(cat.key, "threshold", e.target.value)}
                      className="w-full px-3 py-2 rounded-xl text-sm bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-indigo-500 light_sakura:bg-rose-50/50 light_sakura:border-rose-200 light_sakura:text-slate-800"
                      placeholder="80"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2.5">
                  <button
                    onClick={() => handleSave(cat.key)}
                    disabled={savingKey === cat.key}
                    className="flex-1 py-2.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors disabled:opacity-50 light_sakura:bg-rose-500 light_sakura:hover:bg-rose-400 cursor-pointer"
                  >
                    {existing ? t("budget.edit_budget") : t("budget.set_budget")}
                  </button>
                  {existing && (
                    <button
                      onClick={() => setDeleteTarget(cat.key)}
                      className="p-2.5 rounded-xl border border-red-500/20 text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer light_sakura:border-red-200 light_sakura:text-red-500"
                      title={t("budget.delete")}
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      <Modal
        isOpen={!!deleteTarget}
        title={t("budget.delete_confirm_title")}
        description={t("budget.delete_confirm_desc", { category: deleteTarget ? getLabel(deleteTarget) : "" })}
        type="danger"
        confirmLabel={t("budget.delete")}
        cancelLabel={t("common.cancel")}
        onConfirm={handleDeleteConfirmed}
        onCancel={() => setDeleteTarget(null)}
        confirmDisabled={isDeleting}
      />
    </div>
  );
};
