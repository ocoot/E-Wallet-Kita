import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Pencil, X } from "lucide-react";
import { Transaction, WalletWithBalance } from "../types";
import { useLanguage } from "../contexts/LanguageContext";
import { useCategories } from "../hooks/useCategories";
import { useWallets } from "../hooks/useWallets";
import { DropdownField } from "./DropdownField";
import { useLockBodyScroll } from "../hooks/useLockBodyScroll";
import { Button } from "./ui/Button";
import { useDialogA11y } from "../hooks/useDialogA11y";
import { useThemeTokens } from "../hooks/useThemeTokens";

interface HistoryEditModalProps {
  transaction: Transaction | null;
  onClose: () => void;
  onSave: (id: string, category: string, amount: number, transactionDate: string, walletId: string | null) => Promise<void>;
  isSaving: boolean;
}

const WALLET_TYPE_ICON: Record<string, string> = { ewallet: "", bank: "", cash: "", general: "" };

export const HistoryEditModal: React.FC<HistoryEditModalProps> = ({
  transaction,
  onClose,
  onSave,
  isSaving,
}) => {
  const { tokens, cx } = useThemeTokens();
  const { t, locale } = useLanguage();
  const { categories } = useCategories();
  const { activeWallets } = useWallets();
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState<number | "">("");
  const [transactionDate, setTransactionDate] = useState("");
  const [walletId, setWalletId] = useState<string | null>(null);

  useLockBodyScroll(!!transaction);
  const panelRef = React.useRef<HTMLDivElement>(null);
  useDialogA11y(!!transaction, panelRef, onClose);

  useEffect(() => {
    if (transaction) {
      setCategory(transaction.category);
      setAmount(transaction.amount);
      setTransactionDate(transaction.transaction_date);
      setWalletId(transaction.wallet_id);
    }
  }, [transaction]);

  if (!transaction) return null;

  const categoryOptions = categories.filter(c => c.type === transaction.type || c.type === "both");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || Number(amount) <= 0) return;
    if (!transactionDate) return;
    await onSave(transaction.id, category, Number(amount), transactionDate, walletId);
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
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
          className={cx("relative z-10 w-full max-w-md my-auto max-h-[85vh] overflow-y-auto overflow-x-hidden rounded-2xl border border-indigo-500/20 bg-slate-900 p-6 shadow-2xl outline-none light_sakura:bg-rose-50/90 light_sakura:border-rose-100", tokens.text.onSurface)}
        >
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={cx("rounded-full p-2.5 bg-indigo-500/15 light_sakura:bg-indigo-50", tokens.text.accentStrong)}>
                <Pencil size={20} />
              </div>
              <h3 className="font-sans text-lg font-semibold tracking-tight">
                {t("transaction.edit_title")}
              </h3>
            </div>
            <button
              onClick={onClose}
              aria-label="Tutup"
              className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white cursor-pointer light_sakura:hover:bg-rose-100"
            >
              <X size={16} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className={cx("text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold uppercase block mb-1.5", tokens.text.muted)}>
                {t("transaction.label_category")}
              </label>
              <DropdownField
                value={category}
                onChange={setCategory}
                options={categoryOptions.map(c => ({
                  value: c.key,
                  label: locale === "id" ? (c.label_id || c.key) : (c.label_en || c.key),
                }))}
              />
            </div>

            <div>
              <label className={cx("text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold uppercase block mb-1.5", tokens.text.muted)}>
                {t("transaction.label_date")}
              </label>
              <input
                type="date"
                value={transactionDate}
                onChange={e => setTransactionDate(e.target.value)}
                max={new Date().toISOString().split("T")[0]}
                className={tokens.form.inputLg}
              />
            </div>

            <div>
              <label className={cx("text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold uppercase block mb-1.5", tokens.text.muted)}>
                {t("wallet.label_pos")}
              </label>
              <DropdownField
                value={walletId ?? ""}
                onChange={(v) => setWalletId(v || null)}
                options={activeWallets.map((w) => ({
                  value: w.id,
                  label: `${WALLET_TYPE_ICON[w.type]} ${w.name}${w.provider ? ` · ${w.provider}` : ""}`
                }))}
              />
            </div>

            <div>
              <label className={cx("text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold uppercase block mb-1.5", tokens.text.muted)}>
                {t("transaction.label_amount")}
              </label>
              <input
                type="number"
                min={1}
                value={amount}
                onChange={e => setAmount(e.target.value === "" ? "" : Number(e.target.value))}
                className={tokens.form.inputLg}
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={onClose}
                className="rounded-xl"
              >
                {t("common.cancel")}
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={isSaving}
                isLoading={isSaving}
                className="rounded-xl"
              >
                {t("common.save")}
              </Button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
