import React, { useState, useEffect } from "react";
import { Pencil, X } from "lucide-react";
import { Transaction, WalletWithBalance } from "../types";
import { useLanguage } from "../contexts/LanguageContext";
import { useCategories } from "../hooks/useCategories";
import { useWallets } from "../hooks/useWallets";
import { DropdownField } from "./DropdownField";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { CurrencyInput } from "./ui/CurrencyInput";
import { useThemeTokens } from "../hooks/useThemeTokens";
import { ModalShell } from "./ui/ModalShell";
import { audioFeedback } from "../lib/audio";

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
    audioFeedback.playClick();
    try {
      await onSave(transaction.id, category, Number(amount), transactionDate, walletId);
      audioFeedback.playChime();
    } catch (err) {
      audioFeedback.playAlert();
      throw err;
    }
  };

  return (
    <ModalShell
      isOpen={!!transaction}
      onClose={onClose}
      maxWidth="max-w-md"
      ariaLabel={t("transaction.edit_title")}
      className="p-6"
    >
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={cx("rounded-full p-2.5", tokens.budgetProgressCard.badgeBgSafe, tokens.text.accentStrong)}>
                <Pencil size={20} />
              </div>
              <h3 className="font-sans text-lg font-semibold tracking-tight">
                {t("transaction.edit_title")}
              </h3>
            </div>
            <button
              onClick={() => { audioFeedback.playClick(); onClose(); }}
              aria-label="Tutup"
              className={cx("p-1.5 rounded-lg", tokens.modal.closeBtn)}
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
              <Input
                size="compact"
                type="date"
                value={transactionDate}
                onChange={e => setTransactionDate(e.target.value)}
                max={new Date().toISOString().split("T")[0]}
                className="py-2.5"
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
                  label: `${WALLET_TYPE_ICON[w.type]} ${w.name}${(w.provider && w.provider !== w.name) ? ` · ${w.provider}` : ""}`
                }))}
              />
            </div>

            <div>
              <label className={cx("text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold uppercase block mb-1.5", tokens.text.muted)}>
                {t("transaction.label_amount")}
              </label>
              <CurrencyInput
                size="compact"
                value={amount === "" ? "" : String(amount)}
                onValueChange={(digits) => setAmount(digits === "" ? "" : Number(digits))}
                className="py-2.5"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => { audioFeedback.playClick(); onClose(); }}
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
        </ModalShell>
  );
};
