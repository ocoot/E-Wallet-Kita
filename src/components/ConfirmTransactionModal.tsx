import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { CheckCircle2, X } from "lucide-react";
import { Category, WalletWithBalance, WalletType } from "../types";
import { useLanguage } from "../contexts/LanguageContext";
import { DropdownField } from "./DropdownField";
import { useLockBodyScroll } from "../hooks/useLockBodyScroll";
import { useDialogA11y } from "../hooks/useDialogA11y";
import { Button } from "./ui/Button";
import { useThemeTokens } from "../hooks/useThemeTokens";

const CATEGORY_EMOJI: Record<string, string> = {
  food_drink: "", transport: "", shopping: "", health: "",
  entertainment: "", education: "", bills: "", household: "",
  beauty: "", electronics: "", travel: "", sport: "",
  charity: "", other_expense: "", salary: "", freelance: "",
  investment: "", bonus: "", other_income: "",
};
const getCategoryEmoji = (key: string) => CATEGORY_EMOJI[key] ?? "";

const WALLET_TYPE_ICON: Record<WalletType, string> = {
  ewallet: "",
  bank: "",
  cash: "",
  general: "",
};

export interface ConfirmTransactionDraft {
  type: "income" | "expense";
  category: string;
  amount: number;
  date: string;
  note: string;
  walletId: string | null;
}

interface ConfirmTransactionModalProps {
  isOpen: boolean;
  draft: ConfirmTransactionDraft | null;
  categories: Category[];
  wallets: WalletWithBalance[];
  isSaving?: boolean;
  onChange: (draft: ConfirmTransactionDraft) => void;
  onConfirm: () => void;
  onCancel: () => void;
  // Insiden 15/7/2026: peringatan non-blocking kalau ada transaksi lain
  // dengan nominal+tanggal+catatan identik. `duplicateChecking` dipakai
  // untuk menampilkan status "memeriksa..." sekilas supaya tombol Simpan
  // tidak terasa nge-lag tanpa penjelasan. Kalau duplikat terdeteksi,
  // pengguna WAJIB centang `duplicateAcknowledged` dulu sebelum tombol
  // Simpan aktif -- ini sengaja bikin gesekan kecil supaya submit ulang
  // benar-benar disengaja, bukan diblokir total (transaksi mirip yang
  // memang sah tetap harus bisa disimpan).
  duplicateChecking?: boolean;
  duplicateWarning?: { createdAt: string } | null;
  duplicateAcknowledged?: boolean;
  onDuplicateAcknowledgedChange?: (checked: boolean) => void;
}

export const ConfirmTransactionModal: React.FC<ConfirmTransactionModalProps> = ({
  isOpen,
  draft,
  categories,
  wallets,
  isSaving,
  onChange,
  onConfirm,
  onCancel,
  duplicateChecking,
  duplicateWarning,
  duplicateAcknowledged,
  onDuplicateAcknowledgedChange,
}) => {
  const { t, locale } = useLanguage();
  const { tokens, cx } = useThemeTokens();

  useLockBodyScroll(isOpen && !!draft);
  const panelRef = React.useRef<HTMLDivElement>(null);
  useDialogA11y(isOpen && !!draft, panelRef, onCancel);

  if (!isOpen || !draft) return null;

  const isExpense = draft.type === "expense";
  const categoryOptions = categories.filter((c) => c.type === draft.type || c.type === "both");
  const activeWallets = wallets.filter((w) => !w.is_archived);
  const formatIDR = (n: number) => "Rp" + Math.round(n || 0).toLocaleString("id-ID");
  const confirmBlockedByDuplicate = !!duplicateWarning && !duplicateAcknowledged;

  const walletLabel = (w: WalletWithBalance) =>
    `${WALLET_TYPE_ICON[w.type]} ${w.name}${w.provider ? " · " + w.provider : ""}`;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onCancel}
          className="fixed inset-0 bg-black/60 backdrop-blur-xs"
        />

        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 15 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 15 }}
          transition={{ type: "spring", duration: 0.3 }}
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          tabIndex={-1}
          className="relative z-10 w-full max-w-md my-auto max-h-[85vh] overflow-y-auto overflow-x-hidden rounded-2xl border border-indigo-500/20 bg-slate-900 p-6 shadow-2xl outline-none text-white light_sakura:bg-rose-50/90 light_sakura:text-slate-800 light_sakura:border-rose-100"
        >
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`rounded-full p-2.5 ${isExpense ? "bg-red-500/15 text-red-400" : "bg-emerald-500/15 text-emerald-400"}`}>
                <CheckCircle2 size={20} />
              </div>
              <div>
                <h3 className="font-sans text-lg font-semibold tracking-tight">
                  {t("confirm.save_transaction_title")}
                </h3>
                <p className={cx("font-sans text-[11px]", tokens.text.muted)}>
                  {t("confirm.review_before_save")}
                </p>
              </div>
            </div>
            <button
              onClick={onCancel}
              aria-label="Tutup"
              className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white cursor-pointer light_sakura:hover:bg-rose-100"
            >
              <X size={16} />
            </button>
          </div>

          {/* Big amount preview */}
          <div className={`rounded-2xl border px-4 py-3 mb-4 text-center ${
            isExpense
              ? "bg-red-500/5 border-red-500/20 light_sakura:bg-red-50/40 light_sakura:border-red-200"
              : "bg-emerald-500/5 border-emerald-500/20 light_sakura:bg-emerald-50/40 light_sakura:border-emerald-200"
          }`}>
            <span className={`font-sans font-black text-2xl tabular-nums ${isExpense ? "text-red-400" : "text-emerald-400"}`}>
              {isExpense ? "−" : "+"}{formatIDR(draft.amount)}
            </span>
          </div>

          <div className="space-y-3">
            {/* Nominal (editable) */}
            <div>
              <label className={cx("text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold uppercase block mb-1.5", tokens.text.muted)}>
                {t("transaction.label_amount")}
              </label>
              <input
                type="number"
                min={1}
                value={draft.amount}
                onChange={(e) => onChange({ ...draft, amount: Number(e.target.value) || 0 })}
                className={tokens.form.inputLg}
              />
            </div>

            {/* Kategori (editable) */}
            <div>
              <label className={cx("text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold uppercase block mb-1.5", tokens.text.muted)}>
                {t("transaction.label_category")}
              </label>
              <DropdownField
                value={draft.category}
                onChange={(v) => onChange({ ...draft, category: v })}
                options={categoryOptions.map((c) => ({
                  value: c.key,
                  label: `${getCategoryEmoji(c.key)} ${locale === "id" ? c.label_id || c.key : c.label_en || c.key}`,
                }))}
              />
            </div>

            {/* Pos Dompet (editable) */}
            <div>
              <label className={cx("text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold uppercase block mb-1.5", tokens.text.muted)}>
                {t("wallet.label_pos")}
              </label>
              <DropdownField
                value={draft.walletId ?? ""}
                onChange={(v) => onChange({ ...draft, walletId: v || null })}
                options={activeWallets.map((w) => ({
                  value: w.id,
                  label: `${walletLabel(w)} (${formatIDR(w.balance)})`
                }))}
              />
            </div>

            {/* Tanggal (editable) */}
            <div>
              <label className={cx("text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold uppercase block mb-1.5", tokens.text.muted)}>
                {t("transaction.label_date")}
              </label>
              <input
                type="date"
                value={draft.date}
                max={new Date().toISOString().split("T")[0]}
                onChange={(e) => onChange({ ...draft, date: e.target.value })}
                className={tokens.form.inputLg}
              />
            </div>
          </div>

          {duplicateChecking && (
            <div className="rounded-xl border border-slate-700 bg-slate-800/50 px-3 py-2 mb-3 text-[11px] text-slate-400 flex items-center gap-2">
              <span className="w-3 h-3 rounded-full border-2 border-slate-500 border-t-transparent animate-spin shrink-0" />
              {t("confirm.duplicate_checking")}
            </div>
          )}

          {duplicateWarning && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 mb-3 space-y-2">
              <p className="text-[11px] text-amber-400 leading-relaxed">
                {t("confirm.duplicate_warning_desc", {
                  time: new Date(duplicateWarning.createdAt).toLocaleString(locale === "id" ? "id-ID" : "en-US"),
                })}
              </p>
              <label className="flex items-start gap-2 text-[11px] text-amber-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!duplicateAcknowledged}
                  onChange={(e) => onDuplicateAcknowledgedChange?.(e.target.checked)}
                  className="mt-0.5 w-3.5 h-3.5 rounded accent-amber-500 cursor-pointer"
                />
                {t("confirm.duplicate_checkbox_label")}
              </label>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-5">
            <Button
              type="button"
              variant="ghost"
              onClick={onCancel}
              disabled={isSaving}
              className="rounded-xl"
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              variant={isExpense ? "danger" : "success"}
              onClick={onConfirm}
              disabled={isSaving || !draft.amount || draft.amount <= 0 || confirmBlockedByDuplicate}
              isLoading={isSaving}
              className="rounded-xl"
            >
              {t("common.confirm")}
            </Button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
