import React, { useState, useEffect } from "react";
import { useLanguage } from "../contexts/LanguageContext";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { dbService } from "../lib/db";
import { supabase } from "../lib/supabase";
import { useCategories } from "../hooks/useCategories";
import { useBillReminders, BillReminderWithUrgency } from "../hooks/useBillReminders";
import { useWallets } from "../hooks/useWallets";
import { Modal } from "../components/Modal";
import { DropdownField } from "../components/DropdownField";
import { EmptyState } from "../components/EmptyState";
import { motion, AnimatePresence } from "motion/react";
import { audioFeedback } from "../lib/audio";
import {
  Bell, Plus, Trash2, CheckCircle2, Circle, AlertCircle, Clock,
  Edit2, CalendarDays, Send, Info, AlertTriangle
} from "lucide-react";
import { BillReminder } from "../types";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { Badge } from "../components/ui/Badge";

const REMINDER_HOUR_OPTIONS = [9, 12, 15, 18, 21] as const;
type RecurrenceType = "monthly" | "yearly" | "one_time";

interface BillFormState {
  name: string; category_key: string; amount: string;
  recurrence_type: RecurrenceType; due_day: string; due_date: string; notes: string; wallet_id: string;
}
const emptyForm = (): BillFormState => ({ name: "", category_key: "other", amount: "", recurrence_type: "monthly", due_day: "1", due_date: "", notes: "", wallet_id: "" });
const formatIDR = (num: number | null) => num != null ? "Rp" + Math.round(num).toLocaleString("id-ID") : "-";

export const BillReminders: React.FC = () => {
  const { t, locale } = useLanguage();
  const { user } = useAuth();
  const { showToast } = useToast();
  const { categories } = useCategories();
  const { reminders, loading, refresh } = useBillReminders(user?.id);
  const navigate = useNavigate();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<BillReminderWithUrgency | null>(null);
  const [form, setForm] = useState<BillFormState>(emptyForm());
  const [isSaving, setIsSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<BillReminderWithUrgency | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [toggleConfirmTarget, setToggleConfirmTarget] = useState<BillReminderWithUrgency | null>(null);
  const [isTelegramLinked, setIsTelegramLinked] = useState(false);
  const [billReminderHour, setBillReminderHour] = useState<number>(19);
  const [isSavingReminderHour, setIsSavingReminderHour] = useState(false);
  const { activeWallets } = useWallets();

  useEffect(() => {
    if (!user) return;
    supabase.from("users").select("telegram_chat_id, bill_reminder_hour").eq("id", user.id).single()
      .then(({ data, error }) => {
        if (!error && data) {
          setIsTelegramLinked(!!data.telegram_chat_id);
          if (data.bill_reminder_hour) setBillReminderHour(data.bill_reminder_hour);
        }
      });
  }, [user]);

  const handleSelectReminderHour = async (hour: number) => {
    if (!user || hour === billReminderHour || isSavingReminderHour) return;
    setIsSavingReminderHour(true);
    audioFeedback.playClick();
    const prev = billReminderHour;
    setBillReminderHour(hour);
    const { error } = await supabase.from("users").update({ bill_reminder_hour: hour }).eq("id", user.id);
    if (error) { setBillReminderHour(prev); showToast(t("settings.toast_reminder_hour_failed"), "error"); }
    else showToast(t("settings.toast_reminder_hour_saved", { time: `${String(hour).padStart(2, "0")}:00` }), "success");
    setIsSavingReminderHour(false);
  };

  const expenseCategories = categories.filter(c => c.type === "expense" || c.type === "both");
  const getCategoryLabel = (key: string) => {
    const cat = categories.find(c => c.key === key);
    if (!cat) return key;
    return locale === "id" ? cat.label_id || cat.key : cat.label_en || cat.key;
  };

  const openAddForm = () => { setEditTarget(null); setForm(emptyForm()); setIsFormOpen(true); };
  const openEditForm = (r: BillReminderWithUrgency) => {
    setEditTarget(r);
    setForm({ name: r.name, category_key: r.category_key, amount: r.amount != null ? String(r.amount) : "", recurrence_type: r.recurrence_type, due_day: r.due_day != null ? String(r.due_day) : "1", due_date: r.due_date ?? "", notes: r.notes ?? "", wallet_id: r.wallet_id ?? "" });
    setIsFormOpen(true);
  };

  const handleSave = async () => {
    if (!user) return;
    const trimmedName = form.name.trim();
    if (!trimmedName) { audioFeedback.playDullPluck(); showToast(t("bill_reminders.invalid_name"), "error"); return; }
    const amountNum = form.amount.trim() ? Number(form.amount) : null;
    if (form.amount.trim() && (isNaN(amountNum!) || amountNum! <= 0)) { audioFeedback.playDullPluck(); showToast(t("bill_reminders.invalid_amount"), "error"); return; }
    if (form.recurrence_type === "monthly") {
      const day = Number(form.due_day);
      if (!day || day < 1 || day > 31) { audioFeedback.playDullPluck(); showToast(t("bill_reminders.invalid_due_day"), "error"); return; }
    } else {
      if (!form.due_date) { audioFeedback.playDullPluck(); showToast(t("bill_reminders.invalid_due_date"), "error"); return; }
    }
    setIsSaving(true);
    try {
      const payload = { name: trimmedName, category_key: form.category_key, amount: amountNum, recurrence_type: form.recurrence_type, due_day: form.recurrence_type === "monthly" ? Number(form.due_day) : null, due_date: form.recurrence_type !== "monthly" ? form.due_date : null, notes: form.notes.trim() || null, wallet_id: form.wallet_id || null };
      if (editTarget) await dbService.updateBillReminder(user.id, editTarget.id, payload);
      else await dbService.saveBillReminder(user.id, payload);
      showToast(t("bill_reminders.save_success"), "success");
      audioFeedback.playClick();
      setIsFormOpen(false);
      await refresh();
    } catch { showToast(t("bill_reminders.save_error"), "error"); }
    finally { setIsSaving(false); }
  };

  const handleDeleteConfirmed = async () => {
    if (!user || !deleteTarget) return;
    setIsDeleting(true);
    try {
      const ok = await dbService.deleteBillReminder(user.id, deleteTarget.id);
      if (ok) { showToast(t("bill_reminders.delete_success"), "success"); await refresh(); }
      else showToast(t("bill_reminders.delete_error"), "error");
    } catch { showToast(t("bill_reminders.delete_error"), "error"); }
    finally { setIsDeleting(false); setDeleteTarget(null); }
  };

  const requestTogglePaid = (r: BillReminderWithUrgency) => { audioFeedback.playClick(); setToggleConfirmTarget(r); };
  const executeTogglePaid = async () => {
    if (!user || !toggleConfirmTarget) return;
    const r = toggleConfirmTarget;
    setTogglingId(r.id);
    try {
      if (!r.is_paid) {
        const result = await dbService.markBillPaidWithTransaction(r.id);
        audioFeedback.playClick();
        if (result.needsManualAmount) {
          showToast(t("bill_reminders.marked_paid_needs_amount"), "success");
          setToggleConfirmTarget(null);
          await refresh();
          navigate("/transactions/new", { state: { prefillCategoryKey: r.category_key, prefillNote: r.name, prefillType: "expense" } });
          return;
        }
        showToast(t("bill_reminders.marked_paid"), "success");
      } else {
        await dbService.unmarkBillPaid(r.id);
        audioFeedback.playClick();
        showToast(t("bill_reminders.marked_unpaid"), "success");
      }
      await refresh();
    } catch { showToast(t("bill_reminders.save_error"), "error"); }
    finally { setTogglingId(null); setToggleConfirmTarget(null); }
  };

  // Summary counts
  const overdueCount = reminders.filter(r => !r.is_paid && r.urgency === "overdue").length;
  const dueSoonCount = reminders.filter(r => !r.is_paid && r.urgency === "due_soon").length;
  const paidCount = reminders.filter(r => r.is_paid).length;

  const urgencyConfig = (r: BillReminderWithUrgency) => {
    if (r.is_paid) return { stripe: "bg-emerald-500", badge: "bg-emerald-500/15 text-emerald-400 light_sakura:bg-emerald-50 light_sakura:text-emerald-600", icon: <CheckCircle2 size={11} />, label: t("bill_reminders.status_paid") };
    if (r.urgency === "overdue") return { stripe: "bg-red-500", badge: "bg-red-500/15 text-red-400 light_sakura:bg-red-50 light_sakura:text-red-600", icon: <AlertCircle size={11} />, label: t("bill_reminders.status_overdue") };
    if (r.urgency === "due_soon") return { stripe: "bg-amber-500", badge: "bg-amber-500/15 text-amber-400 light_sakura:bg-amber-50 light_sakura:text-amber-600", icon: <Clock size={11} />, label: t("bill_reminders.status_due_soon") };
    return { stripe: "bg-slate-600", badge: "bg-slate-700/50 text-slate-400 light_sakura:bg-slate-100 light_sakura:text-slate-500", icon: <CalendarDays size={11} />, label: t("bill_reminders.status_upcoming") };
  };

  const dueDateLabel = (r: BillReminderWithUrgency) => {
    if (r.recurrence_type === "monthly") return t("bill_reminders.due_day_label", { day: r.due_day ?? 1 });
    if (r.due_date) { const d = new Date(r.due_date + "T00:00:00"); return d.toLocaleDateString(locale === "id" ? "id-ID" : "en-GB", { day: "numeric", month: "long", year: r.recurrence_type === "one_time" ? "numeric" : undefined }); }
    return "-";
  };

  const recurrenceLabel = (type: string) => {
    if (type === "monthly") return t("bill_reminders.recurrence_monthly");
    if (type === "yearly") return t("bill_reminders.recurrence_yearly");
    return t("bill_reminders.recurrence_one_time");
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">

      {/* ── Main card ──────────────────────────────────────────────── */}
      <Card className="rounded-3xl border-slate-800/60 light_sakura:border-rose-100/40 overflow-hidden p-0 shadow-lg">
        <div className="h-1.5 w-full bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-600" />
        <div className="p-6 md:p-8 space-y-6">

          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div>
              <h1 className="font-sans font-bold text-2xl tracking-tight text-white light_sakura:text-slate-900">
                {t("bill_reminders.page_title")}
              </h1>
              <p className="text-sm text-slate-400 mt-1 light_sakura:text-slate-500 leading-relaxed">
                {t("bill_reminders.page_subtitle")}
              </p>
            </div>
            <Button onClick={() => { audioFeedback.playClick(); openAddForm(); }}
              variant="primary"
              className="px-5 py-2.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-white font-semibold text-sm transition-colors shadow-lg shadow-emerald-500/20 shrink-0 light_sakura:bg-rose-500 light_sakura:hover:bg-rose-400 light_sakura:shadow-rose-500/20 cursor-pointer">
              <Plus size={16} /> {t("bill_reminders.add_button")}
            </Button>
          </div>

          {/* ── Counter stats: formasi strip chip horizontal ─────────── */}
          {reminders.length > 0 && (
            <div className="flex items-center gap-2.5 overflow-x-auto pb-1 -mx-1 px-1">
              <div className="shrink-0 flex items-center gap-2 pl-3 pr-4 py-2 rounded-2xl bg-red-500/8 border border-red-500/15 light_sakura:bg-red-50/60 light_sakura:border-red-100">
                <AlertCircle size={13} className="text-red-400" />
                <span className="font-bold text-lg text-red-400 light_sakura:text-red-600 leading-none">{overdueCount}</span>
                <span className="text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold uppercase tracking-wider text-slate-500 leading-none">Terlambat</span>
              </div>
              <div className="shrink-0 flex items-center gap-2 pl-3 pr-4 py-2 rounded-2xl bg-amber-500/8 border border-amber-500/15 light_sakura:bg-amber-50/60 light_sakura:border-amber-100">
                <AlertTriangle size={13} className="text-amber-400" />
                <span className="font-bold text-lg text-amber-400 light_sakura:text-amber-600 leading-none">{dueSoonCount}</span>
                <span className="text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold uppercase tracking-wider text-slate-500 leading-none">Segera</span>
              </div>
              <div className="shrink-0 flex items-center gap-2 pl-3 pr-4 py-2 rounded-2xl bg-emerald-500/8 border border-emerald-500/15 light_sakura:bg-emerald-50/60 light_sakura:border-emerald-100">
                <CheckCircle2 size={13} className="text-emerald-400" />
                <span className="font-bold text-lg text-emerald-400 light_sakura:text-emerald-600 leading-none">{paidCount}</span>
                <span className="text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold uppercase tracking-wider text-slate-500 leading-none">Lunas</span>
              </div>
            </div>
          )}

          {/* Telegram reminder hour */}
          {isTelegramLinked ? (
            <div className="p-4 rounded-2xl bg-slate-950/40 border border-slate-800/50 light_sakura:bg-rose-50/20 light_sakura:border-rose-100/30 space-y-3">
              <h4 className="font-sans font-bold text-[clamp(0.5625rem,2.6vw,0.625rem)] text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                <Send size={12} className="text-indigo-400 -translate-x-0.5 rotate-45" />
                {t("settings.reminder_hour_title")}
              </h4>
              <p className="text-[clamp(0.6188rem,2.86vw,0.6875rem)] text-slate-400 light_sakura:text-slate-600">{t("settings.reminder_hour_desc")}</p>
              <div className="flex flex-wrap gap-2">
                {REMINDER_HOUR_OPTIONS.map(hour => (
                  <motion.button key={hour} whileTap={{ scale: 0.95 }} type="button" disabled={isSavingReminderHour}
                    onClick={() => handleSelectReminderHour(hour)}
                    className={`cursor-pointer px-3.5 py-2 rounded-xl text-xs font-bold font-mono transition-colors disabled:opacity-50 ${billReminderHour === hour ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20 light_sakura:bg-rose-500" : "bg-slate-800/60 text-slate-400 hover:bg-slate-700/60 light_sakura:bg-rose-50/60 light_sakura:text-slate-500"}`}>
                    {String(hour).padStart(2, "0")}.00
                  </motion.button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-2.5 p-4 rounded-2xl bg-slate-950/40 border border-slate-800/50 light_sakura:bg-rose-50/20 light_sakura:border-rose-100/30">
              <Info size={14} className="text-indigo-400 shrink-0 mt-0.5" />
              <p className="text-[clamp(0.6188rem,2.86vw,0.6875rem)] text-slate-400 light_sakura:text-slate-600">{t("bill_reminders.connect_telegram_hint")}</p>
            </div>
          )}

          {/* ── Bill cards grid ──────────────────────────────────────── */}
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
            </div>
          ) : reminders.length === 0 ? (
            <EmptyState icon={<Bell size={40} className="text-slate-600 light_sakura:text-slate-400" />} title={t("bill_reminders.empty_title")} description={t("bill_reminders.empty_desc")} />
          ) : (
            <AnimatePresence>
              {/* ── Formasi timeline: diurutkan dari yang paling mendesak ── */}
              <div className="relative pl-5 before:content-[''] before:absolute before:left-[7px] before:top-1.5 before:bottom-1.5 before:w-px before:bg-slate-800 light_sakura:before:bg-rose-100">
                {[...reminders]
                  .sort((a, b) => {
                    const rank = (r: BillReminderWithUrgency) => r.is_paid ? 3 : r.urgency === "overdue" ? 0 : r.urgency === "due_soon" ? 1 : 2;
                    const rd = rank(a) - rank(b);
                    if (rd !== 0) return rd;
                    return (a.daysUntilDue ?? 9999) - (b.daysUntilDue ?? 9999);
                  })
                  .map((r, idx, arr) => {
                    const cfg = urgencyConfig(r);
                    const groupLabel = idx === 0 || (arr[idx - 1].is_paid !== r.is_paid) || (arr[idx - 1].urgency !== r.urgency)
                      ? cfg.label : null;
                    return (
                      <React.Fragment key={r.id}>
                        {groupLabel && (
                          <div className="text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold uppercase tracking-widest text-slate-500 mb-2 mt-5 first:mt-0">{groupLabel}</div>
                        )}
                        <motion.div initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }}
                          className="relative mb-3">
                          {/* Timeline dot */}
                          <span className={`absolute -left-5 top-4 w-2.5 h-2.5 rounded-full ring-4 ring-slate-900 light_sakura:ring-white ${cfg.stripe}`} />
                          <div className="rounded-2xl border border-slate-800/50 bg-slate-950/40 overflow-hidden light_sakura:bg-rose-50/20 light_sakura:border-rose-100/30">
                            <div className="p-4 space-y-3">
                              {/* Top row */}
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="font-sans font-bold text-sm text-slate-100 light_sakura:text-slate-900 truncate">{r.name}</p>
                                  <p className="text-[clamp(0.6188rem,2.86vw,0.6875rem)] text-slate-500 mt-0.5">{getCategoryLabel(r.category_key)} · {recurrenceLabel(r.recurrence_type)} · {dueDateLabel(r)}</p>
                                </div>
                                <span className="font-mono font-bold text-sm text-slate-200 light_sakura:text-slate-700 shrink-0">{formatIDR(r.amount)}</span>
                              </div>

                              {/* Status + days left */}
                              <div className="flex items-center justify-between">
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold shrink-0 ${cfg.badge}`}>{cfg.icon}{cfg.label}</span>
                                {!r.is_paid && r.urgency !== "overdue" && (
                                  <span className="text-[clamp(0.6188rem,2.86vw,0.6875rem)] text-slate-400 light_sakura:text-slate-500">{t("bill_reminders.days_left", { days: r.daysUntilDue })}</span>
                                )}
                              </div>
                              {r.notes && <p className="text-[clamp(0.6188rem,2.86vw,0.6875rem)] text-slate-500 italic truncate">{r.notes}</p>}

                              {/* Actions */}
                              <div className="flex items-center gap-2 pt-1">
                                <button onClick={() => requestTogglePaid(r)} disabled={togglingId === r.id}
                                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50 ${r.is_paid ? "bg-slate-700/60 text-slate-400 hover:bg-slate-700 light_sakura:bg-slate-100 light_sakura:text-slate-500" : "bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 light_sakura:bg-emerald-50 light_sakura:text-emerald-600"}`}>
                                  {togglingId === r.id ? <div className="w-3.5 h-3.5 border border-current border-t-transparent rounded-full animate-spin" /> : r.is_paid ? <><Circle size={12} /> {t("bill_reminders.mark_unpaid")}</> : <><CheckCircle2 size={12} /> {t("bill_reminders.mark_paid")}</>}
                                </button>
                                <button onClick={() => { audioFeedback.playClick(); openEditForm(r); }} className="p-2 rounded-xl bg-slate-700/50 text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors cursor-pointer light_sakura:bg-slate-100 light_sakura:text-slate-500"><Edit2 size={13} /></button>
                                <button onClick={() => { audioFeedback.playClick(); setDeleteTarget(r); }} className="p-2 rounded-xl bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors cursor-pointer light_sakura:bg-red-50 light_sakura:text-red-400"><Trash2 size={13} /></button>
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      </React.Fragment>
                    );
                  })}
              </div>
            </AnimatePresence>
          )}
        </div>
      </Card>

      {/* ── Form modal ──────────────────────────────────────────────── */}
      <AnimatePresence>
        {isFormOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm"
            onClick={e => { if (e.target === e.currentTarget) setIsFormOpen(false); }}>
            <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 40 }}
              className="w-full max-w-md bg-slate-900 light_sakura:bg-white rounded-3xl border border-slate-800 light_sakura:border-slate-200 shadow-2xl overflow-hidden">
              <div className="h-1 w-full bg-gradient-to-r from-emerald-500 to-teal-400" />
              <div className="p-6 space-y-4">
                <h2 className="font-sans font-bold text-lg text-slate-100 light_sakura:text-slate-900">
                  {editTarget ? t("bill_reminders.edit_title") : t("bill_reminders.add_title")}
                </h2>
                {/* Name */}
                <Input
                  label={t("bill_reminders.form_name")}
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder={t("bill_reminders.form_name_placeholder")}
                />
                {/* Category */}
                <div>
                  <label className="block text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold text-slate-400 uppercase tracking-wider mb-1.5">{t("bill_reminders.form_category")}</label>
                  <DropdownField
                    value={form.category_key}
                    onChange={(v) => setForm(f => ({ ...f, category_key: v }))}
                    options={expenseCategories.map(c => ({ value: c.key, label: locale === "id" ? c.label_id || c.key : c.label_en || c.key }))}
                  />
                </div>
                {/* Amount */}
                <Input
                  label={t("bill_reminders.form_amount")}
                  type="number"
                  value={form.amount}
                  onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                  placeholder={t("bill_reminders.form_amount_placeholder")}
                  min={0}
                />
                {/* Recurrence */}
                <div>
                  <label className="block text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold text-slate-400 uppercase tracking-wider mb-1.5">{t("bill_reminders.form_recurrence")}</label>
                  <div className="flex gap-2">
                    {(["monthly", "yearly", "one_time"] as RecurrenceType[]).map(type => (
                      <button key={type} onClick={() => setForm(f => ({ ...f, recurrence_type: type }))} className={`flex-1 py-2.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${form.recurrence_type === type ? "bg-emerald-500 text-white light_sakura:bg-rose-500" : "bg-slate-800 text-slate-400 hover:bg-slate-700 light_sakura:bg-slate-100 light_sakura:text-slate-600"}`}>
                        {type === "monthly" ? t("bill_reminders.recurrence_monthly") : type === "yearly" ? t("bill_reminders.recurrence_yearly") : t("bill_reminders.recurrence_one_time")}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Due day/date */}
                {form.recurrence_type === "monthly" ? (
                  <Input
                    label={t("bill_reminders.form_due_day")}
                    type="number"
                    value={form.due_day}
                    onChange={e => setForm(f => ({ ...f, due_day: e.target.value }))}
                    min={1}
                    max={31}
                  />
                ) : (
                  <Input
                    label={t("bill_reminders.form_due_date")}
                    type="date"
                    value={form.due_date}
                    onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
                  />
                )}
                {/* Notes */}
                <div>
                  <label className="block text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold text-slate-400 uppercase tracking-wider mb-1.5">{t("wallet.label_pos")}</label>
                  <DropdownField
                    value={form.wallet_id}
                    onChange={(v) => setForm(f => ({ ...f, wallet_id: v }))}
                    options={[
                      { value: "", label: t("wallet.group_general") },
                      ...activeWallets.filter(w => w.type !== "general").map(w => ({ value: w.id, label: `${w.name}${w.provider ? ` · ${w.provider}` : ""}` }))
                    ]}
                  />
                </div>
                <Input
                  label={t("bill_reminders.form_notes")}
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder={t("bill_reminders.form_notes_placeholder")}
                />
                {/* Actions */}
                <div className="flex gap-3 pt-1">
                  <Button variant="secondary" onClick={() => setIsFormOpen(false)} className="flex-1 py-3 text-sm">
                    {t("common.cancel")}
                  </Button>
                  <Button
                    variant="primary"
                    onClick={handleSave}
                    disabled={isSaving}
                    loading={isSaving}
                    className="flex-1 py-3 text-sm bg-emerald-500 hover:bg-emerald-400 light_sakura:bg-rose-500 light_sakura:hover:bg-rose-400 text-white shadow-lg shadow-emerald-500/20"
                  >
                    {t("common.save")}
                  </Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <Modal isOpen={!!deleteTarget} title={t("bill_reminders.delete_confirm_title")} description={t("bill_reminders.delete_confirm_desc", { name: deleteTarget?.name ?? "" })} type="danger" confirmLabel={t("common.delete")} cancelLabel={t("common.cancel")} onConfirm={handleDeleteConfirmed} onCancel={() => setDeleteTarget(null)} />
      <Modal isOpen={!!toggleConfirmTarget} title={toggleConfirmTarget?.is_paid ? t("bill_reminders.unmark_confirm_title") : t("bill_reminders.mark_confirm_title")} description={toggleConfirmTarget?.is_paid ? t("bill_reminders.unmark_confirm_desc", { name: toggleConfirmTarget?.name ?? "" }) : toggleConfirmTarget?.amount != null ? t("bill_reminders.mark_confirm_desc_with_amount", { name: toggleConfirmTarget?.name ?? "", amount: formatIDR(toggleConfirmTarget?.amount ?? null) }) : t("bill_reminders.mark_confirm_desc_no_amount", { name: toggleConfirmTarget?.name ?? "" })} type="warning" confirmLabel={t("bill_reminders.mark_confirm_button")} cancelLabel={t("common.cancel")} onConfirm={executeTogglePaid} onCancel={() => setToggleConfirmTarget(null)} confirmDisabled={togglingId === toggleConfirmTarget?.id} />
    </motion.div>
  );
};
