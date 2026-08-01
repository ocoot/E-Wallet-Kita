import React, { useState, useEffect } from "react";
import { useLanguage } from "../contexts/LanguageContext";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { dbService } from "../lib/db";
import { withErrorReporting } from "../lib/errorReporter";
import { supabase } from "../lib/supabase";
import { useCategories } from "../hooks/useCategories";
import { useBillReminders, BillReminderWithUrgency } from "../hooks/useBillReminders";
import { useWallets } from "../hooks/useWallets";
import { Modal } from "../components/Modal";
import { DropdownField } from "../components/DropdownField";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { useLockBodyScroll } from "../hooks/useLockBodyScroll";
import { ModalShell } from "../components/ui/ModalShell";
import { useThemeTokens } from "../hooks/useThemeTokens";
import { useBackGestureTrap } from "../hooks/useBackGestureTrap";
import { motion, AnimatePresence } from "motion/react";
import { audioFeedback } from "../lib/audio";
import { Input } from "../components/ui/Input";
import { CurrencyInput } from "../components/ui/CurrencyInput";
import { Button } from "../components/ui/Button";
import {
  Bell, Plus, Trash2, CheckCircle2, Circle, AlertCircle, Clock,
  Edit2, CalendarDays, Send, Info, AlertTriangle
} from "lucide-react";
import { BillReminder } from "../types";
import { CollapsingPageHeader } from "../components/CollapsingPageHeader";
import { useNavigate } from "react-router-dom";

const REMINDER_HOUR_OPTIONS = [9, 12, 15, 18, 21] as const;
type RecurrenceType = "monthly" | "yearly" | "one_time";

interface BillFormState {
  name: string; category_key: string; amount: string;
  recurrence_type: RecurrenceType; due_day: string; due_date: string; notes: string; wallet_id: string;
}
const emptyForm = (): BillFormState => ({ name: "", category_key: "other", amount: "", recurrence_type: "monthly", due_day: "1", due_date: "", notes: "", wallet_id: "" });
const formatIDR = (num: number | null) => num != null ? "Rp\u00A0" + Math.round(num).toLocaleString("id-ID") : "-";

export const BillReminders: React.FC = () => {
  const { t, locale } = useLanguage();
  const { user } = useAuth();
  const { showToast } = useToast();
  const { categories } = useCategories();
  const { reminders, loading, error: remindersError, refresh } = useBillReminders(user?.id);
  const navigate = useNavigate();
  const { tokens, cx } = useThemeTokens();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<BillReminderWithUrgency | null>(null);
  const [form, setForm] = useState<BillFormState>(emptyForm());
  const [isSaving, setIsSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<BillReminderWithUrgency | null>(null);
  useLockBodyScroll(isFormOpen);
  // Menjebak swipe-back/tombol-back HP saat form modal ini terbuka, supaya
  // menutup modal (tetap di halaman Pengingat Tagihan) -- bukan malah
  // menavigasi balik ke halaman sebelumnya (lihat useBackGestureTrap.ts).
  const { close: closeForm } = useBackGestureTrap(isFormOpen, setIsFormOpen);
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
      await withErrorReporting(
        "frontend:bill-reminders",
        async () => {
          const payload = { name: trimmedName, category_key: form.category_key, amount: amountNum, recurrence_type: form.recurrence_type, due_day: form.recurrence_type === "monthly" ? Number(form.due_day) : null, due_date: form.recurrence_type !== "monthly" ? form.due_date : null, notes: form.notes.trim() || null, wallet_id: form.wallet_id || null };
          if (editTarget) await dbService.updateBillReminder(user.id, editTarget.id, payload);
          else await dbService.saveBillReminder(user.id, payload);
          showToast(t("bill_reminders.save_success"), "success");
          audioFeedback.playClick();
          closeForm();
          await refresh();
        },
        { action: editTarget ? "update" : "create" }
      );
    } catch { showToast(t("bill_reminders.save_error"), "error"); }
    finally { setIsSaving(false); }
  };

  const handleDeleteConfirmed = async () => {
    if (!user || !deleteTarget) return;
    setIsDeleting(true);
    try {
      await withErrorReporting(
        "frontend:bill-reminders",
        async () => {
          const ok = await dbService.deleteBillReminder(user.id, deleteTarget.id);
          if (ok) { showToast(t("bill_reminders.delete_success"), "success"); await refresh(); }
          else showToast(t("bill_reminders.delete_error"), "error");
        },
        { action: "delete", reminderId: deleteTarget.id }
      );
    } catch { showToast(t("bill_reminders.delete_error"), "error"); }
    finally { setIsDeleting(false); setDeleteTarget(null); }
  };

  const requestTogglePaid = (r: BillReminderWithUrgency) => { audioFeedback.playClick(); setToggleConfirmTarget(r); };
  const executeTogglePaid = async () => {
    if (!user || !toggleConfirmTarget) return;
    const r = toggleConfirmTarget;
    setTogglingId(r.id);
    try {
      await withErrorReporting(
        "frontend:bill-reminders",
        async () => {
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
        },
        { action: r.is_paid ? "mark-unpaid" : "mark-paid", reminderId: r.id }
      );
    } catch { showToast(t("bill_reminders.save_error"), "error"); }
    finally { setTogglingId(null); setToggleConfirmTarget(null); }
  };

  // Summary counts
  const overdueCount = reminders.filter(r => !r.is_paid && r.urgency === "overdue").length;
  const dueSoonCount = reminders.filter(r => !r.is_paid && r.urgency === "due_soon").length;
  const paidCount = reminders.filter(r => r.is_paid).length;

  const urgencyConfig = (r: BillReminderWithUrgency) => {
    if (r.is_paid) return { stripe: "bg-emerald-500", badge: cx(tokens.billReminders.badgePaid, tokens.text.success), icon: <CheckCircle2 size={11} />, label: t("bill_reminders.status_paid") };
    if (r.urgency === "overdue") return { stripe: "bg-red-500", badge: cx(tokens.billReminders.badgeOverdue, tokens.text.danger), icon: <AlertCircle size={11} />, label: t("bill_reminders.status_overdue") };
    if (r.urgency === "due_soon") return { stripe: "bg-amber-500", badge: cx(tokens.billReminders.badgeDueSoon, tokens.text.warning), icon: <Clock size={11} />, label: t("bill_reminders.status_due_soon") };
    return { stripe: "bg-slate-600", badge: cx(tokens.billReminders.badgeUpcoming, tokens.text.muted), icon: <CalendarDays size={11} />, label: t("bill_reminders.status_upcoming") };
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

      {/* ── Main content ───────────────────────────────────────────── */}
      <CollapsingPageHeader
        title={t("bill_reminders.page_title")}
        subtitle={t("bill_reminders.page_subtitle")}
        actions={
          <button
            type="button"
            onClick={() => { audioFeedback.playClick(); openAddForm(); }}
            aria-label={t("bill_reminders.add_button")}
            className={cx("p-1.5 rounded-full cursor-pointer active:scale-[0.92] transition-transform", tokens.text.secondary)}
          >
            <Plus size={18} />
          </button>
        }
      >

          {/* Tombol Add SUDAH dipindah ke actions slot di sticky toolbar --
              sengaja TIDAK didobel di sini. */}

          {/* ── Counter stats: formasi strip chip horizontal ─────────── */}
          {/* Catatan: chip ini SENGAJA memakai surface.card (opaque) sebagai
              dasar, bukan tint transparan (mis. bg-red-500/5) seperti versi
              sebelumnya -- tint transparan menampakkan apa pun yang ada DI
              BELAKANGnya (termasuk batas ribbon/canvas dari
              PageRibbonBackground.tsx), yang terlihat seperti garis
              memotong chip ini kalau baris ini kebetulan jatuh persis di
              batas tersebut. Warna/aksen sekarang dari border-l tebal +
              ikon, bukan dari bg transparan, supaya tetap terlihat berbeda
              tanpa bergantung pada apa pun di baliknya. */}
          {reminders.length > 0 && (
            <div className="flex items-center gap-2.5 overflow-x-auto scrollbar-hide pb-1 -mx-1 px-1">
              <div className={cx("shrink-0 flex items-center gap-2 pl-3 pr-4 py-2.5 rounded-full border border-l-4 border-l-red-500", tokens.surface.card, tokens.border.default)}>
                <AlertCircle size={13} className={cx(tokens.text.danger)} />
                <span className={cx("font-bold text-lg leading-none tabular-nums", tokens.text.danger)}>{overdueCount}</span>
                <span className={cx("text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold uppercase tracking-wider leading-none", tokens.text.muted)}>Terlambat</span>
              </div>
              <div className={cx("shrink-0 flex items-center gap-2 pl-3 pr-4 py-2.5 rounded-full border border-l-4 border-l-amber-500", tokens.surface.card, tokens.border.default)}>
                <AlertTriangle size={13} className={cx(tokens.text.warning)} />
                <span className={cx("font-bold text-lg leading-none tabular-nums", tokens.text.warning)}>{dueSoonCount}</span>
                <span className={cx("text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold uppercase tracking-wider leading-none", tokens.text.muted)}>Segera</span>
              </div>
              <div className={cx("shrink-0 flex items-center gap-2 pl-3 pr-4 py-2.5 rounded-full border border-l-4 border-l-emerald-500", tokens.surface.card, tokens.border.default)}>
                <CheckCircle2 size={13} className={cx(tokens.text.success)} />
                <span className={cx("font-bold text-lg leading-none tabular-nums", tokens.text.success)}>{paidCount}</span>
                <span className={cx("text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold uppercase tracking-wider leading-none", tokens.text.muted)}>Lunas</span>
              </div>
            </div>
          )}


          {/* Telegram reminder hour */}
          {isTelegramLinked ? (
            <div className={cx("p-4 rounded-2xl border space-y-3", tokens.surface.card, tokens.border.default)}>
              <h4 className="font-sans font-bold text-[clamp(0.5625rem,2.6vw,0.625rem)] text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                <Send size={12} className="text-indigo-400 -translate-x-0.5 rotate-45" />
                {t("settings.reminder_hour_title")}
              </h4>
              <p className={cx("text-[clamp(0.6188rem,2.86vw,0.6875rem)]", tokens.text.mutedAlt)}>{t("settings.reminder_hour_desc")}</p>
              <div className="flex flex-wrap gap-2">
                {REMINDER_HOUR_OPTIONS.map(hour => (
                  <motion.button key={hour} whileTap={{ scale: 0.95 }} type="button" disabled={isSavingReminderHour}
                    onClick={() => handleSelectReminderHour(hour)}
                    className={cx(
                      "cursor-pointer px-3.5 py-2 rounded-full text-xs font-bold font-mono transition-all active:scale-95 disabled:opacity-50",
                      billReminderHour === hour
                        ? "bg-emerald-500 hover:bg-emerald-400 text-white shadow-sm light_sakura:bg-rose-500 light_sakura:hover:bg-rose-400"
                        : cx(tokens.surface.subtle, tokens.hover.surface, tokens.text.muted)
                    )}>
                    {String(hour).padStart(2, "0")}.00
                  </motion.button>
                ))}
              </div>
            </div>
          ) : (
            <div className={cx("flex items-start gap-2.5 p-4 rounded-2xl border", tokens.surface.card, tokens.border.default)}>
              <Info size={14} className="text-indigo-400 shrink-0 mt-0.5" />
              <p className={cx("text-[clamp(0.6188rem,2.86vw,0.6875rem)]", tokens.text.mutedAlt)}>{t("bill_reminders.connect_telegram_hint")}</p>
            </div>
          )}

          {/* ── Bill cards grid ──────────────────────────────────────── */}
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
            </div>
          ) : remindersError ? (
            <ErrorState onRetry={refresh} />
          ) : reminders.length === 0 ? (
            <EmptyState icon={<Bell size={40} className={cx(tokens.text.muted)} />} title={t("bill_reminders.empty_title")} description={t("bill_reminders.empty_desc")} />
          ) : (
            <AnimatePresence>
              {/* ── Formasi timeline: diurutkan dari yang paling mendesak ── */}
              <div className={cx("relative pl-5 before:content-[''] before:absolute before:left-[7px] before:top-1.5 before:bottom-1.5 before:w-px", tokens.billReminders.timelineLine)}>
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
                          <div className={cx("text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold uppercase tracking-widest mb-2 mt-5 first:mt-0", tokens.text.muted)}>{groupLabel}</div>
                        )}
                        <motion.div initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }}
                          className="relative mb-3">
                          {/* Timeline dot */}
                          <span className={cx("absolute -left-5 top-4 w-2.5 h-2.5 rounded-full ring-4", tokens.billReminders.timelineRing, cfg.stripe)} />
                          <div className={cx("rounded-2xl border overflow-hidden transition-shadow duration-200 hover:shadow-lg hover:shadow-black/5 light_sakura:hover:shadow-slate-200/60", tokens.surface.card, tokens.border.default)}>
                            <div className="p-4 space-y-3">
                              {/* Top row */}
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className={cx("font-sans font-bold text-sm truncate tracking-tight", tokens.text.heading)}>{r.name}</p>
                                  <p className="text-[clamp(0.6188rem,2.86vw,0.6875rem)] text-slate-500 mt-0.5">{getCategoryLabel(r.category_key)} · {recurrenceLabel(r.recurrence_type)} · {dueDateLabel(r)}</p>
                                </div>
                                <span className={cx("font-mono tabular-nums font-bold text-sm shrink-0", tokens.text.primary)}>{formatIDR(r.amount)}</span>
                              </div>

                              {/* Status + days left */}
                              <div className="flex items-center justify-between">
                                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold shrink-0 ${cfg.badge}`}>{cfg.icon}{cfg.label}</span>
                                {!r.is_paid && r.urgency !== "overdue" && (
                                  <span className={cx("text-[clamp(0.6188rem,2.86vw,0.6875rem)]", tokens.text.muted)}>{t("bill_reminders.days_left", { days: r.daysUntilDue })}</span>
                                )}
                              </div>
                              {r.notes && <p className="text-[clamp(0.6188rem,2.86vw,0.6875rem)] text-slate-500 italic truncate">{r.notes}</p>}

                              {/* Actions */}
                              <div className="flex items-center gap-2 pt-1">
                                <button onClick={() => requestTogglePaid(r)} disabled={togglingId === r.id}
                                  className={cx(
                                    "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-full text-xs font-bold transition-all active:scale-[0.97] cursor-pointer disabled:opacity-50",
                                    r.is_paid
                                      ? cx(tokens.surface.subtle, tokens.hover.surface, tokens.text.muted)
                                      : cx("bg-emerald-500/10 hover:bg-emerald-500/20", tokens.text.success)
                                  )}>
                                  {togglingId === r.id ? <div className="w-3.5 h-3.5 border border-current border-t-transparent rounded-full animate-spin" /> : r.is_paid ? <><Circle size={12} /> {t("bill_reminders.mark_unpaid")}</> : <><CheckCircle2 size={12} /> {t("bill_reminders.mark_paid")}</>}
                                </button>
                                <button onClick={() => { audioFeedback.playClick(); openEditForm(r); }} className={cx("p-2 rounded-full transition-all active:scale-90 cursor-pointer", tokens.chip.editIconBtn)}><Edit2 size={13} /></button>
                                <button onClick={() => { audioFeedback.playClick(); setDeleteTarget(r); }} className={cx("p-2 rounded-full bg-red-500/10 hover:bg-red-500/20 transition-all active:scale-90 cursor-pointer", tokens.text.danger)}><Trash2 size={13} /></button>
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
      </CollapsingPageHeader>

      {/* ── Form modal ──────────────────────────────────────────────── */}
      <ModalShell
        isOpen={isFormOpen}
        onClose={closeForm}
        maxWidth="max-w-md"
        labelledBy="bill-reminder-form-title"
        className="overflow-hidden"
      >
        <div className="h-1 w-full bg-gradient-to-r from-emerald-500 to-teal-400" />
        <div className="p-6 space-y-4">
          <h2 id="bill-reminder-form-title" className={cx("font-sans font-extrabold text-lg tracking-tight", tokens.text.heading)}>
            {editTarget ? t("bill_reminders.edit_title") : t("bill_reminders.add_title")}
          </h2>
          {/* Name */}
          <Input
            type="text"
            label={t("bill_reminders.form_name")}
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder={t("bill_reminders.form_name_placeholder")}
          />
          {/* Category */}
          <div>
            <label className={cx("block text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold uppercase tracking-wider mb-1.5", tokens.text.muted)}>{t("bill_reminders.form_category")}</label>
            <DropdownField
              value={form.category_key}
              onChange={(v) => setForm(f => ({ ...f, category_key: v }))}
              options={expenseCategories.map(c => ({ value: c.key, label: locale === "id" ? c.label_id || c.key : c.label_en || c.key }))}
            />
          </div>
          {/* Amount */}
          <CurrencyInput
            label={t("bill_reminders.form_amount")}
            value={form.amount}
            onValueChange={digits => setForm(f => ({ ...f, amount: digits }))}
            placeholder={t("bill_reminders.form_amount_placeholder")}
          />
          {/* Recurrence */}
          <div>
            <label className={cx("block text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold uppercase tracking-wider mb-1.5", tokens.text.muted)}>{t("bill_reminders.form_recurrence")}</label>
            <div className="flex gap-2">
              {(["monthly", "yearly", "one_time"] as RecurrenceType[]).map(type => (
                <button key={type} onClick={() => setForm(f => ({ ...f, recurrence_type: type }))}
                  className={cx(
                    "flex-1 py-2.5 rounded-full text-xs font-bold transition-all active:scale-95 cursor-pointer",
                    form.recurrence_type === type
                      ? "bg-emerald-500 hover:bg-emerald-400 text-white light_sakura:bg-rose-500 light_sakura:hover:bg-rose-400"
                      : cx(tokens.surface.subtle, tokens.hover.surface, tokens.text.muted)
                  )}>
                  {type === "monthly" ? t("bill_reminders.recurrence_monthly") : type === "yearly" ? t("bill_reminders.recurrence_yearly") : t("bill_reminders.recurrence_one_time")}
                </button>
              ))}
            </div>
          </div>
          {/* Due day/date */}
          {form.recurrence_type === "monthly" ? (
            <Input
              type="number"
              label={t("bill_reminders.form_due_day")}
              value={form.due_day}
              onChange={e => setForm(f => ({ ...f, due_day: e.target.value }))}
              min={1}
              max={31}
            />
          ) : (
            <Input
              type="date"
              label={t("bill_reminders.form_due_date")}
              value={form.due_date}
              onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
            />
          )}
          {/* Notes */}
          <div>
            <label className={cx("block text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold uppercase tracking-wider mb-1.5", tokens.text.muted)}>{t("wallet.label_pos")}</label>
            <DropdownField
              value={form.wallet_id}
              onChange={(v) => setForm(f => ({ ...f, wallet_id: v }))}
              options={activeWallets.map((w) => {
                const icon = w.type === "general" ? "" : w.type === "ewallet" ? "" : w.type === "bank" ? "" : "";
                const label = w.type === "general" ? t("wallet.group_general") : `${w.name}${(w.provider && w.provider !== w.name) ? ` · ${w.provider}` : ""}`;
                return { value: w.type === "general" ? "" : w.id, label: `${icon} ${label} (${formatIDR(w.balance)})` };
              })}
            />
          </div>
          <Input
            type="text"
            label={t("bill_reminders.form_notes")}
            value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            placeholder={t("bill_reminders.form_notes_placeholder")}
          />
          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <Button variant="secondary" onClick={closeForm} className="flex-1 py-3 rounded-full font-bold text-sm">{t("common.cancel")}</Button>
            <Button variant="success" onClick={handleSave} disabled={isSaving} isLoading={isSaving} className="flex-1 py-3 rounded-full font-bold text-sm">{t("common.save")}</Button>
          </div>
        </div>
      </ModalShell>

      <Modal isOpen={!!deleteTarget} title={t("bill_reminders.delete_confirm_title")} description={t("bill_reminders.delete_confirm_desc", { name: deleteTarget?.name ?? "" })} type="danger" confirmLabel={t("common.delete")} cancelLabel={t("common.cancel")} onConfirm={handleDeleteConfirmed} onCancel={() => setDeleteTarget(null)} />
      <Modal isOpen={!!toggleConfirmTarget} title={toggleConfirmTarget?.is_paid ? t("bill_reminders.unmark_confirm_title") : t("bill_reminders.mark_confirm_title")} description={toggleConfirmTarget?.is_paid ? t("bill_reminders.unmark_confirm_desc", { name: toggleConfirmTarget?.name ?? "" }) : toggleConfirmTarget?.amount != null ? t("bill_reminders.mark_confirm_desc_with_amount", { name: toggleConfirmTarget?.name ?? "", amount: formatIDR(toggleConfirmTarget?.amount ?? null) }) : t("bill_reminders.mark_confirm_desc_no_amount", { name: toggleConfirmTarget?.name ?? "" })} type="warning" confirmLabel={t("bill_reminders.mark_confirm_button")} cancelLabel={t("common.cancel")} onConfirm={executeTogglePaid} onCancel={() => setToggleConfirmTarget(null)} confirmDisabled={togglingId === toggleConfirmTarget?.id} />
    </motion.div>
  );
};
