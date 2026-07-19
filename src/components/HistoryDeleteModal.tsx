import React from "react";
import { useLanguage } from "../contexts/LanguageContext";
import { Transaction, Category } from "../types";
import { AlertTriangle } from "lucide-react";
import { audioFeedback } from "../lib/audio";
import { Modal } from "./Modal";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { useThemeTokens } from "../hooks/useThemeTokens";
import { ModalShell } from "./ui/ModalShell";

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
      <ModalShell
        isOpen={isDeleteAllOpen}
        onClose={() => { audioFeedback.playClick(); setIsDeleteAllOpen(false); }}
        maxWidth="max-w-md"
        ariaLabel={t("confirm.delete_all_title")}
        className="p-6"
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

        </ModalShell>
    </>
  );
};
