import React, { useState, useEffect } from "react";
import { useLanguage } from "../contexts/LanguageContext";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { dbService } from "../lib/db";
import { supabase } from "../lib/supabase";
import { useCategories } from "../hooks/useCategories";
import { useBillReminders, BillReminderWithUrgency } from "../hooks/useBillReminders";
import { Modal } from "../components/Modal";
import { EmptyState } from "../components/EmptyState";
import { motion, AnimatePresence } from "motion/react";
import { audioFeedback } from "../lib/audio";
import {
  Bell,
  Plus,
  Trash2,
  CheckCircle2,
  Circle,
  AlertCircle,
  Clock,
  Edit2,
  CalendarDays,
  Send,
  Info
} from "lucide-react";
import { BillReminder } from "../types";
import { useNavigate } from "react-router-dom";

// Preferensi jam reminder tagihan Telegram (09/12/15/18/21), default 19
// mengikuti fallback di RPC get_due_bill_reminders_for_notification.
const REMINDER_HOUR_OPTIONS = [9, 12, 15, 18, 21] as const;

// ──────────────────────────────────────────────
// Tipe form state
// ──────────────────────────────────────────────
type RecurrenceType = "monthly" | "yearly" | "one_time";

interface BillFormState {
  name: string;
  category_key: string;
  amount: string;
  recurrence_type: RecurrenceType;
  due_day: string;       // untuk monthly
  due_date: string;      // untuk yearly/one_time (YYYY-MM-DD)
  notes: string;
}

const emptyForm = (): BillFormState => ({
  name: "",
  category_key: "other",
  amount: "",
  recurrence_type: "monthly",
  due_day: "1",
  due_date: "",
  notes: ""
});

// ──────────────────────────────────────────────
// Helper format
// ──────────────────────────────────────────────
const formatIDR = (num: number | null) =>
  num != null ? "Rp" + Math.round(num).toLocaleString("id-ID") : "-";

// ──────────────────────────────────────────────
// Komponen utama
// ──────────────────────────────────────────────
export const BillReminders: React.FC = () => {
  const { t, locale } = useLanguage();
  const { user } = useAuth();
  const { showToast } = useToast();
  const { categories } = useCategories();
  const { reminders, loading, refresh } = useBillReminders(user?.id);
  const navigate = useNavigate();

  // ── State modal & form ──
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<BillReminderWithUrgency | null>(null);
  const [form, setForm] = useState<BillFormState>(emptyForm());
  const [isSaving, setIsSaving] = useState(false);

  // ── State hapus ──
  const [deleteTarget, setDeleteTarget] = useState<BillReminderWithUrgency | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // ── State mark paid ──
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [toggleConfirmTarget, setToggleConfirmTarget] = useState<BillReminderWithUrgency | null>(null);

  // ── State jam pengingat tagihan (Telegram) ──
  const [isTelegramLinked, setIsTelegramLinked] = useState(false);
  const [billReminderHour, setBillReminderHour] = useState<number>(19);
  const [isSavingReminderHour, setIsSavingReminderHour] = useState(false);

  // Ambil status link Telegram & preferensi jam reminder milik user.
  useEffect(() => {
    if (!user) return;
    const fetchReminderPref = async () => {
      const { data, error } = await supabase
        .from('users')
        .select('telegram_chat_id, bill_reminder_hour')
        .eq('id', user.id)
        .single();
      if (!error && data) {
        setIsTelegramLinked(!!data.telegram_chat_id);
        if (data.bill_reminder_hour) setBillReminderHour(data.bill_reminder_hour);
      }
    };
    fetchReminderPref();
  }, [user]);

  // Handler: simpan pilihan jam reminder tagihan ke kolom users.bill_reminder_hour.
  const handleSelectReminderHour = async (hour: number) => {
    if (!user || hour === billReminderHour || isSavingReminderHour) return;
    setIsSavingReminderHour(true);
    audioFeedback.playClick();
    const prevHour = billReminderHour;
    setBillReminderHour(hour); // optimistic
    const { error } = await supabase
      .from('users')
      .update({ bill_reminder_hour: hour })
      .eq('id', user.id);
    if (error) {
      setBillReminderHour(prevHour); // rollback
      showToast(t("settings.toast_reminder_hour_failed"), "error");
    } else {
      showToast(t("settings.toast_reminder_hour_saved", { time: `${String(hour).padStart(2, "0")}:00` }), "success");
    }
    setIsSavingReminderHour(false);
  };

  // Kategori yang relevan (expense & both)
  const expenseCategories = categories.filter(
    (c) => c.type === "expense" || c.type === "both"
  );

  const getCategoryLabel = (key: string) => {
    const cat = categories.find((c) => c.key === key);
    if (!cat) return key;
    return locale === "id" ? cat.label_id || cat.key : cat.label_en || cat.key;
  };

  // ── Buka form tambah ──
  const openAddForm = () => {
    setEditTarget(null);
    setForm(emptyForm());
    setIsFormOpen(true);
  };

  // ── Buka form edit ──
  const openEditForm = (r: BillReminderWithUrgency) => {
    setEditTarget(r);
    setForm({
      name: r.name,
      category_key: r.category_key,
      amount: r.amount != null ? String(r.amount) : "",
      recurrence_type: r.recurrence_type,
      due_day: r.due_day != null ? String(r.due_day) : "1",
      due_date: r.due_date ?? "",
      notes: r.notes ?? ""
    });
    setIsFormOpen(true);
  };

  // ── Validasi & simpan ──
  const handleSave = async () => {
    if (!user) return;

    const trimmedName = form.name.trim();
    if (!trimmedName) {
      audioFeedback.playDullPluck();
      showToast(t("bill_reminders.invalid_name"), "error");
      return;
    }

    const amountNum = form.amount.trim() ? Number(form.amount) : null;
    if (form.amount.trim() && (isNaN(amountNum!) || amountNum! <= 0)) {
      audioFeedback.playDullPluck();
      showToast(t("bill_reminders.invalid_amount"), "error");
      return;
    }

    if (form.recurrence_type === "monthly") {
      const day = Number(form.due_day);
      if (!day || day < 1 || day > 31) {
        audioFeedback.playDullPluck();
        showToast(t("bill_reminders.invalid_due_day"), "error");
        return;
      }
    } else {
      if (!form.due_date) {
        audioFeedback.playDullPluck();
        showToast(t("bill_reminders.invalid_due_date"), "error");
        return;
      }
    }

    setIsSaving(true);
    try {
      const payload = {
        name: trimmedName,
        category_key: form.category_key,
        amount: amountNum,
        recurrence_type: form.recurrence_type,
        due_day: form.recurrence_type === "monthly" ? Number(form.due_day) : null,
        due_date: form.recurrence_type !== "monthly" ? form.due_date : null,
        notes: form.notes.trim() || null
      };

      if (editTarget) {
        await dbService.updateBillReminder(user.id, editTarget.id, payload);
        showToast(t("bill_reminders.save_success"), "success");
      } else {
        await dbService.saveBillReminder(user.id, payload);
        showToast(t("bill_reminders.save_success"), "success");
      }

      audioFeedback.playClick();
      setIsFormOpen(false);
      await refresh();
    } catch (err) {
      console.error("Error saving bill reminder:", err);
      showToast(t("bill_reminders.save_error"), "error");
    } finally {
      setIsSaving(false);
    }
  };

  // ── Hapus ──
  const handleDeleteConfirmed = async () => {
    if (!user || !deleteTarget) return;
    setIsDeleting(true);
    try {
      const ok = await dbService.deleteBillReminder(user.id, deleteTarget.id);
      if (ok) {
        showToast(t("bill_reminders.delete_success"), "success");
        await refresh();
      } else {
        showToast(t("bill_reminders.delete_error"), "error");
      }
    } catch (err) {
      console.error("Error deleting bill reminder:", err);
      showToast(t("bill_reminders.delete_error"), "error");
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  };

  // ── Toggle paid: minta konfirmasi dulu (saldo & riwayat transaksi akan berubah) ──
  const requestTogglePaid = (r: BillReminderWithUrgency) => {
    audioFeedback.playClick();
    setToggleConfirmTarget(r);
  };

  // ── Toggle paid: eksekusi setelah dikonfirmasi ──
  const executeTogglePaid = async () => {
    if (!user || !toggleConfirmTarget) return;
    const r = toggleConfirmTarget;
    setTogglingId(r.id);
    try {
      if (!r.is_paid) {
        // Tandai lunas: hybrid -- auto-insert transaksi kalau amount terisi,
        // kalau NULL cukup tandai lunas lalu arahkan user ke form manual.
        const result = await dbService.markBillPaidWithTransaction(r.id);
        audioFeedback.playClick();
        if (result.needsManualAmount) {
          showToast(t("bill_reminders.marked_paid_needs_amount"), "success");
          setToggleConfirmTarget(null);
          await refresh();
          navigate("/transactions/new", {
            state: {
              prefillCategoryKey: r.category_key,
              prefillNote: r.name,
              prefillType: "expense"
            }
          });
          return;
        }
        showToast(t("bill_reminders.marked_paid"), "success");
      } else {
        // Batalkan lunas: transaksi yang ter-link otomatis ikut dihapus
        await dbService.unmarkBillPaid(r.id);
        audioFeedback.playClick();
        showToast(t("bill_reminders.marked_unpaid"), "success");
      }
      await refresh();
    } catch (err) {
      console.error("Error toggling bill paid:", err);
      showToast(t("bill_reminders.save_error"), "error");
    } finally {
      setTogglingId(null);
      setToggleConfirmTarget(null);
    }
  };

  // ── Badge urgensi ──
  const urgencyBadge = (r: BillReminderWithUrgency) => {
    if (r.is_paid) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-500/15 text-emerald-400 light_sakura:bg-emerald-50 light_sakura:text-emerald-600">
          <CheckCircle2 size={11} /> {t("bill_reminders.status_paid")}
        </span>
      );
    }
    if (r.urgency === "overdue") {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-red-500/15 text-red-400 light_sakura:bg-red-50 light_sakura:text-red-600">
          <AlertCircle size={11} /> {t("bill_reminders.status_overdue")}
        </span>
      );
    }
    if (r.urgency === "due_soon") {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-orange-500/15 text-orange-400 light_sakura:bg-orange-50 light_sakura:text-orange-600">
          <Clock size={11} /> {t("bill_reminders.status_due_soon")}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-700/50 text-slate-400 light_sakura:bg-slate-100 light_sakura:text-slate-500">
        <CalendarDays size={11} /> {t("bill_reminders.status_upcoming")}
      </span>
    );
  };

  // ── Label jatuh tempo ──
  const dueDateLabel = (r: BillReminderWithUrgency) => {
    if (r.recurrence_type === "monthly") {
      return t("bill_reminders.due_day_label", { day: r.due_day ?? 1 });
    }
    if (r.due_date) {
      const d = new Date(r.due_date + "T00:00:00");
      return d.toLocaleDateString(locale === "id" ? "id-ID" : "en-GB", {
        day: "numeric",
        month: "long",
        year: r.recurrence_type === "one_time" ? "numeric" : undefined
      });
    }
    return "-";
  };

  // ── Recurrence label ──
  const recurrenceLabel = (type: string) => {
    if (type === "monthly") return t("bill_reminders.recurrence_monthly");
    if (type === "yearly") return t("bill_reminders.recurrence_yearly");
    return t("bill_reminders.recurrence_one_time");
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Massive Cohesive Card Container */}
      <div className="p-6 md:p-8 rounded-3xl border bg-slate-900 border-slate-900 transition-colors duration-300 light_sakura:bg-white light_sakura:border-rose-100/10 shadow-lg space-y-6">

      {/* Header Container */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-slate-800/50 light_sakura:border-rose-100/30">
        <div>
          <h1 className="font-sans font-bold text-2xl text-slate-100 light_sakura:text-slate-900">
            {t("bill_reminders.page_title")}
          </h1>
          <p className="text-sm text-slate-400 mt-1.5 light_sakura:text-slate-500 leading-relaxed">
            {t("bill_reminders.page_subtitle")}
          </p>
        </div>
        <button
          onClick={() => {
            audioFeedback.playClick();
            openAddForm();
          }}
          className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-white font-semibold text-sm transition-colors shadow-lg shadow-emerald-500/20 shrink-0 light_sakura:bg-rose-500 light_sakura:hover:bg-rose-400 light_sakura:shadow-rose-500/20"
        >
          <Plus size={16} />
          {t("bill_reminders.add_button")}
        </button>
      </div>

      {/* Preferensi Jam Pengingat Tagihan (Telegram) */}
      {isTelegramLinked ? (
        <div className="p-5 rounded-2xl bg-slate-950/40 border border-slate-800/50 light_sakura:bg-rose-50/20 light_sakura:border-rose-100/30 space-y-3">
          <h4 className="font-sans font-bold text-[10px] text-gray-400 light_sakura:text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
            <Send size={12} className="text-indigo-400 -translate-x-0.5 rotate-45" />
            <span>{t("settings.reminder_hour_title")}</span>
          </h4>
          <p className="font-sans text-[11px] text-gray-400 light_sakura:text-slate-600">
            {t("settings.reminder_hour_desc")}
          </p>
          <div className="flex flex-wrap gap-2">
            {REMINDER_HOUR_OPTIONS.map((hour) => {
              const isActive = billReminderHour === hour;
              return (
                <motion.button
                  key={hour}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  type="button"
                  disabled={isSavingReminderHour}
                  onClick={() => handleSelectReminderHour(hour)}
                  className={`cursor-pointer px-3.5 py-2 rounded-xl text-xs font-bold font-mono transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                    isActive
                      ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20 light_sakura:bg-rose-500"
                      : "bg-slate-800/60 text-gray-400 hover:bg-slate-700/60 light_sakura:bg-rose-50/60 light_sakura:text-slate-500 light_sakura:hover:bg-rose-100/60"
                  }`}
                >
                  {String(hour).padStart(2, "0")}.00
                </motion.button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-2.5 p-5 rounded-2xl bg-slate-950/40 border border-slate-800/50 light_sakura:bg-rose-50/20 light_sakura:border-rose-100/30">
          <Info size={14} className="text-indigo-400 shrink-0 mt-0.5" />
          <p className="font-sans text-[11px] text-gray-400 light_sakura:text-slate-600">
            {t("bill_reminders.connect_telegram_hint")}
          </p>
        </div>
      )}

      {/* Daftar tagihan */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
        </div>
      ) : reminders.length === 0 ? (
        <EmptyState
          icon={<Bell size={40} className="text-slate-600 light_sakura:text-slate-400" />}
          title={t("bill_reminders.empty_title")}
          description={t("bill_reminders.empty_desc")}
        />
      ) : (
        <AnimatePresence>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {reminders.map((r) => (
              <motion.div
                key={r.id}
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.97 }}
                className="p-5 rounded-2xl bg-slate-950/40 border border-slate-800/50 light_sakura:bg-rose-50/20 light_sakura:border-rose-100/30"
              >
                {/* Baris atas: nama + badge */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0">
                    <p className="font-sans font-bold text-base text-slate-100 light_sakura:text-slate-900 truncate">
                      {r.name}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {getCategoryLabel(r.category_key)} · {recurrenceLabel(r.recurrence_type)}
                    </p>
                  </div>
                  {urgencyBadge(r)}
                </div>

                {/* Info tagihan */}
                <div className="space-y-1 mb-4">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">{t("bill_reminders.amount_label")}</span>
                    <span className="font-semibold text-slate-200 light_sakura:text-slate-700">
                      {formatIDR(r.amount)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">{t("bill_reminders.due_label")}</span>
                    <span className="font-semibold text-slate-200 light_sakura:text-slate-700">
                      {dueDateLabel(r)}
                    </span>
                  </div>
                  {!r.is_paid && r.urgency !== "overdue" && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500">{t("bill_reminders.next_due_label")}</span>
                      <span className="text-slate-300 light_sakura:text-slate-600">
                        {t("bill_reminders.days_left", { days: r.daysUntilDue })}
                      </span>
                    </div>
                  )}
                  {r.notes && (
                    <p className="text-[11px] text-slate-500 italic mt-1 truncate">{r.notes}</p>
                  )}
                </div>

                {/* Aksi */}
                <div className="flex items-center gap-2">
                  {/* Tandai lunas/belum */}
                  <button
                    onClick={() => requestTogglePaid(r)}
                    disabled={togglingId === r.id}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50 ${
                      r.is_paid
                        ? "bg-slate-700/60 text-slate-400 hover:bg-slate-700 light_sakura:bg-slate-100 light_sakura:text-slate-500 light_sakura:hover:bg-slate-200"
                        : "bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 light_sakura:bg-emerald-50 light_sakura:text-emerald-600 light_sakura:hover:bg-emerald-100"
                    }`}
                  >
                    {togglingId === r.id ? (
                      <div className="w-3.5 h-3.5 border border-current border-t-transparent rounded-full animate-spin" />
                    ) : r.is_paid ? (
                      <><Circle size={12} /> {t("bill_reminders.mark_unpaid")}</>
                    ) : (
                      <><CheckCircle2 size={12} /> {t("bill_reminders.mark_paid")}</>
                    )}
                  </button>

                  {/* Edit */}
                  <button
                    onClick={() => {
                      audioFeedback.playClick();
                      openEditForm(r);
                    }}
                    className="p-2 rounded-xl bg-slate-700/50 text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors cursor-pointer light_sakura:bg-slate-100 light_sakura:text-slate-500 light_sakura:hover:bg-slate-200 light_sakura:hover:text-slate-700"
                  >
                    <Edit2 size={13} />
                  </button>

                  {/* Hapus */}
                  <button
                    onClick={() => {
                      audioFeedback.playClick();
                      setDeleteTarget(r);
                    }}
                    className="p-2 rounded-xl bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors cursor-pointer light_sakura:bg-red-50 light_sakura:text-red-400 light_sakura:hover:bg-red-100"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        </AnimatePresence>
      )}

      {/* ── Modal Form Tambah/Edit ── */}
      <AnimatePresence>
        {isFormOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm"
            onClick={(e) => { if (e.target === e.currentTarget) setIsFormOpen(false); }}
          >
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 40 }}
              className="w-full max-w-md bg-slate-900 light_sakura:bg-white rounded-3xl border border-slate-800 light_sakura:border-slate-200 shadow-2xl p-6 space-y-4"
            >
              <h2 className="font-sans font-bold text-lg text-slate-100 light_sakura:text-slate-900">
                {editTarget ? t("bill_reminders.edit_title") : t("bill_reminders.add_title")}
              </h2>

              {/* Nama tagihan */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 light_sakura:text-slate-600 mb-1.5">
                  {t("bill_reminders.form_name")}
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder={t("bill_reminders.form_name_placeholder")}
                  className="w-full px-4 py-3 rounded-2xl bg-slate-800 light_sakura:bg-slate-50 text-slate-100 light_sakura:text-slate-900 text-sm border border-slate-700 light_sakura:border-slate-200 focus:outline-none focus:border-emerald-500 light_sakura:focus:border-rose-400 placeholder:text-slate-600 light_sakura:placeholder:text-slate-400 transition-colors"
                />
              </div>

              {/* Kategori */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 light_sakura:text-slate-600 mb-1.5">
                  {t("bill_reminders.form_category")}
                </label>
                <select
                  value={form.category_key}
                  onChange={(e) => setForm((f) => ({ ...f, category_key: e.target.value }))}
                  className="w-full px-4 py-3 rounded-2xl bg-slate-800 light_sakura:bg-slate-50 text-slate-100 light_sakura:text-slate-900 text-sm border border-slate-700 light_sakura:border-slate-200 focus:outline-none focus:border-emerald-500 light_sakura:focus:border-rose-400 transition-colors cursor-pointer"
                >
                  {expenseCategories.map((c) => (
                    <option key={c.key} value={c.key}>
                      {locale === "id" ? c.label_id || c.key : c.label_en || c.key}
                    </option>
                  ))}
                </select>
              </div>

              {/* Nominal (opsional) */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 light_sakura:text-slate-600 mb-1.5">
                  {t("bill_reminders.form_amount")}
                </label>
                <input
                  type="number"
                  value={form.amount}
                  onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                  placeholder={t("bill_reminders.form_amount_placeholder")}
                  min={0}
                  className="w-full px-4 py-3 rounded-2xl bg-slate-800 light_sakura:bg-slate-50 text-slate-100 light_sakura:text-slate-900 text-sm border border-slate-700 light_sakura:border-slate-200 focus:outline-none focus:border-emerald-500 light_sakura:focus:border-rose-400 placeholder:text-slate-600 light_sakura:placeholder:text-slate-400 transition-colors"
                />
              </div>

              {/* Tipe pengulangan */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 light_sakura:text-slate-600 mb-1.5">
                  {t("bill_reminders.form_recurrence")}
                </label>
                <div className="flex gap-2">
                  {(["monthly", "yearly", "one_time"] as RecurrenceType[]).map((type) => (
                    <button
                      key={type}
                      onClick={() => setForm((f) => ({ ...f, recurrence_type: type }))}
                      className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                        form.recurrence_type === type
                          ? "bg-emerald-500 text-white light_sakura:bg-rose-500"
                          : "bg-slate-800 text-slate-400 hover:bg-slate-700 light_sakura:bg-slate-100 light_sakura:text-slate-600 light_sakura:hover:bg-slate-200"
                      }`}
                    >
                      {type === "monthly"
                        ? t("bill_reminders.recurrence_monthly")
                        : type === "yearly"
                        ? t("bill_reminders.recurrence_yearly")
                        : t("bill_reminders.recurrence_one_time")}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tanggal jatuh tempo */}
              {form.recurrence_type === "monthly" ? (
                <div>
                  <label className="block text-xs font-semibold text-slate-400 light_sakura:text-slate-600 mb-1.5">
                    {t("bill_reminders.form_due_day")}
                  </label>
                  <input
                    type="number"
                    value={form.due_day}
                    onChange={(e) => setForm((f) => ({ ...f, due_day: e.target.value }))}
                    min={1}
                    max={31}
                    className="w-full px-4 py-3 rounded-2xl bg-slate-800 light_sakura:bg-slate-50 text-slate-100 light_sakura:text-slate-900 text-sm border border-slate-700 light_sakura:border-slate-200 focus:outline-none focus:border-emerald-500 light_sakura:focus:border-rose-400 transition-colors"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-semibold text-slate-400 light_sakura:text-slate-600 mb-1.5">
                    {t("bill_reminders.form_due_date")}
                  </label>
                  <input
                    type="date"
                    value={form.due_date}
                    onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))}
                    className="w-full px-4 py-3 rounded-2xl bg-slate-800 light_sakura:bg-slate-50 text-slate-100 light_sakura:text-slate-900 text-sm border border-slate-700 light_sakura:border-slate-200 focus:outline-none focus:border-emerald-500 light_sakura:focus:border-rose-400 transition-colors"
                  />
                </div>
              )}

              {/* Catatan (opsional) */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 light_sakura:text-slate-600 mb-1.5">
                  {t("bill_reminders.form_notes")}
                </label>
                <input
                  type="text"
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder={t("bill_reminders.form_notes_placeholder")}
                  className="w-full px-4 py-3 rounded-2xl bg-slate-800 light_sakura:bg-slate-50 text-slate-100 light_sakura:text-slate-900 text-sm border border-slate-700 light_sakura:border-slate-200 focus:outline-none focus:border-emerald-500 light_sakura:focus:border-rose-400 placeholder:text-slate-600 light_sakura:placeholder:text-slate-400 transition-colors"
                />
              </div>

              {/* Tombol aksi */}
              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => setIsFormOpen(false)}
                  className="flex-1 py-3 rounded-2xl bg-slate-800 light_sakura:bg-slate-100 text-slate-300 light_sakura:text-slate-600 font-semibold text-sm hover:bg-slate-700 light_sakura:hover:bg-slate-200 transition-colors cursor-pointer"
                >
                  {t("common.cancel")}
                </button>
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="flex-1 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 light_sakura:bg-rose-500 light_sakura:hover:bg-rose-400 text-white font-semibold text-sm transition-colors shadow-lg shadow-emerald-500/20 light_sakura:shadow-rose-500/20 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                >
                  {isSaving ? t("common.loading") : t("common.save")}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Modal Konfirmasi Hapus ── */}
      <Modal
        isOpen={!!deleteTarget}
        title={t("bill_reminders.delete_confirm_title")}
        description={t("bill_reminders.delete_confirm_desc", { name: deleteTarget?.name ?? "" })}
        type="danger"
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        onConfirm={handleDeleteConfirmed}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* ── Modal Konfirmasi Tandai Lunas / Batalkan Lunas ── */}
      <Modal
        isOpen={!!toggleConfirmTarget}
        title={
          toggleConfirmTarget?.is_paid
            ? t("bill_reminders.unmark_confirm_title")
            : t("bill_reminders.mark_confirm_title")
        }
        description={
          toggleConfirmTarget?.is_paid
            ? t("bill_reminders.unmark_confirm_desc", { name: toggleConfirmTarget?.name ?? "" })
            : toggleConfirmTarget?.amount != null
            ? t("bill_reminders.mark_confirm_desc_with_amount", {
                name: toggleConfirmTarget?.name ?? "",
                amount: formatIDR(toggleConfirmTarget?.amount ?? null)
              })
            : t("bill_reminders.mark_confirm_desc_no_amount", { name: toggleConfirmTarget?.name ?? "" })
        }
        type="warning"
        confirmLabel={t("bill_reminders.mark_confirm_button")}
        cancelLabel={t("common.cancel")}
        onConfirm={executeTogglePaid}
        onCancel={() => setToggleConfirmTarget(null)}
        confirmDisabled={togglingId === toggleConfirmTarget?.id}
      />
      </div>{/* end card container */}
    </motion.div>
  );
};
