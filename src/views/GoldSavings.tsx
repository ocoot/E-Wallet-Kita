import React, { useState, useMemo } from "react";
import { useLanguage } from "../contexts/LanguageContext";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { dbService } from "../lib/db";
import { useGoldSavings } from "../hooks/useGoldSavings";
import { GoldPocket, GoldBrand } from "../types";
import { Modal } from "../components/Modal";
import { EmptyState } from "../components/EmptyState";
import { motion, AnimatePresence } from "motion/react";
import { audioFeedback } from "../lib/audio";
import {
  Coins, Plus, Trash2, Edit2, ArrowDownCircle, ArrowUpCircle,
  Archive, ArchiveRestore, Info, AlertTriangle, PackagePlus, PackageMinus
} from "lucide-react";

const GOLD_BRANDS: GoldBrand[] = ["antam", "logammulia", "ubs", "galeri24", "pegadaian", "sampoernagold", "hartadinataabadi"];

const formatIDR = (num: number | null) => num != null ? "Rp" + Math.round(num).toLocaleString("id-ID") : "-";
const formatGrams = (num: number) => `${num.toLocaleString("id-ID", { maximumFractionDigits: 4 })} gr`;

interface PocketFormState {
  name: string;
  brand: GoldBrand;
  notes: string;
}
const emptyForm = (): PocketFormState => ({ name: "", brand: "antam", notes: "" });

type MoveDirection = "buy" | "sell" | "manual_add" | "manual_remove";

export const GoldSavings: React.FC = () => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { showToast } = useToast();
  const { pockets, summary, prices, loading, refresh } = useGoldSavings(user?.id);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<GoldPocket | null>(null);
  const [form, setForm] = useState<PocketFormState>(emptyForm());
  const [isSaving, setIsSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<GoldPocket | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [moveTarget, setMoveTarget] = useState<{ pocket: GoldPocket; direction: MoveDirection } | null>(null);
  const [moveValue, setMoveValue] = useState("");
  const [moveNote, setMoveNote] = useState("");
  const [isMoving, setIsMoving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const activePockets = useMemo(() => pockets.filter(p => !p.is_archived), [pockets]);
  const archivedPockets = useMemo(() => pockets.filter(p => p.is_archived), [pockets]);
  const priceByBrand = useMemo(() => new Map(prices.map(p => [p.brand, p])), [prices]);

  const openAddForm = () => { setEditTarget(null); setForm(emptyForm()); setIsFormOpen(true); };
  const openEditForm = (p: GoldPocket) => {
    setEditTarget(p);
    setForm({ name: p.name, brand: p.brand, notes: p.notes ?? "" });
    setIsFormOpen(true);
  };

  const handleSave = async () => {
    if (!user) return;
    const trimmedName = form.name.trim();
    if (!trimmedName) { audioFeedback.playDullPluck(); showToast(t("gold.invalid_name"), "error"); return; }

    setIsSaving(true);
    try {
      if (editTarget) {
        // Brand sengaja tidak ikut di-submit saat edit -- lihat catatan di
        // migration (brand acuan harga tidak dianjurkan berubah setelah
        // pocket punya transaksi, supaya cash_locked_amount tetap bermakna).
        await dbService.updateGoldPocket(user.id, editTarget.id, { name: trimmedName, notes: form.notes.trim() || null });
      } else {
        await dbService.createGoldPocket(user.id, { name: trimmedName, brand: form.brand, notes: form.notes.trim() || null });
      }
      showToast(t("gold.save_success"), "success");
      audioFeedback.playClick();
      setIsFormOpen(false);
      await refresh();
    } catch { showToast(t("gold.save_error"), "error"); }
    finally { setIsSaving(false); }
  };

  const handleDeleteConfirmed = async () => {
    if (!user || !deleteTarget) return;
    setIsDeleting(true);
    try {
      const ok = await dbService.deleteGoldPocket(user.id, deleteTarget.id);
      if (ok) { showToast(t("gold.delete_success"), "success"); await refresh(); }
      else showToast(t("gold.delete_error"), "error");
    } catch { showToast(t("gold.delete_error"), "error"); }
    finally { setIsDeleting(false); setDeleteTarget(null); }
  };

  const toggleArchive = async (p: GoldPocket) => {
    if (!user) return;
    setBusyId(p.id);
    try {
      await dbService.updateGoldPocket(user.id, p.id, { is_archived: !p.is_archived });
      audioFeedback.playClick();
      await refresh();
    } catch { showToast(t("gold.save_error"), "error"); }
    finally { setBusyId(null); }
  };

  const openMove = (pocket: GoldPocket, direction: MoveDirection) => {
    audioFeedback.playClick();
    setMoveTarget({ pocket, direction });
    setMoveValue("");
    setMoveNote("");
  };

  const executeMove = async () => {
    if (!moveTarget || !user) return;
    const num = Number(moveValue);
    if (!moveValue.trim() || isNaN(num) || num <= 0) {
      audioFeedback.playDullPluck(); showToast(t("gold.invalid_amount"), "error"); return;
    }

    setIsMoving(true);
    try {
      const { pocket, direction } = moveTarget;
      if (direction === "buy") {
        await dbService.buyGold(pocket.id, num, moveNote.trim() || null);
        showToast(t("gold.buy_success", { name: pocket.name }), "success");
      } else if (direction === "sell") {
        await dbService.sellGold(pocket.id, num, moveNote.trim() || null);
        showToast(t("gold.sell_success", { name: pocket.name }), "success");
      } else if (direction === "manual_add") {
        await dbService.adjustGoldHolding(pocket.id, "add", num, moveNote.trim() || null);
        showToast(t("gold.manual_add_success", { name: pocket.name }), "success");
      } else {
        await dbService.adjustGoldHolding(pocket.id, "remove", num, moveNote.trim() || null);
        showToast(t("gold.manual_remove_success", { name: pocket.name }), "success");
      }
      audioFeedback.playClick();
      setMoveTarget(null);
      await refresh();
    } catch (err: any) {
      const msg = String(err?.message || "");
      if (msg.includes("PRICE_STALE")) showToast(t("gold.price_stale_error"), "error");
      else if (msg.includes("BUYBACK_PRICE_UNAVAILABLE")) showToast(t("gold.buyback_unavailable_error"), "error");
      else if (msg.includes("PRICE_NOT_AVAILABLE")) showToast(t("gold.price_unavailable_error"), "error");
      else if (msg.includes("INSUFFICIENT_GOLD_BALANCE")) showToast(t("gold.insufficient_gold_error"), "error");
      else if (msg.includes("AMOUNT_TOO_SMALL")) showToast(t("gold.amount_too_small_error"), "error");
      else showToast(t("gold.move_error"), "error");
    } finally { setIsMoving(false); }
  };

  const moveModalCopy: Record<MoveDirection, { title: string; desc: string; button: string; barClass: string; buttonClass: string }> = {
    buy: { title: "gold.buy_title", desc: "gold.buy_desc", button: "gold.buy_button", barClass: "bg-emerald-500", buttonClass: "bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/20" },
    sell: { title: "gold.sell_title", desc: "gold.sell_desc", button: "gold.sell_button", barClass: "bg-indigo-500", buttonClass: "bg-indigo-600 hover:bg-indigo-500 shadow-indigo-600/20" },
    manual_add: { title: "gold.manual_add_title", desc: "gold.manual_add_desc", button: "gold.manual_add_button", barClass: "bg-sky-500", buttonClass: "bg-sky-600 hover:bg-sky-500 shadow-sky-600/20" },
    manual_remove: { title: "gold.manual_remove_title", desc: "gold.manual_remove_desc", button: "gold.manual_remove_button", barClass: "bg-amber-500", buttonClass: "bg-amber-600 hover:bg-amber-500 shadow-amber-600/20" },
  };

  const renderPocketCard = (p: GoldPocket) => {
    const price = priceByBrand.get(p.brand);
    const marketValue = price ? p.grams_owned * price.buyback_price_per_gram : null;
    const gainLoss = marketValue != null ? marketValue - p.cash_locked_amount : null;
    return (
      <motion.div key={p.id} initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }}
        className={`rounded-2xl border overflow-hidden ${p.is_archived
          ? "border-slate-800/50 bg-slate-950/20 opacity-60"
          : "border-slate-800/50 bg-slate-950/40 light_sakura:bg-rose-50/20 light_sakura:border-rose-100/30"}`}>
        <div className="p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
                <Coins size={16} className="text-amber-400" />
              </div>
              <div className="min-w-0">
                <p className="font-sans font-bold text-sm text-slate-100 light_sakura:text-slate-900 truncate">{p.name}</p>
                <p className="text-[10.5px] text-slate-500">{t(`gold.brand_${p.brand}`)}</p>
              </div>
            </div>
            {p.is_archived && (
              <span className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded-md text-[8px] font-bold bg-slate-700/70 text-slate-300">
                {t("gold.archived_badge")}
              </span>
            )}
          </div>

          <div className="text-center py-1">
            <p className="font-bold text-lg text-amber-400 light_sakura:text-amber-600">{formatGrams(p.grams_owned)}</p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {marketValue != null ? t("gold.est_value", { amount: formatIDR(marketValue) }) : t("gold.price_unavailable_short")}
            </p>
            {gainLoss != null && p.grams_owned > 0 && (
              <p className={`text-[10.5px] font-semibold mt-0.5 ${gainLoss >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {gainLoss >= 0 ? "▲ " : "▼ "}{formatIDR(Math.abs(gainLoss))} {t(gainLoss >= 0 ? "gold.unrealized_gain" : "gold.unrealized_loss")}
              </p>
            )}
          </div>

          {p.notes && <p className="text-[10.5px] text-slate-500 italic truncate text-center">{p.notes}</p>}

          <div className="grid grid-cols-2 gap-1.5">
            <button onClick={() => openMove(p, "buy")} disabled={busyId === p.id || p.is_archived}
              className="flex items-center justify-center gap-1 py-2 rounded-xl text-[11px] font-semibold transition-colors cursor-pointer disabled:opacity-50 bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25">
              <ArrowDownCircle size={12} /> {t("gold.buy_button")}
            </button>
            <button onClick={() => openMove(p, "sell")} disabled={busyId === p.id || p.is_archived || p.grams_owned <= 0 || !price?.buyback_price_per_gram}
              title={!price?.buyback_price_per_gram ? t("gold.buyback_unavailable_hint") : undefined}
              className="flex items-center justify-center gap-1 py-2 rounded-xl text-[11px] font-semibold transition-colors cursor-pointer disabled:opacity-50 bg-indigo-500/15 text-indigo-400 hover:bg-indigo-500/25 light_sakura:bg-rose-50 light_sakura:text-rose-600">
              <ArrowUpCircle size={12} /> {t("gold.sell_button")}
            </button>
            <button onClick={() => openMove(p, "manual_add")} disabled={busyId === p.id || p.is_archived}
              className="flex items-center justify-center gap-1 py-2 rounded-xl text-[11px] font-semibold transition-colors cursor-pointer disabled:opacity-50 bg-sky-500/15 text-sky-400 hover:bg-sky-500/25">
              <PackagePlus size={12} /> {t("gold.manual_add_button_short")}
            </button>
            <button onClick={() => openMove(p, "manual_remove")} disabled={busyId === p.id || p.is_archived || p.grams_owned <= 0}
              className="flex items-center justify-center gap-1 py-2 rounded-xl text-[11px] font-semibold transition-colors cursor-pointer disabled:opacity-50 bg-slate-700/40 text-slate-400 hover:bg-slate-700/60">
              <PackageMinus size={12} /> {t("gold.manual_remove_button_short")}
            </button>
          </div>
          <div className="flex items-center justify-center gap-1.5 pt-0.5">
            <button onClick={() => { audioFeedback.playClick(); openEditForm(p); }} className="p-1.5 rounded-lg bg-slate-700/50 text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors cursor-pointer light_sakura:bg-slate-100 light_sakura:text-slate-500"><Edit2 size={12} /></button>
            <button onClick={() => toggleArchive(p)} disabled={busyId === p.id}
              title={p.is_archived ? t("gold.unarchive_button") : t("gold.archive_button")}
              className="p-1.5 rounded-lg bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 transition-colors cursor-pointer disabled:opacity-50 light_sakura:bg-amber-50">
              {p.is_archived ? <ArchiveRestore size={12} /> : <Archive size={12} />}
            </button>
            <button onClick={() => { audioFeedback.playClick(); setDeleteTarget(p); }} className="p-1.5 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors cursor-pointer light_sakura:bg-red-50 light_sakura:text-red-400"><Trash2 size={12} /></button>
          </div>
        </div>
      </motion.div>
    );
  };

  const copy = moveTarget ? moveModalCopy[moveTarget.direction] : null;
  const isGramInput = moveTarget?.direction === "sell" || moveTarget?.direction === "manual_add" || moveTarget?.direction === "manual_remove";

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">

      <div className="rounded-3xl border bg-slate-900 border-slate-800/60 light_sakura:bg-white light_sakura:border-rose-100/40 shadow-lg overflow-hidden">
        <div className="h-1.5 w-full bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-500" />
        <div className="p-6 md:p-8 space-y-6">

          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div>
              <h1 className="font-sans font-bold text-2xl tracking-tight text-white light_sakura:text-slate-900">
                {t("gold.page_title")}
              </h1>
              <p className="text-sm text-slate-400 mt-1 light_sakura:text-slate-500 leading-relaxed">
                {t("gold.page_subtitle")}
              </p>
            </div>
            <button onClick={() => { audioFeedback.playClick(); openAddForm(); }}
              className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-sm transition-colors shadow-lg shadow-amber-500/20 shrink-0 cursor-pointer">
              <Plus size={16} /> {t("gold.add_button")}
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-2xl bg-amber-500/8 border border-amber-500/15 px-4 py-3 light_sakura:bg-amber-50/60 light_sakura:border-amber-100">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">{t("gold.stat_total_grams")}</span>
              <p className="font-bold text-sm sm:text-lg text-amber-400 light_sakura:text-amber-600 truncate">{formatGrams(summary.total_grams)}</p>
            </div>
            <div className="rounded-2xl bg-indigo-500/8 border border-indigo-500/15 px-4 py-3 light_sakura:bg-indigo-50/60 light_sakura:border-indigo-100">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">{t("gold.stat_market_value")}</span>
              <p className="font-bold text-sm sm:text-lg text-indigo-400 light_sakura:text-indigo-600 truncate">{formatIDR(summary.total_market_value)}</p>
            </div>
            <div className="rounded-2xl bg-slate-800/40 border border-slate-700/40 px-4 py-3 light_sakura:bg-slate-100/60 light_sakura:border-slate-200">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">{t("gold.stat_cash_locked")}</span>
              <p className="font-bold text-sm sm:text-lg text-slate-200 light_sakura:text-slate-700 truncate">{formatIDR(summary.total_cash_locked)}</p>
            </div>
            <div className={`rounded-2xl border px-4 py-3 ${summary.unrealized_gain_loss >= 0
              ? "bg-emerald-500/8 border-emerald-500/15 light_sakura:bg-emerald-50/60 light_sakura:border-emerald-100"
              : "bg-red-500/8 border-red-500/15 light_sakura:bg-red-50/60 light_sakura:border-red-100"}`}>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">{t("gold.stat_gain_loss")}</span>
              <p className={`font-bold text-sm sm:text-lg truncate ${summary.unrealized_gain_loss >= 0 ? "text-emerald-400 light_sakura:text-emerald-600" : "text-red-400 light_sakura:text-red-500"}`}>
                {summary.unrealized_gain_loss >= 0 ? "+" : ""}{formatIDR(summary.unrealized_gain_loss)}
              </p>
            </div>
          </div>

          {summary.stale_pocket_count > 0 && (
            <div className="flex items-start gap-2.5 rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-3">
              <AlertTriangle size={14} className="text-amber-400 shrink-0 mt-0.5" />
              <p className="text-[11px] leading-relaxed text-amber-300">{t("gold.stale_price_warning")}</p>
            </div>
          )}

          <div className="flex items-start gap-2.5 rounded-2xl border border-indigo-500/15 bg-indigo-500/5 px-4 py-3 light_sakura:bg-indigo-50/40 light_sakura:border-indigo-100">
            <Info size={14} className="text-indigo-400 light_sakura:text-indigo-500 shrink-0 mt-0.5" />
            <p className="text-[11px] leading-relaxed text-slate-400 light_sakura:text-slate-600">{t("gold.info_banner_text")}</p>
          </div>

          {/* Strip harga referensi hari ini */}
          {prices.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
              {prices.map(pr => (
                <div key={pr.brand} className="shrink-0 rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-2 min-w-[128px] light_sakura:bg-slate-50 light_sakura:border-slate-200">
                  <p className="text-[9.5px] font-bold text-slate-400 uppercase tracking-wide">{t(`gold.brand_${pr.brand}`)}</p>
                  <p className="text-[11px] font-bold text-amber-400 light_sakura:text-amber-600">{formatIDR(pr.sell_price_per_gram)}</p>
                  <p className="text-[9.5px] text-slate-500">{t("gold.buyback_short")} {formatIDR(pr.buyback_price_per_gram)}</p>
                </div>
              ))}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
            </div>
          ) : pockets.length === 0 ? (
            <EmptyState icon={<Coins size={40} className="text-slate-600 light_sakura:text-slate-400" />} title={t("gold.empty_title")} description={t("gold.empty_desc")} />
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
              <div className="h-1 w-full bg-gradient-to-r from-amber-500 to-yellow-500" />
              <div className="p-6 space-y-4">
                <h2 className="font-sans font-bold text-lg text-slate-100 light_sakura:text-slate-900">
                  {editTarget ? t("gold.edit_title") : t("gold.add_title")}
                </h2>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">{t("gold.form_name")}</label>
                  <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder={t("gold.form_name_placeholder")} className="w-full px-4 py-3 rounded-2xl bg-slate-800 light_sakura:bg-slate-50 text-slate-100 light_sakura:text-slate-900 text-sm border border-slate-700 light_sakura:border-slate-200 focus:outline-none focus:border-amber-500 placeholder:text-slate-500 transition-colors" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">{t("gold.form_brand")}</label>
                  <select value={form.brand} disabled={!!editTarget} onChange={e => setForm(f => ({ ...f, brand: e.target.value as GoldBrand }))} className="w-full px-4 py-3 rounded-2xl bg-slate-800 light_sakura:bg-slate-50 text-slate-100 light_sakura:text-slate-900 text-sm border border-slate-700 light_sakura:border-slate-200 focus:outline-none focus:border-amber-500 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
                    {GOLD_BRANDS.map(b => <option key={b} value={b}>{t(`gold.brand_${b}`)}</option>)}
                  </select>
                  <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">
                    {editTarget ? t("gold.form_brand_locked_hint") : t("gold.form_brand_hint")}
                  </p>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">{t("gold.form_notes")}</label>
                  <input type="text" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder={t("gold.form_notes_placeholder")} className="w-full px-4 py-3 rounded-2xl bg-slate-800 light_sakura:bg-slate-50 text-slate-100 light_sakura:text-slate-900 text-sm border border-slate-700 light_sakura:border-slate-200 focus:outline-none focus:border-amber-500 placeholder:text-slate-500 transition-colors" />
                </div>
                <div className="flex gap-3 pt-1">
                  <button onClick={() => setIsFormOpen(false)} className="flex-1 py-3 rounded-2xl bg-slate-800 light_sakura:bg-slate-100 text-slate-300 light_sakura:text-slate-600 font-semibold text-sm hover:bg-slate-700 transition-colors cursor-pointer">{t("common.cancel")}</button>
                  <button onClick={handleSave} disabled={isSaving} className="flex-1 py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-sm transition-colors shadow-lg shadow-amber-500/20 disabled:opacity-50 cursor-pointer">{isSaving ? t("common.loading") : t("common.save")}</button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Buy/Sell/Manual adjust modal */}
      <AnimatePresence>
        {moveTarget && copy && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm"
            onClick={e => { if (e.target === e.currentTarget) setMoveTarget(null); }}>
            <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 40 }}
              className="w-full max-w-sm bg-slate-900 light_sakura:bg-white rounded-3xl border border-slate-800 light_sakura:border-slate-200 shadow-2xl overflow-hidden">
              <div className={`h-1 w-full ${copy.barClass}`} />
              <div className="p-6 space-y-4">
                <div>
                  <h2 className="font-sans font-bold text-lg text-slate-100 light_sakura:text-slate-900">
                    {t(copy.title, { name: moveTarget.pocket.name })}
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">{t(copy.desc)}</p>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                    {isGramInput ? t("gold.form_grams") : t("gold.form_idr_amount")}
                  </label>
                  <input type="number" value={moveValue} onChange={e => setMoveValue(e.target.value)} placeholder={isGramInput ? t("gold.form_grams_placeholder") : t("gold.form_idr_amount_placeholder")} min={0} step={isGramInput ? "0.0001" : "1000"} autoFocus className="w-full px-4 py-3 rounded-2xl bg-slate-800 light_sakura:bg-slate-50 text-slate-100 light_sakura:text-slate-900 text-sm border border-slate-700 light_sakura:border-slate-200 focus:outline-none focus:border-amber-500 placeholder:text-slate-500 transition-colors" />
                  {(moveTarget.direction === "sell" || moveTarget.direction === "manual_remove") && (
                    <p className="text-[11px] text-slate-500 mt-1.5">{t("gold.owned_grams_hint", { amount: formatGrams(moveTarget.pocket.grams_owned) })}</p>
                  )}
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">{t("gold.form_entry_note")}</label>
                  <input type="text" value={moveNote} onChange={e => setMoveNote(e.target.value)} className="w-full px-4 py-3 rounded-2xl bg-slate-800 light_sakura:bg-slate-50 text-slate-100 light_sakura:text-slate-900 text-sm border border-slate-700 light_sakura:border-slate-200 focus:outline-none focus:border-amber-500 transition-colors" />
                </div>
                <div className="flex gap-3 pt-1">
                  <button onClick={() => setMoveTarget(null)} className="flex-1 py-3 rounded-2xl bg-slate-800 light_sakura:bg-slate-100 text-slate-300 light_sakura:text-slate-600 font-semibold text-sm hover:bg-slate-700 transition-colors cursor-pointer">{t("common.cancel")}</button>
                  <button onClick={executeMove} disabled={isMoving}
                    className={`flex-1 py-3 rounded-2xl text-white font-semibold text-sm transition-colors shadow-lg disabled:opacity-50 cursor-pointer ${copy.buttonClass}`}>
                    {isMoving ? t("common.loading") : t(copy.button)}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <Modal isOpen={!!deleteTarget} title={t("gold.delete_confirm_title")} description={t("gold.delete_confirm_desc", { name: deleteTarget?.name ?? "" })} type="danger" confirmLabel={t("common.delete")} cancelLabel={t("common.cancel")} onConfirm={handleDeleteConfirmed} onCancel={() => setDeleteTarget(null)} confirmDisabled={isDeleting} />
    </motion.div>
  );
};
