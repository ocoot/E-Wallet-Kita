import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Pencil, X } from "lucide-react";
import { Transaction } from "../types";
import { CATEGORIES } from "../lib/categoryDefinitions";
import { useLanguage } from "../contexts/LanguageContext";

interface HistoryEditModalProps {
  transaction: Transaction | null;
  onClose: () => void;
  onSave: (id: string, category: string, amount: number) => Promise<void>;
  isSaving: boolean;
}

export const HistoryEditModal: React.FC<HistoryEditModalProps> = ({
  transaction,
  onClose,
  onSave,
  isSaving,
}) => {
  const { t, locale } = useLanguage();
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState<number | "">("");

  useEffect(() => {
    if (transaction) {
      setCategory(transaction.category);
      setAmount(transaction.amount);
    }
  }, [transaction]);

  if (!transaction) return null;

  const categoryOptions = CATEGORIES.filter(c => c.type === transaction.type);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || Number(amount) <= 0) return;
    await onSave(transaction.id, category, Number(amount));
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
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
          className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-indigo-500/20 bg-slate-900 p-6 shadow-2xl text-white light_sakura:bg-rose-50/90 light_sakura:text-slate-800 light_sakura:border-rose-100"
        >
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-full p-2.5 bg-indigo-500/15 text-indigo-400 light_sakura:bg-indigo-50 light_sakura:text-indigo-600">
                <Pencil size={20} />
              </div>
              <h3 className="font-sans text-lg font-semibold tracking-tight">
                {t("transaction.edit_title")}
              </h3>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white cursor-pointer light_sakura:hover:bg-rose-100"
            >
              <X size={16} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1.5 light_sakura:text-slate-500">
                {t("transaction.label_category")}
              </label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl text-sm bg-slate-800 border border-slate-700 text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer light_sakura:bg-white light_sakura:border-rose-200 light_sakura:text-slate-700"
              >
                {categoryOptions.map(c => (
                  <option key={c.key} value={c.key}>
                    {locale === "id" ? c.id : c.en}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1.5 light_sakura:text-slate-500">
                {t("transaction.label_amount")}
              </label>
              <input
                type="number"
                min={1}
                value={amount}
                onChange={e => setAmount(e.target.value === "" ? "" : Number(e.target.value))}
                className="w-full px-3 py-2.5 rounded-xl text-sm bg-slate-800 border border-slate-700 text-slate-200 focus:outline-none focus:border-indigo-500 light_sakura:bg-white light_sakura:border-rose-200 light_sakura:text-slate-700"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl px-4 py-2 font-sans text-sm font-medium hover:bg-slate-800 hover:text-white cursor-pointer light_sakura:text-slate-600 light_sakura:hover:bg-rose-100"
              >
                {t("common.cancel")}
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="rounded-xl px-4.5 py-2 font-sans text-sm font-semibold text-white shadow-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer light_sakura:bg-rose-500 light_sakura:hover:bg-rose-400"
              >
                {t("common.save")}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
