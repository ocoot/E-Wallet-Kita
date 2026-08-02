import React, { useState } from "react";
import { useLanguage } from "../contexts/LanguageContext";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { dbService } from "../lib/db";
import { withErrorReporting } from "../lib/errorReporter";
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
import { CurrencyInput } from "../components/ui/CurrencyInput";
import { useThemeTokens } from "../hooks/useThemeTokens";
import { ModalShell } from "../components/ui/ModalShell";
import { CollapsingPageHeader } from "../components/CollapsingPageHeader";

interface BudgetProps {
  // Root cause / why: sebelumnya Budget.tsx tidak menerima prop ini sama
  // sekali, padahal App.tsx SUDAH punya `transactionsUpdatedTrigger`
  // global yang naik setiap kali transaksi disimpan/dihapus/diubah di
  // MANA PUN di app (lihat handleTransactionChange di App.tsx, dan
  // pemakaiannya di Dashboard.tsx/History.tsx). Efeknya: user mencatat
  // transaksi baru dari NewTransaction, progress bar di halaman Budget
  // tetap menampilkan angka lama sampai user keluar-masuk halaman itu
  // lagi (remount memaksa useBudgets fetch ulang). Optional (`?`) supaya
  // Budget tetap bisa dipakai/di-render berdiri sendiri tanpa trigger ini.
  transactionsUpdatedTrigger?: number;
}

export const Budget: React.FC<BudgetProps> = ({ transactionsUpdatedTrigger }) => {
  const { t, locale } = useLanguage();
  const { user } = useAuth();
  const { showToast } = useToast();
  const { categories, loading: loadingCategories } = useCategories();
  const { budgets, loading: loadingBudgets, error: budgetsError, refresh } = useBudgets(user?.id, transactionsUpdatedTrigger);
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
      await withErrorReporting(
        "frontend:budget",
        async () => {
          await dbService.upsertBudget(user.id, key, limitNum, thresholdNum);
          audioFeedback.playClick();
          showToast(t("budget.save_success"), "success");
          setDrafts((prev) => {
            const next = { ...prev };
            delete next[key];
            return next;
          });
          await refresh();
        },
        { action: "save", categoryKey: key }
      );
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
      await withErrorReporting(
        "frontend:budget",
        async () => {
          await dbService.upsertBudget(user.id, addCategoryKey, limitNum, thresholdNum);
          audioFeedback.playClick();
          showToast(t("budget.save_success"), "success");
          await refresh();
          closeAddModalHistory();
        },
        { action: "add", categoryKey: addCategoryKey }
      );
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
      await withErrorReporting(
        "frontend:budget",
        async () => {
          const ok = await dbService.deleteBudget(user.id, deleteTarget);
          if (ok) {
            showToast(t("budget.delete_success"), "success");
            await refresh();
          } else {
            showToast(t("budget.delete_error"), "error");
          }
        },
        { action: "delete", categoryKey: deleteTarget }
      );
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
        <span className={cx("inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[clamp(0.6188rem,2.86vw,0.6875rem)] font-bold", tokens.budget.statusDanger, tokens.text.danger)}>
          <AlertTriangle size={12} /> {t("budget.status_danger")}
        </span>
      );
    }
    if (status === "warning") {
      return (
        <span className={cx("inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[clamp(0.6188rem,2.86vw,0.6875rem)] font-bold", tokens.budget.statusWarning, tokens.text.warning)}>
          <AlertTriangle size={12} /> {t("budget.status_warning")}
        </span>
      );
    }
    return (
      <span className={cx("inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[clamp(0.6188rem,2.86vw,0.6875rem)] font-bold", tokens.budget.statusSafe, tokens.text.success)}>
        <CheckCircle2 size={12} /> {t("budget.status_safe")}
      </span>
    );
  };

  const loading = loadingCategories || loadingBudgets;

  return (
    <CollapsingPageHeader
      title={t("budget.page_title")}
      subtitle={t("budget.page_subtitle")}
      actions={
        !loading && expenseCategories.length > 0 ? (
          <button
            type="button"
            onClick={openAddModal}
            disabled={availableCategories.length === 0}
            aria-label={t("budget.add_budget_cta")}
            title={availableCategories.length === 0 ? t("budget.all_categories_budgeted") : undefined}
            className={cx("p-1.5 rounded-full cursor-pointer active:scale-[0.92] transition-transform focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed", tokens.text.secondary)}
          >
            <Plus size={18} />
          </button>
        ) : undefined
      }
    >
      <div className="space-y-6 pb-12">

      {/* Tombol Add (Header actions) SUDAH dipindah ke actions slot di
          sticky toolbar -- sengaja TIDAK didobel di sini. */}

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
              className={cx("flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-bold text-white transition-all active:scale-95 cursor-pointer", tokens.budget.addBtn)}
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
                  <CurrencyInput
                    label={t("budget.monthly_limit_label")}
                    value={draft.limit}
                    onValueChange={(digits) => updateDraft(catKey, "limit", digits)}
                    placeholder="500.000"
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
                  className={cx("w-full py-2.5 rounded-full text-xs font-bold text-white transition-all active:scale-[0.98] disabled:opacity-50 cursor-pointer", tokens.budget.addBtn)}
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
            <h3 id="budget-add-modal-title" className="font-sans text-lg font-bold tracking-tight">
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
            <CurrencyInput
              label={t("budget.monthly_limit_label")}
              value={addLimit}
              onValueChange={setAddLimit}
              placeholder="500.000"
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
              className={cx("rounded-full px-4 py-2 font-sans text-sm font-medium cursor-pointer transition-all active:scale-95", tokens.budget.cancelBtnTextLight, tokens.budget.closeBtnHover)}
            >
              {t("common.cancel")}
            </button>
            <button
              onClick={handleAddSave}
              disabled={isAdding}
              className={cx("rounded-full px-4.5 py-2 font-sans text-sm font-bold text-white shadow-lg disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-all active:scale-95", tokens.budget.addBtn)}
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
    </CollapsingPageHeader>
  );
};
