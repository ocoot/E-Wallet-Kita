import React, { useState } from "react";
import { useLanguage } from "../contexts/LanguageContext";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { dbService } from "../lib/db";
import { useCategories } from "../hooks/useCategories";
import { useBudgets } from "../hooks/useBudgets";
import { Modal } from "../components/Modal";
import { EmptyState } from "../components/EmptyState";
import { motion, AnimatePresence } from "motion/react";
import { audioFeedback } from "../lib/audio";
import { PiggyBank, Plus, X, AlertTriangle, CheckCircle2 } from "lucide-react";
import { BudgetProgressCard } from "../components/BudgetProgressCard";
import { DropdownField } from "../components/DropdownField";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { Badge } from "../components/ui/Badge";

export const Budget: React.FC = () => {
  const { t, locale } = useLanguage();
  const { user } = useAuth();
  const { showToast } = useToast();
  const { categories, loading: loadingCategories } = useCategories();
  const { budgets, loading: loadingBudgets, refresh } = useBudgets(user?.id);

  // Hanya kategori expense/both yang relevan untuk budget pengeluaran
  const expenseCategories = categories.filter((c) => c.type === "expense" || c.type === "both");
  // Kategori yang BELUM punya anggaran -> ini yang ditawarkan di modal "Tambah Anggaran"
  const budgetedKeys = new Set(budgets.map((b) => b.category_key));
  const availableCategories = expenseCategories.filter((c) => !budgetedKeys.has(c.key));

  // Draft input state per category key (belum disimpan) — untuk edit anggaran yang sudah ada
  const [drafts, setDrafts] = useState<Record<string, { limit: string; threshold: string }>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // State untuk modal "Tambah Anggaran" — memilih kategori baru dari yang belum dianggarkan
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [addCategoryKey, setAddCategoryKey] = useState("");
  const [addLimit, setAddLimit] = useState("");
  const [addThreshold, setAddThreshold] = useState("80");
  const [isAdding, setIsAdding] = useState(false);

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

  // ── Modal "Tambah Anggaran": pilih kategori dari yang belum dianggarkan ──
  const openAddModal = () => {
    if (availableCategories.length === 0) return;
    setAddCategoryKey("");
    setAddLimit("");
    setAddThreshold("80");
    audioFeedback.playClick();
    setIsAddOpen(true);
  };

  const closeAddModal = () => {
    if (isAdding) return;
    setIsAddOpen(false);
  };

  const handleAddSave = async () => {
    if (!user) return;

    if (!addCategoryKey) {
      audioFeedback.playDullPluck();
      showToast(t("budget.invalid_category"), "error");
      return;
    }
    const limitNum = Number(addLimit);
    const thresholdNum = Number(addThreshold);

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

    setIsAdding(true);
    try {
      await dbService.upsertBudget(user.id, addCategoryKey, limitNum, thresholdNum);
      audioFeedback.playClick();
      showToast(t("budget.save_success"), "success");
      await refresh();
      setIsAddOpen(false);
    } catch (err) {
      console.error("Error adding budget:", err);
      showToast(t("budget.save_error"), "error");
    } finally {
      setIsAdding(false);
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
        <Badge variant="danger" className="text-[clamp(0.6188rem,2.86vw,0.6875rem)] py-1 px-2.5">
          <AlertTriangle size={12} className="mr-1 shrink-0" /> {t("budget.status_danger")}
        </Badge>
      );
    }
    if (status === "warning") {
      return (
        <Badge variant="warning" className="text-[clamp(0.6188rem,2.86vw,0.6875rem)] py-1 px-2.5">
          <AlertTriangle size={12} className="mr-1 shrink-0" /> {t("budget.status_warning")}
        </Badge>
      );
    }
    return (
      <Badge variant="success" className="text-[clamp(0.6188rem,2.86vw,0.6875rem)] py-1 px-2.5">
        <CheckCircle2 size={12} className="mr-1 shrink-0" /> {t("budget.status_safe")}
      </Badge>
    );
  };

  const loading = loadingCategories || loadingBudgets;

  return (
    <div className="space-y-6 pb-12">
      {/* Massive Cohesive Card Container */}
      <Card className="p-6 md:p-8 rounded-3xl border-slate-900 light_sakura:border-rose-100/10 shadow-lg space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-3.5 flex-wrap border-b border-slate-800/50 pb-6 light_sakura:border-rose-100/30">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-400 light_sakura:bg-rose-500/10 light_sakura:text-rose-500 shrink-0">
            <PiggyBank size={22} />
          </div>
          <div>
            <h1 className="font-sans font-bold text-2xl tracking-tight text-white light_sakura:text-slate-900">
              {t("budget.page_title")}
            </h1>
            <p className="text-xs text-slate-400 light_sakura:text-slate-600 mt-0.5 max-w-xl leading-relaxed">
              {t("budget.page_subtitle")}
            </p>
          </div>
        </div>

        {!loading && expenseCategories.length > 0 && (
          <Button
            onClick={openAddModal}
            disabled={availableCategories.length === 0}
            title={availableCategories.length === 0 ? t("budget.all_categories_budgeted") : undefined}
            variant="primary"
            className="px-4.5 py-2.5 rounded-xl text-xs font-bold shrink-0"
          >
            <Plus size={15} />
            {t("budget.add_budget_cta")}
          </Button>
        )}
      </div>

      {loading ? (
        <div className="text-sm text-slate-400 light_sakura:text-slate-500">…</div>
      ) : expenseCategories.length === 0 ? (
        <EmptyState
          icon={<PiggyBank size={40} className="text-slate-600 light_sakura:text-slate-400" />}
          title={t("budget.empty_state_title")}
          description={t("budget.empty_state_desc")}
        />
      ) : budgets.length === 0 ? (
        <div className="space-y-4">
          <EmptyState
            icon={<PiggyBank size={40} className="text-slate-600 light_sakura:text-slate-400" />}
            title={t("budget.no_budgets_yet_title")}
            description={t("budget.no_budgets_yet_desc")}
          />
          <div className="flex justify-center">
            <button
              onClick={openAddModal}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors light_sakura:bg-rose-500 light_sakura:hover:bg-rose-400 cursor-pointer"
            >
              <Plus size={15} />
              {t("budget.add_budget_cta")}
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {budgets.map((existing) => {
            const catKey = existing.category_key;
            const draft = getDraft(catKey);

            const editSlot = (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[clamp(0.5625rem,2.6vw,0.625rem)] font-medium text-slate-400 light_sakura:text-slate-500 mb-1">
                      {t("budget.monthly_limit_label")}
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={draft.limit}
                      onChange={(e) => updateDraft(catKey, "limit", e.target.value)}
                      className="w-full px-3 py-2 rounded-xl text-sm bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-indigo-500 light_sakura:bg-rose-50/50 light_sakura:border-rose-200 light_sakura:text-slate-800"
                      placeholder="500000"
                    />
                  </div>
                  <div>
                    <label className="block text-[clamp(0.5625rem,2.6vw,0.625rem)] font-medium text-slate-400 light_sakura:text-slate-500 mb-1">
                      {t("budget.alert_threshold_label")}
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={draft.threshold}
                      onChange={(e) => updateDraft(catKey, "threshold", e.target.value)}
                      className="w-full px-3 py-2 rounded-xl text-sm bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-indigo-500 light_sakura:bg-rose-50/50 light_sakura:border-rose-200 light_sakura:text-slate-800"
                      placeholder="80"
                    />
                  </div>
                </div>
                <button
                  onClick={() => handleSave(catKey)}
                  disabled={savingKey === catKey}
                  className="w-full py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors disabled:opacity-50 light_sakura:bg-rose-500 light_sakura:hover:bg-rose-400 cursor-pointer"
                >
                  {savingKey === catKey ? "…" : t("budget.edit_budget")}
                </button>
              </div>
            );

            return (
              <BudgetProgressCard
                key={catKey}
                budget={existing}
                label={getLabel(catKey)}
                onEdit={() => {}}
                onDelete={() => setDeleteTarget(catKey)}
                editSlot={editSlot}
              />
            );
          })}
        </div>
      )}

      {/* Modal: Tambah Anggaran — pilih kategori dari yang belum dianggarkan */}
      <AnimatePresence>
        {isAddOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeAddModal}
              className="fixed inset-0 bg-black/60 backdrop-blur-xs"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 15 }}
              transition={{ type: "spring", duration: 0.3 }}
              className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-indigo-500/20 bg-slate-900 p-6 shadow-2xl text-white light_sakura:bg-rose-50/90 light_sakura:text-slate-800 light_sakura:border-rose-100"
            >
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="rounded-full p-2.5 bg-indigo-500/15 text-indigo-400 light_sakura:bg-indigo-50 light_sakura:text-indigo-600">
                    <PiggyBank size={20} />
                  </div>
                  <h3 className="font-sans text-lg font-semibold tracking-tight">
                    {t("budget.add_modal_title")}
                  </h3>
                </div>
                <button
                  onClick={closeAddModal}
                  className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white cursor-pointer light_sakura:hover:bg-rose-100"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-[clamp(0.6188rem,2.86vw,0.6875rem)] font-medium text-slate-400 light_sakura:text-slate-500 block mb-1.5">
                    {t("budget.select_category_label")}
                  </label>
                  <DropdownField
                    value={addCategoryKey}
                    onChange={setAddCategoryKey}
                    placeholder={t("budget.select_category_placeholder")}
                    options={availableCategories.map((c) => ({
                      value: c.key,
                      label: locale === "id" ? c.label_id || c.key : c.label_en || c.key,
                    }))}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <Input
                    label={t("budget.monthly_limit_label")}
                    type="number"
                    min={1}
                    value={addLimit}
                    onChange={(e) => setAddLimit(e.target.value)}
                    placeholder="500000"
                  />
                  <Input
                    label={t("budget.alert_threshold_label")}
                    type="number"
                    min={1}
                    max={100}
                    value={addThreshold}
                    onChange={(e) => setAddThreshold(e.target.value)}
                    placeholder="80"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <Button
                    variant="secondary"
                    onClick={closeAddModal}
                    className="px-4 py-2 font-sans text-sm font-medium"
                  >
                    {t("common.cancel")}
                  </Button>
                  <Button
                    variant="primary"
                    onClick={handleAddSave}
                    disabled={isAdding}
                    loading={isAdding}
                    className="px-4.5 py-2 font-sans text-sm font-semibold"
                  >
                    {t("budget.save")}
                  </Button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

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
      </Card>{/* end card container */}
    </div>
  );
};
