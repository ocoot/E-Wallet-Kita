import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { CheckCircle2, X } from "lucide-react";
import { Category, WalletWithBalance, WalletType } from "../types";
import { useLanguage } from "../contexts/LanguageContext";
import { DropdownField } from "./DropdownField";
import { useLockBodyScroll } from "../hooks/useLockBodyScroll";
import { useDialogA11y } from "../hooks/useDialogA11y";

const CATEGORY_EMOJI: Record<string, string> = {
  food_drink: "🍜", transport: "🚗", shopping: "🛒", health: "💊",
  entertainment: "🎮", education: "📚", bills: "🧾", household: "🏠",
  beauty: "💄", electronics: "📱", travel: "✈️", sport: "🏋️",
  charity: "🤝", other_expense: "📦", salary: "💼", freelance: "💻",
  investment: "📈", bonus: "🎁", other_income: "💰",
};
const getCategoryEmoji = (key: string) => CATEGORY_EMOJI[key] ?? "💰";

const WALLET_TYPE_ICON: Record<WalletType, string> = {
  ewallet: "📱",
  bank: "🏦",
  cash: "💵",
  general: "💰",
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
}) => {
  const { t, locale } = useLanguage();

  useLockBodyScroll(isOpen && !!draft);
  const panelRef = React.useRef<HTMLDivElement>(null);
  useDialogA11y(isOpen && !!draft, panelRef, onCancel);

  if (!isOpen || !draft) return null;

  const isExpense = draft.type === "expense";
  const categoryOptions = categories.filter((c) => c.type === draft.type || c.type === "both");
  const activeWallets = wallets.filter((w) => !w.is_archived);
  const formatIDR = (n: number) => "Rp" + Math.round(n || 0).toLocaleString("id-ID");

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
                <p className="font-sans text-[11px] text-slate-400 light_sakura:text-slate-500">
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
              <label className="text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold text-slate-400 uppercase block mb-1.5 light_sakura:text-slate-500">
                {t("transaction.label_amount")}
              </label>
              <input
                type="number"
                min={1}
                value={draft.amount}
                onChange={(e) => onChange({ ...draft, amount: Number(e.target.value) || 0 })}
                className="w-full px-3 py-2.5 rounded-xl text-sm bg-slate-800 border border-slate-700 text-slate-200 focus:outline-none focus:border-indigo-500 light_sakura:bg-white light_sakura:border-rose-200 light_sakura:text-slate-700"
              />
            </div>

            {/* Kategori (editable) */}
            <div>
              <label className="text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold text-slate-400 uppercase block mb-1.5 light_sakura:text-slate-500">
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
              <label className="text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold text-slate-400 uppercase block mb-1.5 light_sakura:text-slate-500">
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
              <label className="text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold text-slate-400 uppercase block mb-1.5 light_sakura:text-slate-500">
                {t("transaction.label_date")}
              </label>
              <input
                type="date"
                value={draft.date}
                max={new Date().toISOString().split("T")[0]}
                onChange={(e) => onChange({ ...draft, date: e.target.value })}
                className="w-full px-3 py-2.5 rounded-xl text-sm bg-slate-800 border border-slate-700 text-slate-200 focus:outline-none focus:border-indigo-500 light_sakura:bg-white light_sakura:border-rose-200 light_sakura:text-slate-700"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-5">
            <button
              type="button"
              onClick={onCancel}
              disabled={isSaving}
              className="rounded-xl px-4 py-2 font-sans text-sm font-medium hover:bg-slate-800 hover:text-white cursor-pointer disabled:opacity-50 light_sakura:text-slate-600 light_sakura:hover:bg-rose-100"
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={isSaving || !draft.amount || draft.amount <= 0}
              className={`rounded-xl px-4.5 py-2 font-sans text-sm font-semibold text-white shadow-lg cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                isExpense ? "bg-red-600 hover:bg-red-500" : "bg-emerald-600 hover:bg-emerald-500"
              }`}
            >
              {t("common.confirm")}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
