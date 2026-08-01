import React, { useState, useEffect, useMemo } from "react";
import { useLanguage } from "../contexts/LanguageContext";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { useThemeTokens } from "../hooks/useThemeTokens";
import { dbService } from "../lib/db";
import { withErrorReporting, reportFrontendError } from "../lib/errorReporter";
import { useSavings, SavingsPocketWithProgress } from "../hooks/useSavings";
import { useWallets } from "../hooks/useWallets";
import { SavingsPocketType } from "../types";
import { Modal } from "../components/Modal";
import { DropdownField } from "../components/DropdownField";
import { EmptyState } from "../components/EmptyState";
import { CollapsingPageHeader } from "../components/CollapsingPageHeader";
import { ErrorState } from "../components/ErrorState";
import { useLockBodyScroll } from "../hooks/useLockBodyScroll";
import { useBackGestureTrap } from "../hooks/useBackGestureTrap";
import { ModalShell } from "../components/ui/ModalShell";
import { motion, AnimatePresence } from "motion/react";
import { audioFeedback } from "../lib/audio";
import { Input } from "../components/ui/Input";
import { CurrencyInput } from "../components/ui/CurrencyInput";
import { Button } from "../components/ui/Button";
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
  wallet_id: string;
}
const emptyForm = (): PocketFormState => ({
  name: "", pocket_type: "goal", target_amount: "", target_date: "", notes: "", wallet_id: ""
});
const formatIDR = (num: number | null) => num != null ? "Rp\u00A0" + Math.round(num).toLocaleString("id-ID") : "-";

export const Savings: React.FC = () => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { showToast } = useToast();
  const { pockets, summary, loading, error: pocketsError, refresh } = useSavings(user?.id);
  const { activeWallets } = useWallets();
  const { tokens, cx } = useThemeTokens();

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

  useLockBodyScroll(isFormOpen || !!moveTarget || !!deleteTarget);
  // Menjebak swipe-back/tombol-back HP saat modal ini terbuka, supaya
  // menutup modal (tetap di halaman Tabungan) -- bukan malah menavigasi
  // balik ke halaman sebelum Tabungan (lihat useBackGestureTrap.ts).
  const { close: closeForm } = useBackGestureTrap(isFormOpen, setIsFormOpen);
  const isMoveOpen = !!moveTarget;
  const setIsMoveOpen = (open: boolean) => { if (!open) setMoveTarget(null); };
  const { close: closeMoveModal } = useBackGestureTrap(isMoveOpen, setIsMoveOpen);

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
      notes: p.notes ?? "",
      wallet_id: p.wallet_id ?? ""
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
      await withErrorReporting(
        "frontend:savings",
        async () => {
          const payload = {
            name: trimmedName,
            pocket_type: form.pocket_type,
            target_amount: targetNum,
            target_date: form.target_date || null,
            notes: form.notes.trim() || null,
            wallet_id: form.wallet_id || null
          };
          if (editTarget) {
            await dbService.updateSavingsPocket(user.id, editTarget.id, payload);
          } else {
            await dbService.createSavingsPocket(user.id, payload);
          }
          showToast(t("savings.save_success"), "success");
          audioFeedback.playClick();
          closeForm();
          await refresh();
        },
        { action: editTarget ? "update" : "create" }
      );
    } catch { showToast(t("savings.save_error"), "error"); }
    finally { setIsSaving(false); }
  };

  const handleDeleteConfirmed = async () => {
    if (!user || !deleteTarget) return;
    setIsDeleting(true);
    try {
      await withErrorReporting(
        "frontend:savings",
        async () => {
          const ok = await dbService.deleteSavingsPocket(user.id, deleteTarget.id);
          if (ok) { showToast(t("savings.delete_success"), "success"); await refresh(); }
          else showToast(t("savings.delete_error"), "error");
        },
        { action: "delete", pocketId: deleteTarget.id }
      );
    } catch { showToast(t("savings.delete_error"), "error"); }
    finally { setIsDeleting(false); setDeleteTarget(null); }
  };

  const toggleArchive = async (p: SavingsPocketWithProgress) => {
    if (!user) return;
    setBusyId(p.id);
    try {
      await withErrorReporting(
        "frontend:savings",
        async () => {
          await dbService.updateSavingsPocket(user.id, p.id, { is_archived: !p.is_archived });
          audioFeedback.playClick();
          await refresh();
        },
        { action: "toggle-archive", pocketId: p.id }
      );
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
      closeMoveModal();
      await refresh();
    } catch (err: any) {
      const msg = String(err?.message || "");
      if (msg.includes("INSUFFICIENT_POCKET_BALANCE")) {
        showToast(t("savings.insufficient_balance_error"), "error");
      } else if (msg.includes("INSUFFICIENT_AVAILABLE_BALANCE")) {
        showToast(t("savings.insufficient_available_balance_error"), "error");
      } else {
        // Bukan penolakan bisnis normal (saldo kurang) -- ini kemungkinan bug,
        // jadi dilaporkan. Dua kasus di atas SENGAJA tidak dilaporkan supaya
        // Monitor Error tidak dibanjiri noise "user salah masukin nominal".
        showToast(moveTarget.direction === "deposit" ? t("savings.deposit_error") : t("savings.withdraw_error"), "error");
        void reportFrontendError({
          source: "frontend:savings",
          message: msg || "Unknown deposit/withdraw error",
          context: {
            action: moveTarget.direction,
            pocketId: moveTarget.pocket.id,
            stack: err?.stack?.slice(0, 1500) ?? null,
          },
        });
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
        className={cx(
          "rounded-2xl border overflow-hidden",
          p.is_archived
            ? "border-slate-800/50 bg-slate-950/20 opacity-60"
            : cx(tokens.surface.card, tokens.border.default)
        )}>
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
              <div className={cx("w-[62px] h-[62px] rounded-full flex flex-col items-center justify-center", tokens.surface.subtle)}>
                <Icon size={16} className={colorClasses.split(" ")[0]} />
                {pct != null && <span className={cx("text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold mt-0.5", tokens.text.label)}>{pct}%</span>}
              </div>
            </div>
            {p.is_archived && (
              <span className="absolute -top-1 -right-1 inline-flex items-center px-1.5 py-0.5 rounded-md text-[clamp(0.45rem,2.08vw,0.5rem)] font-bold bg-slate-700/70 text-slate-300">
                {t("savings.archived_badge")}
              </span>
            )}
          </div>

          <div>
            <p className={cx("font-sans font-bold text-sm truncate", tokens.text.heading)}>{p.name}</p>
            <p className={cx("text-[clamp(0.5906rem,2.73vw,0.6562rem)] mt-0.5", tokens.text.muted)}>{t(`savings.pocket_type_${p.pocket_type}`)}</p>
          </div>

          {p.target_amount != null ? (
            <p className={cx("text-[clamp(0.6188rem,2.86vw,0.6875rem)] font-semibold font-mono tabular-nums", tokens.text.label)}>{formatIDR(p.current_amount)} <span className="text-slate-500 font-normal">/ {formatIDR(p.target_amount)}</span></p>
          ) : (
            <p className={cx("text-[clamp(0.6188rem,2.86vw,0.6875rem)] font-bold font-mono tabular-nums", tokens.text.onSurface)}>{formatIDR(p.current_amount)}</p>
          )}

          {p.notes && <p className={cx("text-[clamp(0.5906rem,2.73vw,0.6562rem)] italic truncate", tokens.text.muted)}>{p.notes}</p>}

          <div className="grid grid-cols-2 gap-1.5 pt-1">
            <button onClick={() => openMove(p, "deposit")} disabled={busyId === p.id || p.is_archived}
              className="flex items-center justify-center gap-1 py-2 rounded-full text-[clamp(0.6188rem,2.86vw,0.6875rem)] font-bold transition-all active:scale-95 cursor-pointer disabled:opacity-50 bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25">
              <ArrowDownCircle size={12} /> {t("savings.deposit_button")}
            </button>
            <button onClick={() => openMove(p, "withdraw")} disabled={busyId === p.id || p.is_archived || p.current_amount <= 0}
              className={cx(
                "flex items-center justify-center gap-1 py-2 rounded-full text-[clamp(0.6188rem,2.86vw,0.6875rem)] font-bold transition-all active:scale-95 cursor-pointer disabled:opacity-50",
                tokens.savings.actionBtnBg,
                tokens.text.accent
              )}>
              <ArrowUpCircle size={12} /> {t("savings.withdraw_button")}
            </button>
          </div>
          <div className="flex items-center justify-center gap-1.5">
            <button onClick={() => { audioFeedback.playClick(); openEditForm(p); }} className={cx("p-1.5 rounded-full transition-all active:scale-90 cursor-pointer", tokens.chip.editIconBtn)}><Edit2 size={12} /></button>
            <button onClick={() => toggleArchive(p)} disabled={busyId === p.id}
              title={p.is_archived ? t("savings.unarchive_button") : t("savings.archive_button")}
              className={cx("p-1.5 rounded-full bg-amber-500/10 hover:bg-amber-500/20 transition-all active:scale-90 cursor-pointer disabled:opacity-50", tokens.text.warning)}>
              {p.is_archived ? <ArchiveRestore size={12} /> : <Archive size={12} />}
            </button>
            <button onClick={() => { audioFeedback.playClick(); setDeleteTarget(p); }} className={cx("p-1.5 rounded-full bg-red-500/15 hover:bg-red-500/25 transition-all active:scale-90 cursor-pointer", tokens.text.danger)}><Trash2 size={12} /></button>
          </div>
        </div>
      </motion.div>
    );
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">

      <CollapsingPageHeader
        title={t("savings.page_title")}
        subtitle={t("savings.page_subtitle")}
        actions={
          <button
            type="button"
            onClick={() => { audioFeedback.playClick(); openAddForm(); }}
            aria-label={t("savings.add_button")}
            className={cx("p-1.5 rounded-full cursor-pointer active:scale-[0.92] transition-transform", tokens.text.secondary)}
          >
            <Plus size={18} />
          </button>
        }
      >

          {/* Tombol Add SUDAH dipindah ke actions slot di sticky toolbar --
              sengaja TIDAK didobel di sini. */}

          <div className="grid grid-cols-3 gap-2">
            <div className={cx("rounded-2xl px-3 py-3 border", tokens.surface.card, tokens.border.default)}>
              <span className={cx("text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold uppercase tracking-wider block mb-1", tokens.text.muted)}>{t("savings.stat_total_saved")}</span>
              <p className={cx("font-bold font-mono text-[clamp(0.6188rem,2.86vw,0.6875rem)] leading-tight whitespace-nowrap tabular-nums tracking-tight", tokens.text.success)}>{formatIDR(summary.total_saved)}</p>
            </div>
            <div className={cx("rounded-2xl px-3 py-3 border", tokens.surface.card, tokens.border.default)}>
              <span className={cx("text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold uppercase tracking-wider block mb-1", tokens.text.muted)}>{t("savings.stat_available_balance")}</span>
              <p className={cx("font-bold font-mono text-[clamp(0.6188rem,2.86vw,0.6875rem)] leading-tight whitespace-nowrap tabular-nums tracking-tight", tokens.text.accentStrong)}>{availableBalance != null ? formatIDR(availableBalance) : "-"}</p>
            </div>
            <div className={cx("rounded-2xl px-3 py-3 border", tokens.surface.card, tokens.border.default)}>
              <span className={cx("text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold uppercase tracking-wider block mb-1", tokens.text.muted)}>{t("savings.stat_pocket_count")}</span>
              <p className={cx("font-bold text-2xl", tokens.text.onSurface)}>{summary.pocket_count}</p>
            </div>
          </div>

          <div className={cx("flex items-start gap-2.5 rounded-2xl border px-4 py-3", tokens.surface.card, tokens.border.default)}>
            <Info size={14} className={cx("shrink-0 mt-0.5", tokens.text.accent)} />
            <p className={cx("text-[clamp(0.6188rem,2.86vw,0.6875rem)] leading-relaxed", tokens.text.mutedAlt)}>{t("savings.info_banner_text")}</p>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
            </div>
          ) : pocketsError ? (
            <ErrorState onRetry={refresh} />
          ) : pockets.length === 0 ? (
            <EmptyState icon={<PiggyBank size={40} className={cx(tokens.text.faint)} />} title={t("savings.empty_title")} description={t("savings.empty_desc")} />
          ) : (
            <AnimatePresence>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {activePockets.map(renderPocketCard)}
                {archivedPockets.map(renderPocketCard)}
              </div>
            </AnimatePresence>
          )}
      </CollapsingPageHeader>

      {/* Add/Edit pocket form modal */}
      <ModalShell
        isOpen={isFormOpen}
        onClose={closeForm}
        maxWidth="max-w-md"
        labelledBy="savings-form-title"
        className="overflow-hidden"
      >
        <div className="h-1 w-full bg-gradient-to-r from-emerald-500 to-indigo-500" />
        <div className="p-6 space-y-4">
          <h2 id="savings-form-title" className={cx("font-sans font-extrabold text-lg tracking-tight", tokens.text.heading)}>
            {editTarget ? t("savings.edit_title") : t("savings.add_title")}
          </h2>
          <Input
            type="text"
            label={t("savings.form_name")}
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder={t("savings.form_name_placeholder")}
          />
          <div>
            <label className={cx("block text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold uppercase tracking-wider mb-1.5", tokens.text.muted)}>{t("savings.form_type")}</label>
            <DropdownField
              value={form.pocket_type}
              onChange={(v) => setForm(f => ({ ...f, pocket_type: v as SavingsPocketType }))}
              options={POCKET_TYPES.map(pt => ({ value: pt, label: t(`savings.pocket_type_${pt}`) }))}
            />
            <p className="text-[clamp(0.6188rem,2.86vw,0.6875rem)] text-slate-500 mt-1.5 leading-relaxed">{t(`savings.pocket_type_${form.pocket_type}_desc`)}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <CurrencyInput
              label={t("savings.form_target_amount")}
              value={form.target_amount}
              onValueChange={digits => setForm(f => ({ ...f, target_amount: digits }))}
              placeholder={t("savings.form_target_amount_placeholder")}
            />
            <Input
              type="date"
              label={t("savings.form_target_date")}
              value={form.target_date}
              onChange={e => setForm(f => ({ ...f, target_date: e.target.value }))}
            />
          </div>
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
            label={t("savings.form_notes")}
            value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            placeholder={t("savings.form_notes_placeholder")}
          />
          <div className="flex gap-3 pt-1">
            <Button variant="secondary" onClick={closeForm} className="flex-1 py-3 rounded-full font-bold text-sm">{t("common.cancel")}</Button>
            <Button variant="success" onClick={handleSave} disabled={isSaving} isLoading={isSaving} className="flex-1 py-3 rounded-full font-bold text-sm">{t("common.save")}</Button>
          </div>
        </div>
      </ModalShell>

      {/* Deposit/Withdraw modal */}
      <ModalShell
        isOpen={!!moveTarget}
        onClose={closeMoveModal}
        maxWidth="max-w-sm"
        labelledBy="savings-move-title"
        className="overflow-hidden"
      >
        {moveTarget && (
          <>
            <div className={`h-1 w-full ${moveTarget.direction === "deposit" ? "bg-emerald-500" : "bg-indigo-500"}`} />
            <div className="p-6 space-y-4">
              <div>
                <h2 id="savings-move-title" className={cx("font-sans font-extrabold text-lg tracking-tight", tokens.text.heading)}>
                  {t(moveTarget.direction === "deposit" ? "savings.deposit_title" : "savings.withdraw_title", { name: moveTarget.pocket.name })}
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  {t(moveTarget.direction === "deposit" ? "savings.deposit_desc" : "savings.withdraw_desc")}
                </p>
              </div>
              <div>
                <CurrencyInput
                  label={t("savings.form_amount")}
                  value={moveAmount}
                  onValueChange={setMoveAmount}
                  placeholder={t("savings.form_amount_placeholder")}
                  autoFocus
                />
                {moveTarget.direction === "deposit" && availableBalance != null && (
                  <p className="text-[clamp(0.6188rem,2.86vw,0.6875rem)] text-slate-500 mt-1.5">{t("savings.available_balance_hint", { amount: formatIDR(availableBalance) })}</p>
                )}
                {moveTarget.direction === "withdraw" && (
                  <p className="text-[clamp(0.6188rem,2.86vw,0.6875rem)] text-slate-500 mt-1.5">{t("savings.pocket_balance_hint", { amount: formatIDR(moveTarget.pocket.current_amount) })}</p>
                )}
              </div>
              <Input
                type="date"
                label={t("savings.form_entry_date")}
                value={moveDate}
                onChange={e => setMoveDate(e.target.value)}
              />
              <Input
                type="text"
                label={t("savings.form_entry_note")}
                value={moveNote}
                onChange={e => setMoveNote(e.target.value)}
              />
              <div className="flex gap-3 pt-1">
                <Button variant="secondary" onClick={closeMoveModal} className="flex-1 py-3 rounded-full font-bold text-sm">{t("common.cancel")}</Button>
                <Button
                  variant="success"
                  onClick={executeMove}
                  disabled={isMoving}
                  isLoading={isMoving}
                  className="flex-1 py-3 rounded-full font-bold text-sm"
                >
                  {t(moveTarget.direction === "deposit" ? "savings.deposit_button" : "savings.withdraw_button")}
                </Button>
              </div>
            </div>
          </>
        )}
      </ModalShell>

      <Modal isOpen={!!deleteTarget} title={t("savings.delete_confirm_title")} description={t("savings.delete_confirm_desc", { name: deleteTarget?.name ?? "" })} type="danger" confirmLabel={t("common.delete")} cancelLabel={t("common.cancel")} onConfirm={handleDeleteConfirmed} onCancel={() => setDeleteTarget(null)} confirmDisabled={isDeleting} />
    </motion.div>
  );
};
