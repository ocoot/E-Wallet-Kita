import React, { useState, useEffect } from "react";
import { useLanguage } from "../contexts/LanguageContext";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { dbService } from "../lib/db";
import { useCategories } from "../hooks/useCategories";
import { useInstallments, InstallmentWithProgress } from "../hooks/useInstallments";
import { useWallets } from "../hooks/useWallets";
import { Modal } from "../components/Modal";
import { DropdownField } from "../components/DropdownField";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { useLockBodyScroll } from "../hooks/useLockBodyScroll";
import { useDialogA11y } from "../hooks/useDialogA11y";
import { useBackGestureTrap } from "../hooks/useBackGestureTrap";
import { ScrollableTableWrapper } from "../components/ScrollableTableWrapper";
import { motion, AnimatePresence } from "motion/react";
import { audioFeedback } from "../lib/audio";
import { Input } from "../components/ui/Input";
import {
  Landmark, Plus, Trash2, CheckCircle2, Edit2, RotateCcw, PartyPopper
} from "lucide-react";
import { useNavigate } from "react-router-dom";

interface InstallmentFormState {
  name: string; category_key: string; principal_amount: string;
  monthly_amount: string; total_months: string; start_date: string; notes: string; wallet_id: string;
}
const todayYMD = () => new Date().toISOString().split("T")[0];
const emptyForm = (): InstallmentFormState => ({
  name: "", category_key: "other", principal_amount: "", monthly_amount: "",
  total_months: "12", start_date: todayYMD(), notes: "", wallet_id: ""
});
const formatIDR = (num: number | null) => num != null ? "Rp" + Math.round(num).toLocaleString("id-ID") : "-";

export const Installments: React.FC = () => {
  const { t, locale } = useLanguage();
  const { user } = useAuth();
  const { showToast } = useToast();
  const { categories } = useCategories();
  const { installments, loading, error: installmentsError, refresh } = useInstallments(user?.id);
  const { activeWallets } = useWallets();
  const navigate = useNavigate();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<InstallmentWithProgress | null>(null);
  const [form, setForm] = useState<InstallmentFormState>(emptyForm());
  const [isSaving, setIsSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<InstallmentWithProgress | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [payConfirmTarget, setPayConfirmTarget] = useState<InstallmentWithProgress | null>(null);
  const [undoConfirmTarget, setUndoConfirmTarget] = useState<InstallmentWithProgress | null>(null);

  useLockBodyScroll(isFormOpen);
  const formModalRef = React.useRef<HTMLDivElement>(null);
  // Menjebak swipe-back/tombol-back HP saat form modal ini terbuka, supaya
  // menutup modal (tetap di halaman Cicilan) -- bukan malah menavigasi
  // balik ke halaman sebelum Cicilan (lihat useBackGestureTrap.ts).
  const { close: closeForm } = useBackGestureTrap(isFormOpen, setIsFormOpen);
  useDialogA11y(isFormOpen, formModalRef, closeForm);
  const [busyId, setBusyId] = useState<string | null>(null);
  // ── Formasi carousel: kartu yang sedang dipilih untuk ditampilkan detailnya ──
  const [activeInstallmentId, setActiveInstallmentId] = useState<string | null>(null);

  const expenseCategories = categories.filter(c => c.type === "expense" || c.type === "both");
  const getCategoryLabel = (key: string) => {
    const cat = categories.find(c => c.key === key);
    if (!cat) return key;
    return locale === "id" ? cat.label_id || cat.key : cat.label_en || cat.key;
  };

  const openAddForm = () => { setEditTarget(null); setForm(emptyForm()); setIsFormOpen(true); };
  const openEditForm = (i: InstallmentWithProgress) => {
    setEditTarget(i);
    setForm({
      name: i.name,
      category_key: i.category_key,
      principal_amount: i.principal_amount != null ? String(i.principal_amount) : "",
      monthly_amount: i.monthly_amount != null ? String(i.monthly_amount) : "",
      total_months: String(i.total_months),
      start_date: i.start_date,
      notes: i.notes ?? "",
      wallet_id: i.wallet_id ?? ""
    });
    setIsFormOpen(true);
  };

  const handleSave = async () => {
    if (!user) return;
    const trimmedName = form.name.trim();
    if (!trimmedName) { audioFeedback.playDullPluck(); showToast(t("installments.invalid_name"), "error"); return; }

    const totalMonths = Number(form.total_months);
    if (!totalMonths || totalMonths < 1) { audioFeedback.playDullPluck(); showToast(t("installments.invalid_total_months"), "error"); return; }

    const principalNum = form.principal_amount.trim() ? Number(form.principal_amount) : null;
    if (form.principal_amount.trim() && (isNaN(principalNum!) || principalNum! <= 0)) { audioFeedback.playDullPluck(); showToast(t("installments.invalid_principal"), "error"); return; }

    const monthlyNum = form.monthly_amount.trim() ? Number(form.monthly_amount) : null;
    if (form.monthly_amount.trim() && (isNaN(monthlyNum!) || monthlyNum! <= 0)) { audioFeedback.playDullPluck(); showToast(t("installments.invalid_monthly"), "error"); return; }

    if (!form.start_date) { audioFeedback.playDullPluck(); showToast(t("installments.invalid_start_date"), "error"); return; }

    setIsSaving(true);
    try {
      const payload = {
        name: trimmedName,
        category_key: form.category_key,
        principal_amount: principalNum,
        monthly_amount: monthlyNum,
        total_months: totalMonths,
        start_date: form.start_date,
        notes: form.notes.trim() || null,
        wallet_id: form.wallet_id || null
      };
      if (editTarget) await dbService.updateInstallment(user.id, editTarget.id, payload);
      else await dbService.saveInstallment(user.id, payload);
      showToast(t("installments.save_success"), "success");
      audioFeedback.playClick();
      closeForm();
      await refresh();
    } catch { showToast(t("installments.save_error"), "error"); }
    finally { setIsSaving(false); }
  };

  const handleDeleteConfirmed = async () => {
    if (!user || !deleteTarget) return;
    setIsDeleting(true);
    try {
      const ok = await dbService.deleteInstallment(user.id, deleteTarget.id);
      if (ok) { showToast(t("installments.delete_success"), "success"); await refresh(); }
      else showToast(t("installments.delete_error"), "error");
    } catch { showToast(t("installments.delete_error"), "error"); }
    finally { setIsDeleting(false); setDeleteTarget(null); }
  };

  const requestMarkPaid = (i: InstallmentWithProgress) => { audioFeedback.playClick(); setPayConfirmTarget(i); };
  const executeMarkPaid = async () => {
    if (!user || !payConfirmTarget) return;
    const i = payConfirmTarget;
    setBusyId(i.id);
    try {
      const result = await dbService.markInstallmentMonthPaid(i.id);
      audioFeedback.playClick();
      if (result.isCompleted) {
        showToast(t("installments.marked_paid_completed", { name: i.name }), "success");
      } else if (result.needsManualAmount) {
        showToast(t("installments.marked_paid_needs_amount"), "success");
        setPayConfirmTarget(null);
        await refresh();
        navigate("/transactions/new", { state: { prefillCategoryKey: i.category_key, prefillNote: `${i.name} (${result.monthsPaid}/${result.totalMonths})`, prefillType: "expense" } });
        return;
      } else {
        showToast(t("installments.marked_paid"), "success");
      }
      await refresh();
    } catch { showToast(t("installments.save_error"), "error"); }
    finally { setBusyId(null); setPayConfirmTarget(null); }
  };

  const requestUndoPaid = (i: InstallmentWithProgress) => { audioFeedback.playClick(); setUndoConfirmTarget(i); };
  const executeUndoPaid = async () => {
    if (!user || !undoConfirmTarget) return;
    const i = undoConfirmTarget;
    setBusyId(i.id);
    try {
      await dbService.unmarkInstallmentLastPayment(i.id);
      audioFeedback.playClick();
      showToast(t("installments.marked_undo"), "success");
      await refresh();
    } catch { showToast(t("installments.save_error"), "error"); }
    finally { setBusyId(null); setUndoConfirmTarget(null); }
  };

  useEffect(() => {
    if (installments.length === 0) { setActiveInstallmentId(null); return; }
    if (!activeInstallmentId || !installments.some(i => i.id === activeInstallmentId)) {
      setActiveInstallmentId(installments[0].id);
    }
  }, [installments, activeInstallmentId]);

  const activeInstallment = installments.find(i => i.id === activeInstallmentId) ?? null;

  const activeCount = installments.filter(i => !i.is_completed).length;
  const completedCount = installments.filter(i => i.is_completed).length;
  const totalMonthlyCommitment = installments
    .filter(i => !i.is_completed && i.monthly_amount != null)
    .reduce((sum, i) => sum + (i.monthly_amount || 0), 0);

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">

      <div className="rounded-3xl border bg-slate-900 border-slate-800/60 light_sakura:bg-white light_sakura:border-rose-100/40 shadow-lg overflow-hidden">
        <div className="h-1.5 w-full bg-gradient-to-r from-indigo-500 via-violet-500 to-indigo-600" />
        <div className="p-6 md:p-8 space-y-6">

          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div>
              <h1 className="font-sans font-bold text-2xl tracking-tight text-white light_sakura:text-slate-900">
                {t("installments.page_title")}
              </h1>
              <p className="text-sm text-slate-400 mt-1 light_sakura:text-slate-500 leading-relaxed">
                {t("installments.page_subtitle")}
              </p>
            </div>
            <button onClick={() => { audioFeedback.playClick(); openAddForm(); }}
              className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm transition-colors shadow-lg shadow-indigo-600/20 shrink-0 light_sakura:bg-rose-500 light_sakura:hover:bg-rose-400 light_sakura:shadow-rose-500/20 cursor-pointer">
              <Plus size={16} /> {t("installments.add_button")}
            </button>
          </div>

          {/* Summary */}
          {installments.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-2xl bg-indigo-500/8 border border-indigo-500/15 px-3 py-3 light_sakura:bg-indigo-50/60 light_sakura:border-indigo-100">
                <span className="text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold uppercase tracking-wider text-slate-500 block mb-1">{t("installments.stat_active")}</span>
                <p className="font-bold text-2xl text-indigo-400 light_sakura:text-indigo-600">{activeCount}</p>
              </div>
              <div className="rounded-2xl bg-emerald-500/8 border border-emerald-500/15 px-3 py-3 light_sakura:bg-emerald-50/60 light_sakura:border-emerald-100">
                <span className="text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold uppercase tracking-wider text-slate-500 block mb-1">{t("installments.stat_completed")}</span>
                <p className="font-bold text-2xl text-emerald-400 light_sakura:text-emerald-600">{completedCount}</p>
              </div>
              <div className="rounded-2xl bg-slate-800/40 border border-slate-700/40 px-3 py-3 light_sakura:bg-slate-100/60 light_sakura:border-slate-200">
                <span className="text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold uppercase tracking-wider text-slate-500 block mb-1">{t("installments.stat_monthly_commitment")}</span>
                <p className="font-bold text-[11px] leading-tight whitespace-nowrap tabular-nums tracking-tight text-slate-200 light_sakura:text-slate-700">{formatIDR(totalMonthlyCommitment)}</p>
              </div>
            </div>
          )}

          {/* List */}
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
            </div>
          ) : installmentsError ? (
            <ErrorState onRetry={refresh} />
          ) : installments.length === 0 ? (
            <EmptyState icon={<Landmark size={40} className="text-slate-600 light_sakura:text-slate-400" />} title={t("installments.empty_title")} description={t("installments.empty_desc")} />
          ) : (
            <div className="space-y-4">
              {/* ── Formasi carousel: geser kartu, ketuk untuk pilih ─────── */}
              <AnimatePresence>
                <ScrollableTableWrapper className="flex gap-3 pb-2 -mx-1 px-1 snap-x snap-mandatory">
                  {installments.map(i => {
                    const isActive = i.id === activeInstallmentId;
                    return (
                      <motion.button key={i.id} type="button" onClick={() => { audioFeedback.playClick(); setActiveInstallmentId(i.id); }}
                        initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }}
                        className={`shrink-0 w-56 snap-start text-left rounded-2xl p-4 cursor-pointer transition-all ${
                          i.is_completed
                            ? "bg-gradient-to-br from-emerald-600 to-emerald-800 text-white"
                            : "bg-gradient-to-br from-indigo-600 to-violet-800 text-white light_sakura:from-rose-500 light_sakura:to-rose-700"
                        } ${isActive ? "ring-2 ring-offset-2 ring-offset-slate-900 ring-white/70 light_sakura:ring-offset-white" : "opacity-80"}`}>
                        <div className="flex items-center justify-between text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold uppercase tracking-wider opacity-80">
                          <span className="truncate">{getCategoryLabel(i.category_key)}</span>
                          <span>{i.progressPercent}%</span>
                        </div>
                        <p className="font-sans font-bold text-base mt-3 truncate">{i.name}</p>
                        <p className="text-xs opacity-80 mt-0.5">{formatIDR(i.monthly_amount)}/bulan</p>
                        <div className="h-1.5 w-full rounded-full bg-white/25 overflow-hidden mt-4">
                          <div className="h-full rounded-full bg-white" style={{ width: `${i.progressPercent}%` }} />
                        </div>
                        <p className="text-[clamp(0.5625rem,2.6vw,0.625rem)] opacity-70 mt-1.5">{i.months_paid} dari {i.total_months} bulan</p>
                      </motion.button>
                    );
                  })}
                </ScrollableTableWrapper>
              </AnimatePresence>

              {/* ── Panel detail kartu terpilih ───────────────────────────── */}
              {activeInstallment && (() => { const i = activeInstallment; return (
                <div className="rounded-2xl border border-slate-800/50 bg-slate-950/40 overflow-hidden light_sakura:bg-rose-50/20 light_sakura:border-rose-100/30">
                  <div className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-sans font-bold text-sm text-slate-100 light_sakura:text-slate-900 truncate">{i.name}</p>
                        <p className="text-[clamp(0.6188rem,2.86vw,0.6875rem)] text-slate-500 mt-0.5">{getCategoryLabel(i.category_key)}</p>
                      </div>
                      {i.is_completed && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold shrink-0 bg-emerald-500/15 text-emerald-400 light_sakura:bg-emerald-50 light_sakura:text-emerald-600">
                          <PartyPopper size={11} />{t("installments.status_completed")}
                        </span>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[clamp(0.6188rem,2.86vw,0.6875rem)]">
                        <span className="text-slate-400 font-semibold">
                          {t("installments.progress_label", { paid: i.months_paid, total: i.total_months })}
                        </span>
                        <span className={`font-bold ${i.is_completed ? "text-emerald-400" : "text-indigo-400 light_sakura:text-rose-500"}`}>
                          {i.progressPercent}%
                        </span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-slate-800/70 light_sakura:bg-slate-200/70 overflow-hidden">
                        <motion.div initial={{ width: 0 }} animate={{ width: `${i.progressPercent}%` }} transition={{ duration: 0.5, ease: "easeOut" }}
                          className={`h-full rounded-full ${i.is_completed ? "bg-emerald-500" : "bg-gradient-to-r from-indigo-500 to-violet-500 light_sakura:from-rose-500 light_sakura:to-rose-400"}`} />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-500">{t("installments.monthly_amount_label")}</span>
                        <span className="font-semibold text-slate-200 light_sakura:text-slate-700">{formatIDR(i.monthly_amount)}</span>
                      </div>
                      {i.principal_amount != null && (
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-500">{t("installments.principal_label")}</span>
                          <span className="font-semibold text-slate-200 light_sakura:text-slate-700">{formatIDR(i.principal_amount)}</span>
                        </div>
                      )}
                      {!i.is_completed && (
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-500">{t("installments.months_remaining_label")}</span>
                          <span className="text-slate-300 light_sakura:text-slate-600">{t("installments.months_remaining_value", { count: i.monthsRemaining })}</span>
                        </div>
                      )}
                      {i.notes && <p className="text-[clamp(0.6188rem,2.86vw,0.6875rem)] text-slate-500 italic truncate">{i.notes}</p>}
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      {!i.is_completed && (
                        <button onClick={() => requestMarkPaid(i)} disabled={busyId === i.id}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50 bg-indigo-500/15 text-indigo-400 hover:bg-indigo-500/25 light_sakura:bg-rose-50 light_sakura:text-rose-600">
                          {busyId === i.id ? <div className="w-3.5 h-3.5 border border-current border-t-transparent rounded-full animate-spin" /> : <><CheckCircle2 size={12} /> {t("installments.mark_month_paid")}</>}
                        </button>
                      )}
                      {i.months_paid > 0 && (
                        <button onClick={() => requestUndoPaid(i)} disabled={busyId === i.id}
                          title={t("installments.undo_last_payment")}
                          className="p-2 rounded-xl bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 transition-colors cursor-pointer light_sakura:bg-amber-50 light_sakura:text-amber-500">
                          <RotateCcw size={13} />
                        </button>
                      )}
                      <button onClick={() => { audioFeedback.playClick(); openEditForm(i); }} className="p-2 rounded-xl bg-slate-700/50 text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors cursor-pointer light_sakura:bg-slate-100 light_sakura:text-slate-500"><Edit2 size={13} /></button>
                      <button onClick={() => { audioFeedback.playClick(); setDeleteTarget(i); }} className="p-2 rounded-xl bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors cursor-pointer light_sakura:bg-red-50 light_sakura:text-red-400"><Trash2 size={13} /></button>
                    </div>
                  </div>
                </div>
              ); })()}
            </div>
          )}
        </div>
      </div>

      {/* Form modal */}
      <AnimatePresence>
        {isFormOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto bg-slate-950/70 backdrop-blur-sm"
            onClick={e => { if (e.target === e.currentTarget) closeForm(); }}>
            <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 40 }}
              ref={formModalRef}
              role="dialog"
              aria-modal="true"
              tabIndex={-1}
              className="w-full max-w-md my-auto max-h-[85vh] overflow-y-auto overflow-x-hidden outline-none bg-slate-900 light_sakura:bg-white rounded-3xl border border-slate-800 light_sakura:border-slate-200 shadow-2xl">
              <div className="h-1 w-full bg-gradient-to-r from-indigo-500 to-violet-500" />
              <div className="p-6 space-y-4">
                <h2 className="font-sans font-bold text-lg text-slate-100 light_sakura:text-slate-900">
                  {editTarget ? t("installments.edit_title") : t("installments.add_title")}
                </h2>
                <Input
                  type="text"
                  label={t("installments.form_name")}
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder={t("installments.form_name_placeholder")}
                />
                <div>
                  <label className="block text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold text-slate-400 uppercase tracking-wider mb-1.5">{t("installments.form_category")}</label>
                  <DropdownField
                    value={form.category_key}
                    onChange={(v) => setForm(f => ({ ...f, category_key: v }))}
                    options={expenseCategories.map(c => ({ value: c.key, label: locale === "id" ? c.label_id || c.key : c.label_en || c.key }))}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    type="number"
                    label={t("installments.form_monthly_amount")}
                    value={form.monthly_amount}
                    onChange={e => setForm(f => ({ ...f, monthly_amount: e.target.value }))}
                    placeholder={t("installments.form_monthly_amount_placeholder")}
                    min={0}
                  />
                  <Input
                    type="number"
                    label={t("installments.form_total_months")}
                    value={form.total_months}
                    onChange={e => setForm(f => ({ ...f, total_months: e.target.value }))}
                    min={1}
                  />
                </div>
                <Input
                  type="number"
                  label={t("installments.form_principal")}
                  value={form.principal_amount}
                  onChange={e => setForm(f => ({ ...f, principal_amount: e.target.value }))}
                  placeholder={t("installments.form_principal_placeholder")}
                  min={0}
                />
                <Input
                  type="date"
                  label={t("installments.form_start_date")}
                  value={form.start_date}
                  onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                />
                <div>
                  <label className="block text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold text-slate-400 uppercase tracking-wider mb-1.5">{t("wallet.label_pos")}</label>
                  <DropdownField
                    value={form.wallet_id}
                    onChange={(v) => setForm(f => ({ ...f, wallet_id: v }))}
                    options={activeWallets.map((w) => {
                      const icon = w.type === "general" ? "💰" : w.type === "ewallet" ? "📱" : w.type === "bank" ? "🏦" : "💵";
                      const label = w.type === "general" ? t("wallet.group_general") : `${w.name}${w.provider ? ` · ${w.provider}` : ""}`;
                      return { value: w.type === "general" ? "" : w.id, label: `${icon} ${label} (${formatIDR(w.balance)})` };
                    })}
                  />
                </div>
                <Input
                  type="text"
                  label={t("installments.form_notes")}
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder={t("installments.form_notes_placeholder")}
                />
                <div className="flex gap-3 pt-1">
                  <button onClick={closeForm} className="flex-1 py-3 rounded-2xl bg-slate-800 light_sakura:bg-slate-100 text-slate-300 light_sakura:text-slate-600 font-semibold text-sm hover:bg-slate-700 transition-colors cursor-pointer">{t("common.cancel")}</button>
                  <button onClick={handleSave} disabled={isSaving} className="flex-1 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 light_sakura:bg-rose-500 light_sakura:hover:bg-rose-400 text-white font-semibold text-sm transition-colors shadow-lg shadow-indigo-600/20 disabled:opacity-50 cursor-pointer">{isSaving ? t("common.loading") : t("common.save")}</button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <Modal isOpen={!!deleteTarget} title={t("installments.delete_confirm_title")} description={t("installments.delete_confirm_desc", { name: deleteTarget?.name ?? "" })} type="danger" confirmLabel={t("common.delete")} cancelLabel={t("common.cancel")} onConfirm={handleDeleteConfirmed} onCancel={() => setDeleteTarget(null)} confirmDisabled={isDeleting} />

      <Modal isOpen={!!payConfirmTarget}
        title={t("installments.mark_confirm_title")}
        description={payConfirmTarget?.monthly_amount != null
          ? t("installments.mark_confirm_desc_with_amount", { name: payConfirmTarget?.name ?? "", amount: formatIDR(payConfirmTarget?.monthly_amount ?? null), next: (payConfirmTarget?.months_paid ?? 0) + 1, total: payConfirmTarget?.total_months ?? 0 })
          : t("installments.mark_confirm_desc_no_amount", { name: payConfirmTarget?.name ?? "" })}
        type="warning" confirmLabel={t("installments.mark_confirm_button")} cancelLabel={t("common.cancel")}
        onConfirm={executeMarkPaid} onCancel={() => setPayConfirmTarget(null)} confirmDisabled={busyId === payConfirmTarget?.id} />

      <Modal isOpen={!!undoConfirmTarget}
        title={t("installments.undo_confirm_title")}
        description={t("installments.undo_confirm_desc", { name: undoConfirmTarget?.name ?? "" })}
        type="warning" confirmLabel={t("installments.undo_confirm_button")} cancelLabel={t("common.cancel")}
        onConfirm={executeUndoPaid} onCancel={() => setUndoConfirmTarget(null)} confirmDisabled={busyId === undoConfirmTarget?.id} />
    </motion.div>
  );
};
