import React from "react";
import { useLanguage } from "../contexts/LanguageContext";
import { Transaction, Category } from "../types";
import { AlertTriangle } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { audioFeedback } from "../lib/audio";
import { Modal } from "./Modal";
import { useLockBodyScroll } from "../hooks/useLockBodyScroll";
import { useDialogA11y } from "../hooks/useDialogA11y";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { useThemeTokens } from "../hooks/useThemeTokens";

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
  const { tokens, cx } = useThemeTokens();
  const { t, locale } = useLanguage();

  const targetTransaction = transactions.find(t => t.id === deleteTargetId);

  const resolveCategoryLabel = (key: string) => {
    const cat = categories.find(c => c.key === key);
    if (!cat) return key;
    return locale === "id" ? (cat.label_id || key) : (cat.label_en || key);
  };

  useLockBodyScroll(deleteTargetId !== null || isDeleteAllOpen);
  const deleteAllPanelRef = React.useRef<HTMLDivElement>(null);
  useDialogA11y(isDeleteAllOpen, deleteAllPanelRef, () => setIsDeleteAllOpen(false));

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
              ref={deleteAllPanelRef}
              role="dialog"
              aria-modal="true"
              tabIndex={-1}
              className={cx("relative z-10 w-full max-w-md my-auto max-h-[85vh] overflow-y-auto overflow-x-hidden outline-none p-6 rounded-2xl border", tokens.surface.card, tokens.text.onSurface, "border-red-500/30 light_sakura:border-red-200")}
            >
              <div className={cx("flex items-center gap-2.5 mb-3", tokens.text.danger)}>
                <AlertTriangle size={24} />
                <h3 className="font-sans font-bold text-lg">{t("confirm.delete_all_title")}</h3>
              </div>
              
              <p className={cx("font-sans text-xs leading-relaxed mb-4 block", tokens.text.secondary)}>
                {t("confirm.delete_all_desc")}
              </p>

              {/* Strict Keyword input verify */}
              <Input
                type="text"
                placeholder={t("confirm.delete_all_placeholder")}
                value={deleteAllConfirmText}
                onChange={(e) => setDeleteAllConfirmText(e.target.value)}
                accent="danger"
                className={cx("text-xs uppercase font-mono tracking-wider mb-6", tokens.surface.sunken, tokens.border.accent, tokens.text.onSurface)}
              />

              <div className="flex justify-end gap-3">
                <Button
                  variant="ghost"
                  onClick={() => {
                    audioFeedback.playClick();
                    setIsDeleteAllOpen(false);
                  }}
                  className="rounded-xl text-xs"
                >
                  {t("common.cancel")}
                </Button>
                <Button
                  variant="danger"
                  onClick={onConfirmDeleteAll}
                  disabled={deleteAllConfirmText.toUpperCase() !== "HAPUS"}
                  className="rounded-xl text-xs"
                >
                  {t("history.btn_delete_all")}
                </Button>
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};
