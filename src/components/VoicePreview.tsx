import React, { useEffect, useMemo, useState } from "react";
import { Mic, Loader2, ShieldAlert, Check, X, RotateCcw, ArrowDownCircle, ArrowUpCircle } from "lucide-react";
import { useLanguage } from "../contexts/LanguageContext";
import { useCategories } from "../hooks/useCategories";
import { audioFeedback } from "../lib/audio";
import type { VoiceParsedResult } from "./VoiceRecorder";
import { DropdownField } from "./DropdownField";
import { useThemeTokens } from "../hooks/useThemeTokens";
import { ModalShell } from "./ui/ModalShell";

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
  const { tokens, cx } = useThemeTokens();

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
    <ModalShell
      isOpen={isOpen}
      onClose={status !== "processing" ? handleDismiss : undefined}
      maxWidth={status === "success" ? "max-w-md" : "max-w-sm"}
      backdropLocked={status === "processing"}
      ariaLabel={t("dashboard.voice_review_title")}
      className="p-6"
    >
      {/* ── STATE: PROCESSING ───────────────────────────────────── */}
      {status === "processing" && (
        <div className="flex flex-col items-center text-center space-y-4">
          <div className={cx("p-3.5 rounded-full", tokens.surface.sunken, tokens.icon.accent)}>
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
        </div>
      )}

      {/* ── STATE: ERROR ────────────────────────────────────────── */}
      {status === "error" && (
        <div>
          <div className="flex flex-col items-center text-center space-y-4">
            <div className={cx("p-3.5 rounded-full", tokens.budget.statusDanger, tokens.text.danger)}>
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
              className={cx("flex-1 cursor-pointer py-3 px-4 rounded-xl font-sans text-xs font-bold flex items-center justify-center gap-2 transition-all border", tokens.voicePreview.cancelBtn, tokens.text.secondary)}
            >
              <X size={14} />
              <span>{t("dashboard.voice_close")}</span>
            </button>
            <button
              onClick={() => {
                audioFeedback.playClick();
                onRetry();
              }}
              className={cx("flex-1 cursor-pointer py-3 px-4 text-white rounded-xl font-sans text-xs font-bold shadow-lg flex items-center justify-center gap-2 transition-all", tokens.voicePreview.confirmBtn)}
            >
              <RotateCcw size={14} />
              <span>{t("dashboard.voice_try_again")}</span>
            </button>
          </div>
        </div>
      )}

      {/* ── STATE: SUCCESS (review & edit) ─────────────────────── */}
      {status === "success" && draft && (
        <div>
          {/* Header */}
          <div className={cx("flex items-center justify-between border-b pb-4 mb-5", tokens.border.accent)}>
            <div className="flex items-center gap-3">
              <div className={cx("p-2.5 rounded-xl", tokens.surface.sunken, tokens.icon.accent)}>
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
              className={cx("p-2 opacity-60 hover:opacity-100 rounded-xl cursor-pointer transition-all", tokens.hover.surface)}
            >
              <X size={18} />
            </button>
          </div>

          {/* Transkrip asli dari suara pengguna */}
          <div className={cx("mb-4 p-3 rounded-xl border", tokens.surface.sunken, tokens.border.accent)}>
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
                className={cx(
                  "w-full rounded-lg px-2.5 py-2 font-bold text-emerald-400 focus:border-indigo-500 outline-none border",
                  tokens.surface.sunken,
                  tokens.border.accent
                )}
              />
              <p className="text-[clamp(0.5625rem,2.6vw,0.625rem)] opacity-50 font-mono tabular-nums">{formatIDR(amount)}</p>
            </div>
            <div className="space-y-1">
              <label className="text-[clamp(0.5625rem,2.6vw,0.625rem)] uppercase tracking-widest font-bold opacity-50 block">
                {t("transaction.category_label")}
              </label>
              <DropdownField
                value={category}
                onChange={setCategory}
                options={activeCategories.map((cat) => ({
                  value: cat.key,
                  label: locale === "id" ? (cat.label_id || cat.key) : (cat.label_en || cat.key),
                }))}
              />
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
              className={cx(
                "w-full rounded-lg px-2.5 py-2 focus:border-indigo-500 outline-none border",
                tokens.surface.sunken,
                tokens.border.accent
              )}
            />
          </div>

          {/* Konfirmasi apakah sudah sesuai atau belum */}
          <div className="flex gap-3">
            <button
              onClick={handleDismiss}
              className={cx(
                "flex-1 cursor-pointer py-3.5 px-4 rounded-xl font-sans text-xs font-bold flex items-center justify-center gap-2 transition-all border",
                tokens.voicePreview.cancelBtn,
                tokens.text.secondary
              )}
            >
              <X size={14} />
              <span>{t("dashboard.voice_not_correct")}</span>
            </button>
            <button
              onClick={handleConfirm}
              disabled={!canConfirm}
              className={cx(
                "flex-2 cursor-pointer py-3.5 px-6 text-white rounded-xl font-sans text-xs font-bold shadow-lg flex items-center justify-center gap-2 transition-all disabled:opacity-30 disabled:pointer-events-none",
                tokens.voicePreview.confirmBtn
              )}
            >
              <Check size={14} />
              <span>{t("dashboard.voice_confirm_correct")}</span>
            </button>
          </div>
        </div>
      )}
    </ModalShell>
  );
};
