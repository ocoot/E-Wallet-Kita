import React from "react";
import { useLanguage } from "../contexts/LanguageContext";
import { Transaction, Category } from "../types";
import { AlertTriangle } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { audioFeedback } from "../lib/audio";
import { Modal } from "./Modal";
import { useLockBodyScroll } from "../hooks/useLockBodyScroll";

interface HistoryDeleteModalProps {
  deleteTargetId: string | null;
  setDeleteTargetId: (id: string | null) => void;
  transactions: Transaction[];
  categories: Category[];
  formatIDR: (num: number) => string;
  onConfirmSingleDelete: () => void;
  
  isDeleteAllOpen: boolean;
  setIsDeleteAllOpen: (open: boolean) => void;
  deleteAllConfirmText: string;
  setDeleteAllConfirmText: (text: string) => void;
  onConfirmDeleteAll: () => void;
}

export const HistoryDeleteModal: React.FC<HistoryDeleteModalProps> = ({
  deleteTargetId,
  setDeleteTargetId,
  transactions,
  categories,
  formatIDR,
  onConfirmSingleDelete,
  
  isDeleteAllOpen,
  setIsDeleteAllOpen,
  deleteAllConfirmText,
  setDeleteAllConfirmText,
  onConfirmDeleteAll,
}) => {
  const { t, locale } = useLanguage();

  const targetTransaction = transactions.find(t => t.id === deleteTargetId);

  const resolveCategoryLabel = (key: string) => {
    const cat = categories.find(c => c.key === key);
    if (!cat) return key;
    return locale === "id" ? (cat.label_id || key) : (cat.label_en || key);
  };

  useLockBodyScroll(deleteTargetId !== null || isDeleteAllOpen);

  return (
    <>
      {/* Confirmation Modal - Single Item */}
      <Modal
        isOpen={deleteTargetId !== null}
        title={t("confirm.delete_item_title")}
        description={t("confirm.delete_item_desc", {
          amount: targetTransaction ? formatIDR(targetTransaction.amount) : "",
          note: targetTransaction ? (targetTransaction.note || resolveCategoryLabel(targetTransaction.category)) : ""
        })}
        type="danger"
        confirmLabel={t("confirm.delete_item_confirm")}
        cancelLabel={t("common.cancel")}
        onConfirm={onConfirmSingleDelete}
        onCancel={() => {
          audioFeedback.playClick();
          setDeleteTargetId(null);
        }}
      />

      {/* Confirmation Modal - Destruction Safety "HAPUS" verification */}
      <AnimatePresence>
        {isDeleteAllOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                audioFeedback.playClick();
                setIsDeleteAllOpen(false);
              }}
              className="fixed inset-0 bg-black/70 backdrop-blur-xs"
            />
            
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative z-10 w-full max-w-md my-auto max-h-[85vh] overflow-y-auto overflow-x-hidden p-6 rounded-2xl bg-slate-900 text-white border border-red-500/30 light_sakura:bg-white light_sakura:text-slate-800 light_sakura:border-red-200"
            >
              <div className="flex items-center gap-2.5 text-red-100 mb-3 light_sakura:text-red-600">
                <AlertTriangle size={24} />
                <h3 className="font-sans font-bold text-lg">{t("confirm.delete_all_title")}</h3>
              </div>
              
              <p className="font-sans text-xs text-slate-300 leading-relaxed mb-4 block light_sakura:text-slate-600">
                {t("confirm.delete_all_desc")}
              </p>

              {/* Strict Keyword input verify */}
              <input
                type="text"
                placeholder={t("confirm.delete_all_placeholder")}
                value={deleteAllConfirmText}
                onChange={(e) => setDeleteAllConfirmText(e.target.value)}
                className="w-full px-4 py-2 bg-slate-950 border border-slate-800 text-white rounded-xl font-sans text-xs outline-none focus:border-red-500 uppercase font-mono tracking-wider mb-6 light_sakura:bg-slate-100 light_sakura:border-rose-100 light_sakura:text-slate-800"
              />

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => {
                    audioFeedback.playClick();
                    setIsDeleteAllOpen(false);
                  }}
                  className="cursor-pointer text-xs font-semibold hover:bg-slate-800 px-4 py-2 rounded-xl text-slate-400 light_sakura:hover:bg-slate-100"
                >
                  {t("common.cancel")}
                </button>
                <button
                  onClick={onConfirmDeleteAll}
                  disabled={deleteAllConfirmText.toUpperCase() !== "HAPUS"}
                  className="cursor-pointer bg-red-600 hover:bg-red-500 disabled:opacity-30 disabled:pointer-events-none px-4.5 py-2.5 text-xs font-bold text-white shadow-lg shadow-red-600/10 rounded-xl"
                >
                  {t("history.btn_delete_all")}
                </button>
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};
