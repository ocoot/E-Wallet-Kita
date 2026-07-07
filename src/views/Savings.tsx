import React, { useState, useEffect, useMemo } from "react";
import { useLanguage } from "../contexts/LanguageContext";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { dbService } from "../lib/db";
import { useSavings, SavingsPocketWithProgress } from "../hooks/useSavings";
import { SavingsPocketType } from "../types";
import { Modal } from "../components/Modal";
import { EmptyState } from "../components/EmptyState";
import { motion, AnimatePresence } from "motion/react";
import { audioFeedback } from "../lib/audio";
import {
  PiggyBank, Plus, Trash2, Edit2, ArrowDownCircle, ArrowUpCircle,
  Siren, Target, GraduationCap, Umbrella, TrendingUp, Archive, ArchiveRestore, Info
} from "lucide-react";

const POCKET_TYPES: SavingsPocketType[] = ["emergency_fund", "goal", "education", "retirement", "investment"];

const POCKET_ICONS: Record<SavingsPocketType, any> = {
  emergency_fund: Siren,
  goal: Target,
  education: GraduationCap,
  retirement: Umbrella,
  investment: TrendingUp,
};

const POCKET_COLORS: Record<SavingsPocketType, string> = {
  emergency_fund: "text-red-400 bg-red-500/10 border-red-500/20",
  goal: "text-indigo-400 bg-indigo-500/10 border-indigo-500/20",
  education: "text-sky-400 bg-sky-500/10 border-sky-500/20",
  retirement: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  investment: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
};

interface PocketFormState {
  name: string;
  pocket_type: SavingsPocketType;
  target_amount: string;
  target_date: string;
  notes: string;
}
const emptyForm = (): PocketFormState => ({
  name: "", pocket_type: "goal", target_amount: "", target_date: "", notes: ""
});
const formatIDR = (num: number | null) => num != null ? "Rp" + Math.round(num).toLocaleString("id-ID") : "-";

export const Savings: React.FC = () => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { showToast } = useToast();
  const { pockets, summary, loading, refresh } = useSavings(user?.id);

  const [availableBalance, setAvailableBalance] = useState<number | null>(null);

  useEffect(() => {
    if (!user) return;
    dbService.getAccumulatedBalance()
      .then(b => setAvailableBalance(b.balance - summary.total_saved))
      .catch(() => setAvailableBalance(null));
  }, [user, summary.total_saved]);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<SavingsPocketWithProgress | null>(null);
  const [form, setForm] = useState<PocketFormState>(emptyForm());
  const [isSaving, setIsSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SavingsPocketWithProgress | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [moveTarget, setMoveTarget] = useState<{ pocket: SavingsPocketWithProgress; direction: "deposit" | "withdraw" } | null>(null);
  const [moveAmount, setMoveAmount] = useState("");
  const [moveNote, setMoveNote] = useState("");
  const [moveDate, setMoveDate] = useState(new Date().toISOString().split("T")[0]);
  const [isMoving, setIsMoving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const activePockets = useMemo(() => pockets.filter(p => !p.is_archived), [pockets]);
  const archivedPockets = useMemo(() => pockets.filter(p => p.is_archived), [pockets]);

  const openAddForm = () => { setEditTarget(null); setForm(emptyForm()); setIsFormOpen(true); };
  const openEditForm = (p: SavingsPocketWithProgress) => {
    setEditTarget(p);
    setForm({
      name: p.name,
      pocket_type: p.pocket_type,
      target_amount: p.target_amount != null ? String(p.target_amount) : "",
      target_date: p.target_date ?? "",
      notes: p.notes ?? ""
    });
    setIsFormOpen(true);
  };

  const handleSave = async () => {
    if (!user) return;
    const trimmedName = form.name.trim();
    if (!trimmedName) { audioFeedback.playDullPluck(); showToast(t("savings.invalid_name"), "error"); return; }

    const targetNum = form.target_amount.trim() ? Number(form.target_amount) : null;
    if (form.target_amount.trim() && (isNaN(targetNum!) || targetNum! <= 0)) {
      audioFeedback.playDullPluck(); showToast(t("savings.invalid_target_amount"), "error"); return;
    }

    setIsSaving(true);
    try {
      const payload = {
        name: trimmedName,
        pocket_type: form.pocket_type,
        target_amount: targetNum,
        target_date: form.target_date || null,
        notes: form.notes.trim() || null
      };
      if (editTarget) {
        await dbService.updateSavingsPocket(user.id, editTarget.id, payload);
      } else {
        await dbService.createSavingsPocket(user.id, payload);
      }
      showToast(t("savings.save_success"), "success");
      audioFeedback.playClick();
      setIsFormOpen(false);
      await refresh();
    } catch { showToast(t("savings.save_error"), "error"); }
    finally { setIsSaving(false); }
  };

  const handleDeleteConfirmed = async () => {
    if (!user || !deleteTarget) return;
    setIsDeleting(true);
    try {
      const ok = await dbService.deleteSavingsPocket(user.id, deleteTarget.id);
      if (ok) { showToast(t("savings.delete_success"), "success"); await refresh(); }
      else showToast(t("savings.delete_error"), "error");
    } catch { showToast(t("savings.delete_error"), "error"); }
    finally { setIsDeleting(false); setDeleteTarget(null); }
  };

  const toggleArchive = async (p: SavingsPocketWithProgress) => {
    if (!user) return;
    setBusyId(p.id);
    try {
      await dbService.updateSavingsPocket(user.id, p.id, { is_archived: !p.is_archived });
      audioFeedback.playClick();
      await refresh();
    } catch { showToast(t("savings.save_error"), "error"); }
    finally { setBusyId(null); }
  };

  const openMove = (pocket: SavingsPocketWithProgress, direction: "deposit" | "withdraw") => {
    audioFeedback.playClick();
    setMoveTarget({ pocket, direction });
    setMoveAmount("");
    setMoveNote("");
    setMoveDate(new Date().toISOString().split("T")[0]);
  };

  const executeMove = async () => {
    if (!moveTarget) return;
    const amountNum = Number(moveAmount);
    if (!moveAmount.trim() || isNaN(amountNum) || amountNum <= 0) {
      audioFeedback.playDullPluck(); showToast(t("savings.invalid_amount"), "error"); return;
    }

    setIsMoving(true);
    try {
      if (moveTarget.direction === "deposit") {
        await dbService.depositToPocket(moveTarget.pocket.id, amountNum, moveNote.trim() || null, moveDate);
        showToast(t("savings.deposit_success", { name: moveTarget.pocket.name }), "success");
      } else {
        await dbService.withdrawFromPocket(moveTarget.pocket.id, amountNum, moveNote.trim() || null, moveDate);
        showToast(t("savings.withdraw_success", { name: moveTarget.pocket.name }), "success");
      }
      audioFeedback.playClick();
      setMoveTarget(null);
      await refresh();
    } catch (err: any) {
      const msg = String(err?.message || "");
      if (msg.includes("INSUFFICIENT_POCKET_BALANCE")) {
        showToast(t("savings.insufficient_balance_error"), "error");
      } else if (msg.includes("INSUFFICIENT_AVAILABLE_BALANCE")) {
        showToast(t("savings.insufficient_available_balance_error"), "error");
      } else {
        showToast(moveTarget.direction === "deposit" ? t("savings.deposit_error") : t("savings.withdraw_error"), "error");
      }
    } finally { setIsMoving(false); }
  };

  // ── Formasi grid 2 kolom + ring progres bundar ────────────────────────
  const renderPocketCard = (p: SavingsPocketWithProgress) => {
    const Icon = POCKET_ICONS[p.pocket_type];
    const colorClasses = POCKET_COLORS[p.pocket_type];
    const pct = p.target_amount != null ? p.progressPercent : null;
    return (
      <motion.div key={p.id} initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }}
        className={`rounded-2xl border overflow-hidden ${p.is_archived
          ? "border-slate-800/50 bg-slate-950/20 opacity-60"
          : "border-slate-800/50 bg-slate-950/40 light_sakura:bg-rose-50/20 light_sakura:border-rose-100/30"}`}>
        <div className="p-4 space-y-3 text-center">
          {/* Ring progres bundar */}
          <div className="relative mx-auto w-20 h-20">
            <div
              className="w-full h-full rounded-full flex items-center justify-center"
              style={{
                background: pct != null
                  ? `conic-gradient(var(--tw-ring-color, #6366f1) ${pct * 3.6}deg, rgba(148,163,184,0.15) 0deg)`
                  : "conic-gradient(rgba(148,163,184,0.25) 360deg, rgba(148,163,184,0.15) 0deg)"
              }}
            >
              <div className="w-[62px] h-[62px] rounded-full bg-slate-900 light_sakura:bg-white flex flex-col items-center justify-center">
                <Icon size={16} className={colorClasses.split(" ")[0]} />
                {pct != null && <span className="text-[10px] font-bold text-slate-300 light_sakura:text-slate-600 mt-0.5">{pct}%</span>}
              </div>
            </div>
            {p.is_archived && (
              <span className="absolute -top-1 -right-1 inline-flex items-center px-1.5 py-0.5 rounded-md text-[8px] font-bold bg-slate-700/70 text-slate-300">
                {t("savings.archived_badge")}
              </span>
            )}
          </div>

          <div>
            <p className="font-sans font-bold text-sm text-slate-100 light_sakura:text-slate-900 truncate">{p.name}</p>
            <p className="text-[10.5px] text-slate-500 mt-0.5">{t(`savings.pocket_type_${p.pocket_type}`)}</p>
          </div>

          {p.target_amount != null ? (
            <p className="text-[11px] font-semibold text-slate-300 light_sakura:text-slate-600">{formatIDR(p.current_amount)} <span className="text-slate-500 font-normal">/ {formatIDR(p.target_amount)}</span></p>
          ) : (
            <p className="text-[11px] font-bold text-slate-200 light_sakura:text-slate-700">{formatIDR(p.current_amount)}</p>
          )}

          {p.notes && <p className="text-[10.5px] text-slate-500 italic truncate">{p.notes}</p>}

          <div className="grid grid-cols-2 gap-1.5 pt-1">
            <button onClick={() => openMove(p, "deposit")} disabled={busyId === p.id || p.is_archived}
              className="flex items-center justify-center gap-1 py-2 rounded-xl text-[11px] font-semibold transition-colors cursor-pointer disabled:opacity-50 bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25">
              <ArrowDownCircle size={12} /> {t("savings.deposit_button")}
            </button>
            <button onClick={() => openMove(p, "withdraw")} disabled={busyId === p.id || p.is_archived || p.current_amount <= 0}
              className="flex items-center justify-center gap-1 py-2 rounded-xl text-[11px] font-semibold transition-colors cursor-pointer disabled:opacity-50 bg-indigo-500/15 text-indigo-400 hover:bg-indigo-500/25 light_sakura:bg-rose-50 light_sakura:text-rose-600">
              <ArrowUpCircle size={12} /> {t("savings.withdraw_button")}
            </button>
          </div>
          <div className="flex items-center justify-center gap-1.5">
            <button onClick={() => { audioFeedback.playClick(); openEditForm(p); }} className="p-1.5 rounded-lg bg-slate-700/50 text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors cursor-pointer light_sakura:bg-slate-100 light_sakura:text-slate-500"><Edit2 size={12} /></button>
            <button onClick={() => toggleArchive(p)} disabled={busyId === p.id}
              title={p.is_archived ? t("savings.unarchive_button") : t("savings.archive_button")}
              className="p-1.5 rounded-lg bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 transition-colors cursor-pointer disabled:opacity-50 light_sakura:bg-amber-50">
              {p.is_archived ? <ArchiveRestore size={12} /> : <Archive size={12} />}
            </button>
            <button onClick={() => { audioFeedback.playClick(); setDeleteTarget(p); }} className="p-1.5 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors cursor-pointer light_sakura:bg-red-50 light_sakura:text-red-400"><Trash2 size={12} /></button>
          </div>
        </div>
      </motion.div>
    );
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">

      <div className="rounded-3xl border bg-slate-900 border-slate-800/60 light_sakura:bg-white light_sakura:border-rose-100/40 shadow-lg overflow-hidden">
        <div className="h-1.5 w-full bg-gradient-to-r from-emerald-500 via-indigo-500 to-indigo-600" />
        <div className="p-6 md:p-8 space-y-6">

          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div>
              <h1 className="font-sans font-bold text-2xl tracking-tight text-white light_sakura:text-slate-900">
                {t("savings.page_title")}
              </h1>
              <p className="text-sm text-slate-400 mt-1 light_sakura:text-slate-500 leading-relaxed">
                {t("savings.page_subtitle")}
              </p>
            </div>
            <button onClick={() => { audioFeedback.playClick(); openAddForm(); }}
              className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm transition-colors shadow-lg shadow-indigo-600/20 shrink-0 light_sakura:bg-rose-500 light_sakura:hover:bg-rose-400 light_sakura:shadow-rose-500/20 cursor-pointer">
              <Plus size={16} /> {t("savings.add_button")}
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-2xl bg-emerald-500/8 border border-emerald-500/15 px-3 py-3 light_sakura:bg-emerald-50/60 light_sakura:border-emerald-100">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">{t("savings.stat_total_saved")}</span>
              <p className="font-bold text-[11px] leading-tight whitespace-nowrap tabular-nums tracking-tight text-emerald-400 light_sakura:text-emerald-600">{formatIDR(summary.total_saved)}</p>
            </div>
            <div className="rounded-2xl bg-indigo-500/8 border border-indigo-500/15 px-3 py-3 light_sakura:bg-indigo-50/60 light_sakura:border-indigo-100">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">{t("savings.stat_available_balance")}</span>
              <p className="font-bold text-[11px] leading-tight whitespace-nowrap tabular-nums tracking-tight text-indigo-400 light_sakura:text-indigo-600">{availableBalance != null ? formatIDR(availableBalance) : "-"}</p>
            </div>
            <div className="rounded-2xl bg-slate-800/40 border border-slate-700/40 px-3 py-3 light_sakura:bg-slate-100/60 light_sakura:border-slate-200">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">{t("savings.stat_pocket_count")}</span>
              <p className="font-bold text-2xl text-slate-200 light_sakura:text-slate-700">{summary.pocket_count}</p>
            </div>
          </div>

          <div className="flex items-start gap-2.5 rounded-2xl border border-indigo-500/15 bg-indigo-500/5 px-4 py-3 light_sakura:bg-indigo-50/40 light_sakura:border-indigo-100">
            <Info size={14} className="text-indigo-400 light_sakura:text-indigo-500 shrink-0 mt-0.5" />
            <p className="text-[11px] leading-relaxed text-slate-400 light_sakura:text-slate-600">{t("savings.info_banner_text")}</p>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
            </div>
          ) : pockets.length === 0 ? (
            <EmptyState icon={<PiggyBank size={40} className="text-slate-600 light_sakura:text-slate-400" />} title={t("savings.empty_title")} description={t("savings.empty_desc")} />
          ) : (
            <AnimatePresence>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {activePockets.map(renderPocketCard)}
                {archivedPockets.map(renderPocketCard)}
              </div>
            </AnimatePresence>
          )}
        </div>
      </div>

      {/* Add/Edit pocket form modal */}
      <AnimatePresence>
        {isFormOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm"
            onClick={e => { if (e.target === e.currentTarget) setIsFormOpen(false); }}>
            <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 40 }}
              className="w-full max-w-md bg-slate-900 light_sakura:bg-white rounded-3xl border border-slate-800 light_sakura:border-slate-200 shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
              <div className="h-1 w-full bg-gradient-to-r from-emerald-500 to-indigo-500" />
              <div className="p-6 space-y-4">
                <h2 className="font-sans font-bold text-lg text-slate-100 light_sakura:text-slate-900">
                  {editTarget ? t("savings.edit_title") : t("savings.add_title")}
                </h2>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">{t("savings.form_name")}</label>
                  <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder={t("savings.form_name_placeholder")} className="w-full px-4 py-3 rounded-2xl bg-slate-800 light_sakura:bg-slate-50 text-slate-100 light_sakura:text-slate-900 text-sm border border-slate-700 light_sakura:border-slate-200 focus:outline-none focus:border-indigo-500 placeholder:text-slate-500 transition-colors" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">{t("savings.form_type")}</label>
                  <select value={form.pocket_type} onChange={e => setForm(f => ({ ...f, pocket_type: e.target.value as SavingsPocketType }))} className="w-full px-4 py-3 rounded-2xl bg-slate-800 light_sakura:bg-slate-50 text-slate-100 light_sakura:text-slate-900 text-sm border border-slate-700 light_sakura:border-slate-200 focus:outline-none focus:border-indigo-500 transition-colors cursor-pointer">
                    {POCKET_TYPES.map(pt => <option key={pt} value={pt}>{t(`savings.pocket_type_${pt}`)}</option>)}
                  </select>
                  <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">{t(`savings.pocket_type_${form.pocket_type}_desc`)}</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">{t("savings.form_target_amount")}</label>
                    <input type="number" value={form.target_amount} onChange={e => setForm(f => ({ ...f, target_amount: e.target.value }))} placeholder={t("savings.form_target_amount_placeholder")} min={0} className="w-full px-4 py-3 rounded-2xl bg-slate-800 light_sakura:bg-slate-50 text-slate-100 light_sakura:text-slate-900 text-sm border border-slate-700 light_sakura:border-slate-200 focus:outline-none focus:border-indigo-500 placeholder:text-slate-500 transition-colors" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">{t("savings.form_target_date")}</label>
                    <input type="date" value={form.target_date} onChange={e => setForm(f => ({ ...f, target_date: e.target.value }))} className="w-full px-4 py-3 rounded-2xl bg-slate-800 light_sakura:bg-slate-50 text-slate-100 light_sakura:text-slate-900 text-sm border border-slate-700 light_sakura:border-slate-200 focus:outline-none focus:border-indigo-500 transition-colors" />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">{t("savings.form_notes")}</label>
                  <input type="text" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder={t("savings.form_notes_placeholder")} className="w-full px-4 py-3 rounded-2xl bg-slate-800 light_sakura:bg-slate-50 text-slate-100 light_sakura:text-slate-900 text-sm border border-slate-700 light_sakura:border-slate-200 focus:outline-none focus:border-indigo-500 placeholder:text-slate-500 transition-colors" />
                </div>
                <div className="flex gap-3 pt-1">
                  <button onClick={() => setIsFormOpen(false)} className="flex-1 py-3 rounded-2xl bg-slate-800 light_sakura:bg-slate-100 text-slate-300 light_sakura:text-slate-600 font-semibold text-sm hover:bg-slate-700 transition-colors cursor-pointer">{t("common.cancel")}</button>
                  <button onClick={handleSave} disabled={isSaving} className="flex-1 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 light_sakura:bg-rose-500 light_sakura:hover:bg-rose-400 text-white font-semibold text-sm transition-colors shadow-lg shadow-indigo-600/20 disabled:opacity-50 cursor-pointer">{isSaving ? t("common.loading") : t("common.save")}</button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Deposit/Withdraw modal */}
      <AnimatePresence>
        {moveTarget && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm"
            onClick={e => { if (e.target === e.currentTarget) setMoveTarget(null); }}>
            <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 40 }}
              className="w-full max-w-sm bg-slate-900 light_sakura:bg-white rounded-3xl border border-slate-800 light_sakura:border-slate-200 shadow-2xl overflow-hidden">
              <div className={`h-1 w-full ${moveTarget.direction === "deposit" ? "bg-emerald-500" : "bg-indigo-500"}`} />
              <div className="p-6 space-y-4">
                <div>
                  <h2 className="font-sans font-bold text-lg text-slate-100 light_sakura:text-slate-900">
                    {t(moveTarget.direction === "deposit" ? "savings.deposit_title" : "savings.withdraw_title", { name: moveTarget.pocket.name })}
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    {t(moveTarget.direction === "deposit" ? "savings.deposit_desc" : "savings.withdraw_desc")}
                  </p>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">{t("savings.form_amount")}</label>
                  <input type="number" value={moveAmount} onChange={e => setMoveAmount(e.target.value)} placeholder={t("savings.form_amount_placeholder")} min={0} autoFocus className="w-full px-4 py-3 rounded-2xl bg-slate-800 light_sakura:bg-slate-50 text-slate-100 light_sakura:text-slate-900 text-sm border border-slate-700 light_sakura:border-slate-200 focus:outline-none focus:border-indigo-500 placeholder:text-slate-500 transition-colors" />
                  {moveTarget.direction === "deposit" && availableBalance != null && (
                    <p className="text-[11px] text-slate-500 mt-1.5">{t("savings.available_balance_hint", { amount: formatIDR(availableBalance) })}</p>
                  )}
                  {moveTarget.direction === "withdraw" && (
                    <p className="text-[11px] text-slate-500 mt-1.5">{t("savings.pocket_balance_hint", { amount: formatIDR(moveTarget.pocket.current_amount) })}</p>
                  )}
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">{t("savings.form_entry_date")}</label>
                  <input type="date" value={moveDate} onChange={e => setMoveDate(e.target.value)} className="w-full px-4 py-3 rounded-2xl bg-slate-800 light_sakura:bg-slate-50 text-slate-100 light_sakura:text-slate-900 text-sm border border-slate-700 light_sakura:border-slate-200 focus:outline-none focus:border-indigo-500 transition-colors" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">{t("savings.form_entry_note")}</label>
                  <input type="text" value={moveNote} onChange={e => setMoveNote(e.target.value)} className="w-full px-4 py-3 rounded-2xl bg-slate-800 light_sakura:bg-slate-50 text-slate-100 light_sakura:text-slate-900 text-sm border border-slate-700 light_sakura:border-slate-200 focus:outline-none focus:border-indigo-500 transition-colors" />
                </div>
                <div className="flex gap-3 pt-1">
                  <button onClick={() => setMoveTarget(null)} className="flex-1 py-3 rounded-2xl bg-slate-800 light_sakura:bg-slate-100 text-slate-300 light_sakura:text-slate-600 font-semibold text-sm hover:bg-slate-700 transition-colors cursor-pointer">{t("common.cancel")}</button>
                  <button onClick={executeMove} disabled={isMoving}
                    className={`flex-1 py-3 rounded-2xl text-white font-semibold text-sm transition-colors shadow-lg disabled:opacity-50 cursor-pointer ${moveTarget.direction === "deposit" ? "bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/20" : "bg-indigo-600 hover:bg-indigo-500 shadow-indigo-600/20"}`}>
                    {isMoving ? t("common.loading") : t(moveTarget.direction === "deposit" ? "savings.deposit_button" : "savings.withdraw_button")}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <Modal isOpen={!!deleteTarget} title={t("savings.delete_confirm_title")} description={t("savings.delete_confirm_desc", { name: deleteTarget?.name ?? "" })} type="danger" confirmLabel={t("common.delete")} cancelLabel={t("common.cancel")} onConfirm={handleDeleteConfirmed} onCancel={() => setDeleteTarget(null)} confirmDisabled={isDeleting} />
    </motion.div>
  );
};
