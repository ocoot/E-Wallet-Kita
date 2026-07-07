import React, { useEffect, useMemo, useState } from "react";
import { Mic, Loader2, ShieldAlert, Check, X, RotateCcw, ArrowDownCircle, ArrowUpCircle } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useLanguage } from "../contexts/LanguageContext";
import { useCategories } from "../hooks/useCategories";
import { audioFeedback } from "../lib/audio";
import type { VoiceParsedResult } from "./VoiceRecorder";

export type VoiceModalStatus = "processing" | "error" | "success" | null;

interface VoicePreviewProps {
  /** null = modal disembunyikan sepenuhnya */
  status: VoiceModalStatus;
  /** Hasil parsing AI (hanya terisi saat status === "success") */
  draft: VoiceParsedResult | null;
  /** Pesan error (hanya terisi saat status === "error") */
  errorMessage?: string | null;
  /** Menutup modal (dipanggil dari tombol close / overlay klik saat error atau success) */
  onClose: () => void;
  /** Mengulang perekaman dari awal (dipanggil dari state error) */
  onRetry: () => void;
  /** Dikonfirmasi oleh pengguna, membawa data final (boleh sudah diedit) */
  onConfirm: (finalData: { type: "income" | "expense"; category_key: string; amount: number; note: string }) => void;
}

export const VoicePreview: React.FC<VoicePreviewProps> = ({
  status,
  draft,
  errorMessage,
  onClose,
  onRetry,
  onConfirm,
}) => {
  const { t, locale } = useLanguage();
  const { categories } = useCategories();

  // ── Editable local state, disinkronkan ulang setiap kali draft baru masuk ──
  const [type, setType] = useState<"income" | "expense">("expense");
  const [category, setCategory] = useState("other");
  const [amount, setAmount] = useState<number>(0);
  const [note, setNote] = useState("");

  useEffect(() => {
    if (status === "success" && draft) {
      setType(draft.type);
      setCategory(draft.category_key || "other");
      setAmount(draft.amount || 0);
      setNote(draft.original_text || "");
    }
  }, [status, draft]);

  const activeCategories = useMemo(
    () => categories.filter((c) => c.type === type || c.type === "both"),
    [categories, type]
  );

  // Pastikan kategori terpilih tetap valid saat tipe income/expense diganti
  useEffect(() => {
    if (activeCategories.length > 0 && !activeCategories.some((c) => c.key === category)) {
      setCategory(activeCategories[0].key);
    }
  }, [type, activeCategories]);

  const formatIDR = (num: number) => "Rp" + Math.round(num || 0).toLocaleString("id-ID");

  const isOpen = status !== null;
  const canConfirm = status === "success" && amount > 0 && !!category;

  const handleConfirm = () => {
    if (!canConfirm) return;
    audioFeedback.playChime();
    onConfirm({
      type,
      category_key: category,
      amount: Number(amount) || 0,
      note: note.trim() || (draft?.original_text ?? ""),
    });
  };

  const handleDismiss = () => {
    audioFeedback.playDullPluck();
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={status !== "processing" ? handleDismiss : undefined}
            className="fixed inset-0 bg-black/60 backdrop-blur-xs"
          />

          {/* ── STATE: PROCESSING ───────────────────────────────────── */}
          {status === "processing" && (
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 15 }}
              transition={{ type: "spring", duration: 0.3 }}
              className="relative z-10 w-full max-w-sm overflow-hidden rounded-2xl border p-8 shadow-2xl bg-slate-900 border-indigo-500/20 text-white light_sakura:bg-white light_sakura:text-slate-800 light_sakura:border-rose-100 flex flex-col items-center text-center space-y-4"
            >
              <div className="p-3.5 rounded-full bg-indigo-500/10 text-indigo-400 light_sakura:bg-rose-50 light_sakura:text-rose-500">
                <Loader2 className="animate-spin" size={28} />
              </div>
              <div className="space-y-1.5">
                <h3 className="font-sans text-base font-bold">
                  {t("dashboard.voice_processing")}
                </h3>
                <p className="font-sans text-xs opacity-70 leading-relaxed">
                  {t("dashboard.voice_processing_desc")}
                </p>
              </div>
            </motion.div>
          )}

          {/* ── STATE: ERROR ────────────────────────────────────────── */}
          {status === "error" && (
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 15 }}
              transition={{ type: "spring", duration: 0.3 }}
              className="relative z-10 w-full max-w-sm overflow-hidden rounded-2xl border p-6 shadow-2xl bg-slate-900 border-red-500/30 text-white light_sakura:bg-white light_sakura:text-slate-800 light_sakura:border-red-200"
            >
              <div className="flex flex-col items-center text-center space-y-4">
                <div className="p-3.5 rounded-full bg-red-500/15 text-red-400 light_sakura:bg-red-50 light_sakura:text-red-500">
                  <ShieldAlert size={26} />
                </div>
                <div className="space-y-1.5">
                  <h3 className="font-sans text-base font-bold">
                    {t("dashboard.voice_error_title")}
                  </h3>
                  <p className="font-sans text-xs opacity-80 leading-relaxed">
                    {errorMessage || t("dashboard.voice_error_generic")}
                  </p>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={handleDismiss}
                  className="flex-1 cursor-pointer py-3 px-4 bg-slate-800 hover:bg-slate-700/80 text-slate-300 rounded-xl font-sans text-xs font-bold flex items-center justify-center gap-2 transition-all border border-slate-800 light_sakura:bg-slate-100 light_sakura:text-slate-700 light_sakura:hover:bg-slate-200/80 light_sakura:border-transparent"
                >
                  <X size={14} />
                  <span>{t("dashboard.voice_close")}</span>
                </button>
                <button
                  onClick={() => {
                    audioFeedback.playClick();
                    onRetry();
                  }}
                  className="flex-1 cursor-pointer py-3 px-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-sans text-xs font-bold shadow-lg shadow-indigo-600/15 flex items-center justify-center gap-2 transition-all light_sakura:bg-rose-500 light_sakura:hover:bg-rose-400"
                >
                  <RotateCcw size={14} />
                  <span>{t("dashboard.voice_try_again")}</span>
                </button>
              </div>
            </motion.div>
          )}

          {/* ── STATE: SUCCESS (review & edit) ─────────────────────── */}
          {status === "success" && draft && (
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 15 }}
              transition={{ type: "spring", duration: 0.3 }}
              className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border p-6 shadow-2xl bg-slate-900 border-indigo-500/20 text-white light_sakura:bg-white light_sakura:text-slate-800 light_sakura:border-rose-100 max-h-[90vh] overflow-y-auto"
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-4 mb-5 light_sakura:border-rose-100/50">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-indigo-500/10 text-indigo-400 rounded-xl light_sakura:bg-rose-50 light_sakura:text-rose-500">
                    <Mic size={20} />
                  </div>
                  <div>
                    <h3 className="font-sans font-bold text-base">
                      {t("dashboard.voice_review_title")}
                    </h3>
                    <p className="font-sans text-xs opacity-60">
                      {t("dashboard.voice_review_subtitle")}
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleDismiss}
                  className="p-2 opacity-60 hover:opacity-100 rounded-xl hover:bg-slate-800/50 cursor-pointer transition-all light_sakura:hover:bg-slate-100"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Transkrip asli dari suara pengguna */}
              <div className="mb-4 p-3 rounded-xl bg-slate-950/60 border border-slate-800/60 light_sakura:bg-rose-50/40 light_sakura:border-rose-100/50">
                <p className="text-[clamp(0.5625rem,2.6vw,0.625rem)] uppercase tracking-widest font-bold opacity-50 mb-1">
                  {t("dashboard.voice_transcript_label")}
                </p>
                <p className="font-sans text-xs italic opacity-80">"{draft.original_text}"</p>
              </div>

              {/* Toggle Income / Expense */}
              <div className="mb-4">
                <label className="text-[clamp(0.5625rem,2.6vw,0.625rem)] uppercase tracking-widest font-bold opacity-50 block mb-1.5">
                  {t("dashboard.voice_type_label")}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => { audioFeedback.playClick(); setType("expense"); }}
                    className={`py-2.5 rounded-xl font-sans text-xs font-bold flex items-center justify-center gap-1.5 border transition-all cursor-pointer ${
                      type === "expense"
                        ? "bg-red-500/15 border-red-500/40 text-red-400"
                        : "bg-slate-950/40 border-slate-800 opacity-50 hover:opacity-80"
                    }`}
                  >
                    <ArrowDownCircle size={13} />
                    <span>{t("transaction.expense")}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { audioFeedback.playClick(); setType("income"); }}
                    className={`py-2.5 rounded-xl font-sans text-xs font-bold flex items-center justify-center gap-1.5 border transition-all cursor-pointer ${
                      type === "income"
                        ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-400"
                        : "bg-slate-950/40 border-slate-800 opacity-50 hover:opacity-80"
                    }`}
                  >
                    <ArrowUpCircle size={13} />
                    <span>{t("transaction.income")}</span>
                  </button>
                </div>
              </div>

              {/* Nominal & Kategori (editable) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                <div className="space-y-1">
                  <label className="text-[clamp(0.5625rem,2.6vw,0.625rem)] uppercase tracking-widest font-bold opacity-50 block">
                    {t("transaction.amount_label")}
                  </label>
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(Number(e.target.value) || 0)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 font-bold text-emerald-400 focus:border-indigo-500 outline-none light_sakura:bg-white light_sakura:border-rose-200/60"
                  />
                  <p className="text-[clamp(0.5625rem,2.6vw,0.625rem)] opacity-50 font-mono">{formatIDR(amount)}</p>
                </div>
                <div className="space-y-1">
                  <label className="text-[clamp(0.5625rem,2.6vw,0.625rem)] uppercase tracking-widest font-bold opacity-50 block">
                    {t("transaction.category_label")}
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-2 focus:border-indigo-500 outline-none light_sakura:bg-white light_sakura:border-rose-200/60"
                  >
                    {activeCategories.map((cat) => (
                      <option key={cat.key} value={cat.key}>
                        {locale === "id" ? (cat.label_id || cat.key) : (cat.label_en || cat.key)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Catatan (editable) */}
              <div className="space-y-1 mb-6">
                <label className="text-[clamp(0.5625rem,2.6vw,0.625rem)] uppercase tracking-widest font-bold opacity-50 block">
                  {t("transaction.note_label")}
                </label>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 focus:border-indigo-500 outline-none light_sakura:bg-white light_sakura:border-rose-200/60"
                />
              </div>

              {/* Konfirmasi apakah sudah sesuai atau belum */}
              <div className="flex gap-3">
                <button
                  onClick={handleDismiss}
                  className="flex-1 cursor-pointer py-3.5 px-4 bg-slate-800 hover:bg-slate-700/80 text-slate-300 rounded-xl font-sans text-xs font-bold flex items-center justify-center gap-2 transition-all border border-slate-800 light_sakura:bg-slate-100 light_sakura:text-slate-700 light_sakura:hover:bg-slate-200/80 light_sakura:border-transparent"
                >
                  <X size={14} />
                  <span>{t("dashboard.voice_not_correct")}</span>
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={!canConfirm}
                  className="flex-2 cursor-pointer py-3.5 px-6 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-sans text-xs font-bold shadow-lg shadow-indigo-600/15 flex items-center justify-center gap-2 transition-all disabled:opacity-30 disabled:pointer-events-none light_sakura:bg-rose-500 light_sakura:hover:bg-rose-400"
                >
                  <Check size={14} />
                  <span>{t("dashboard.voice_confirm_correct")}</span>
                </button>
              </div>
            </motion.div>
          )}
        </div>
      )}
    </AnimatePresence>
  );
};
