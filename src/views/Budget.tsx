import React, { useState } from "react";
import { useLanguage } from "../contexts/LanguageContext";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { dbService } from "../lib/db";
import { useCategories } from "../hooks/useCategories";
import { useBudgets } from "../hooks/useBudgets";
import { Modal } from "../components/Modal";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { audioFeedback } from "../lib/audio";
import { PiggyBank, Plus, X, AlertTriangle, CheckCircle2 } from "lucide-react";
import { BudgetProgressCard } from "../components/BudgetProgressCard";
import { DropdownField } from "../components/DropdownField";
import { useLockBodyScroll } from "../hooks/useLockBodyScroll";
import { useBackGestureTrap } from "../hooks/useBackGestureTrap";
import { Input } from "../components/ui/Input";
import { useThemeTokens } from "../hooks/useThemeTokens";
import { ModalShell } from "../components/ui/ModalShell";
import { Card } from "../components/ui/Card";
import { PageRibbonBackground } from "../components/PageRibbonBackground";

export const Budget: React.FC = () => {
  const { t, locale } = useLanguage();
  const { user } = useAuth();
  const { showToast } = useToast();
  const { categories, loading: loadingCategories } = useCategories();
  const { budgets, loading: loadingBudgets, error: budgetsError, refresh } = useBudgets(user?.id);
  const { tokens, cx } = useThemeTokens();

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

  useLockBodyScroll(isAddOpen || !!deleteTarget);

  const formatIDR = (num: number) => "Rp\u00A0" + Math.round(num).toLocaleString("id-ID");

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

  // Menjebak swipe-back/tombol-back HP saat modal ini terbuka, supaya
  // menutup modal (tetap di halaman Anggaran) -- bukan malah menavigasi
  // balik ke halaman sebelumnya (lihat useBackGestureTrap.ts).
  const { close: closeAddModalHistory } = useBackGestureTrap(isAddOpen, setIsAddOpen);

  const closeAddModal = () => {
    if (isAdding) return;
    closeAddModalHistory();
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
      closeAddModalHistory();
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
        <span className={cx("inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[clamp(0.6188rem,2.86vw,0.6875rem)] font-bold", tokens.budget.statusDanger, tokens.text.danger)}>
          <AlertTriangle size={12} /> {t("budget.status_danger")}
        </span>
      );
    }
    if (status === "warning") {
      return (
        <span className={cx("inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[clamp(0.6188rem,2.86vw,0.6875rem)] font-bold", tokens.budget.statusWarning, tokens.text.warning)}>
          <AlertTriangle size={12} /> {t("budget.status_warning")}
        </span>
      );
    }
    return (
      <span className={cx("inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[clamp(0.6188rem,2.86vw,0.6875rem)] font-bold", tokens.budget.statusSafe, tokens.text.success)}>
        <CheckCircle2 size={12} /> {t("budget.status_safe")}
      </span>
    );
  };

  const loading = loadingCategories || loadingBudgets;

  return (
    <div className="space-y-6 pb-12">
      {/* Header card — pola sama dengan History/Wallets/Settings/BillReminders/
          Installments/Savings/GoldSavings: wrapper rounded-3xl BERSIH (tanpa
          padding) + overflow-hidden, accent stripe warna di paling atas, lalu
          padding sesungguhnya ada di div anak. Sebelumnya halaman ini punya
          border-slate-900 (identik dgn bg-slate-900 sehingga border tidak
          kelihatan sama sekali) dan tanpa accent stripe -- beda sendiri dari
          semua halaman list lainnya.
          Perbaikan prioritas 1 (AUDIT-konsistensi-komponen.md): migrasi dari
          div manual ke <Card elevation="lg" padding="none"> supaya shadow
          elevation-nya diatur terpusat lewat primitive, bukan hardcode
          shadow-lg lagi di sini. */}
      <div className="relative">
        <PageRibbonBackground />
        <Card elevation="lg" padding="none" className="relative z-10 -mt-6 sm:-mt-8 overflow-hidden">
      {/* Accent stripe */}
      <div className="h-1.5 w-full bg-gradient-to-r from-indigo-500 via-violet-500 to-indigo-600" />
      <div className="p-6 md:p-8 space-y-6">

      {/* Header */}
      <div className={cx("flex items-start justify-between gap-3.5 flex-wrap border-b pb-6", tokens.settings.sectionBorder)}>
        <div className="flex items-center gap-3.5">
          <div className={cx(tokens.budget.iconChipIndigoSoft, tokens.icon.accent)}>
            <PiggyBank size={22} />
          </div>
          <div>
            <h1 className={cx("font-sans font-bold text-2xl tracking-tight", tokens.text.primary)}>
              {t("budget.page_title")}
            </h1>
            <p className={cx("text-xs mt-0.5 max-w-xl leading-relaxed", tokens.text.mutedAlt)}>
              {t("budget.page_subtitle")}
            </p>
          </div>
        </div>

        {!loading && expenseCategories.length > 0 && (
          <button
            onClick={openAddModal}
            disabled={availableCategories.length === 0}
            title={availableCategories.length === 0 ? t("budget.all_categories_budgeted") : undefined}
            className={cx("flex items-center gap-2 px-4.5 py-2.5 rounded-xl text-xs font-bold text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shrink-0", tokens.budget.addBtn)}
          >
            <Plus size={15} />
            {t("budget.add_budget_cta")}
          </button>
        )}
      </div>

      {loading ? (
        <div className={cx("text-sm", tokens.text.muted)}>…</div>
      ) : budgetsError ? (
        <ErrorState onRetry={refresh} />
      ) : expenseCategories.length === 0 ? (
        <EmptyState
          icon={<PiggyBank size={40} className={tokens.budget.emptyStateIcon} />}
          title={t("budget.empty_state_title")}
          description={t("budget.empty_state_desc")}
        />
      ) : budgets.length === 0 ? (
        <div className="space-y-4">
          <EmptyState
            icon={<PiggyBank size={40} className={tokens.budget.emptyStateIcon} />}
            title={t("budget.no_budgets_yet_title")}
            description={t("budget.no_budgets_yet_desc")}
          />
          <div className="flex justify-center">
            <button
              onClick={openAddModal}
              className={cx("flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white transition-colors cursor-pointer", tokens.budget.addBtn)}
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
                  <Input
                    type="number"
                    min={1}
                    label={t("budget.monthly_limit_label")}
                    value={draft.limit}
                    onChange={(e) => updateDraft(catKey, "limit", e.target.value)}
                    placeholder="500000"
                  />
                  <Input
                    type="number"
                    min={1}
                    max={100}
                    label={t("budget.alert_threshold_label")}
                    value={draft.threshold}
                    onChange={(e) => updateDraft(catKey, "threshold", e.target.value)}
                    placeholder="80"
                  />
                </div>
                <button
                  onClick={() => handleSave(catKey)}
                  disabled={savingKey === catKey}
                  className={cx("w-full py-2 rounded-xl text-xs font-bold text-white transition-colors disabled:opacity-50 cursor-pointer", tokens.budget.addBtn)}
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

      </div>{/* end padded content */}
        </Card>{/* end header card */}
      </div>

      {/* Modal: Tambah Anggaran — pilih kategori dari yang belum dianggarkan */}
      <ModalShell
        isOpen={isAddOpen}
        onClose={closeAddModal}
        maxWidth="max-w-md"
        labelledBy="budget-add-modal-title"
        className="p-6"
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cx("rounded-full p-2.5", tokens.budgetProgressCard.badgeBgSafe, tokens.text.accentStrong)}>
              <PiggyBank size={20} />
            </div>
            <h3 id="budget-add-modal-title" className="font-sans text-lg font-semibold tracking-tight">
              {t("budget.add_modal_title")}
            </h3>
          </div>
          <button
            onClick={closeAddModal}
            className={cx("p-1.5 rounded-lg text-slate-400 cursor-pointer", tokens.budget.closeBtnHover)}
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className={cx("text-[clamp(0.6188rem,2.86vw,0.6875rem)] font-medium block mb-1.5", tokens.text.muted)}>
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
              type="number"
              min={1}
              label={t("budget.monthly_limit_label")}
              value={addLimit}
              onChange={(e) => setAddLimit(e.target.value)}
              placeholder="500000"
            />
            <Input
              type="number"
              min={1}
              max={100}
              label={t("budget.alert_threshold_label")}
              value={addThreshold}
              onChange={(e) => setAddThreshold(e.target.value)}
              placeholder="80"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              onClick={closeAddModal}
              className={cx("rounded-xl px-4 py-2 font-sans text-sm font-medium cursor-pointer", tokens.budget.cancelBtnTextLight, tokens.budget.closeBtnHover)}
            >
              {t("common.cancel")}
            </button>
            <button
              onClick={handleAddSave}
              disabled={isAdding}
              className={cx("rounded-xl px-4.5 py-2 font-sans text-sm font-semibold text-white shadow-lg disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer", tokens.budget.addBtn)}
            >
              {t("budget.save")}
            </button>
          </div>
        </div>
      </ModalShell>

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
