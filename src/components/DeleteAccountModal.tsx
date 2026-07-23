import React, { useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { useLanguage } from "../contexts/LanguageContext";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { useThemeTokens } from "../hooks/useThemeTokens";
import { ModalShell } from "./ui/ModalShell";
import { reportFrontendError } from "../lib/errorReporter";

interface DeleteAccountModalProps {
  isOpen: boolean;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}

/**
 * Modal konfirmasi hapus akun. Karena aksinya PERMANEN & IRREVERSIBLE (dan
 * menyangkut data finansial sensitif), kita minta user mengetik ulang frasa
 * konfirmasi persis -- bukan cuma klik "Ya" -- supaya tidak terhapus tidak
 * sengaja. Ini pola yang lebih ketat dibanding <Modal> generik yang dipakai
 * untuk konfirmasi lain (hapus transaksi, dsb) yang masih reversibel-ish.
 */
export const DeleteAccountModal: React.FC<DeleteAccountModalProps> = ({ isOpen, onCancel, onConfirm }) => {
  const { tokens, cx } = useThemeTokens();
  const { t } = useLanguage();
  const [inputValue, setInputValue] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirmPhrase = t("settings.privacy_delete_confirm_phrase");
  const isMatch = inputValue.trim() === confirmPhrase;

  const handleConfirm = async () => {
    if (!isMatch || isDeleting) return;
    setIsDeleting(true);
    setError(null);
    try {
      await onConfirm();
    } catch (err: any) {
      setError(err?.message || "DELETE_FAILED");
      setIsDeleting(false);
      void reportFrontendError({
        source: "frontend:account-settings",
        message: err instanceof Error ? err.message : String(err),
        context: { action: "delete-account", stack: err instanceof Error ? err.stack?.slice(0, 1500) : null },
      });
    }
  };

  const handleClose = () => {
    if (isDeleting) return;
    setInputValue("");
    setError(null);
    onCancel();
  };

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={handleClose}
      maxWidth="max-w-md"
      backdropLocked={isDeleting}
      ariaLabel={t("settings.privacy_delete_title")}
      className="p-6"
    >
            <button
              onClick={handleClose}
              disabled={isDeleting}
              aria-label="Tutup"
              className="absolute top-4 right-4 text-slate-500 hover:text-slate-300 light_sakura:hover:text-slate-700 transition-colors cursor-pointer disabled:opacity-40"
            >
              <X size={18} />
            </button>

            <div className="mb-4 flex items-center gap-3">
              <div className={cx("rounded-full p-2.5", tokens.budgetProgressCard.badgeBgDanger, tokens.newTransaction.amountDisplayExpense)}>
                <AlertTriangle size={22} />
              </div>
              <h3 className={cx("font-sans text-lg font-semibold tracking-tight", tokens.text.heading)}>
                {t("settings.privacy_delete_title")}
              </h3>
            </div>

            <p className={cx("mb-3 font-sans text-sm leading-relaxed", tokens.text.secondary)}>
              {t("settings.privacy_delete_desc")}
            </p>

            <ul className={cx("mb-4 space-y-1.5 text-xs list-disc list-inside", tokens.text.muted)}>
              <li>{t("settings.privacy_delete_point_1")}</li>
              <li>{t("settings.privacy_delete_point_2")}</li>
              <li>{t("settings.privacy_delete_point_3")}</li>
            </ul>

            <label className={cx("block text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold uppercase tracking-wider mb-1.5", tokens.text.mutedAlt)}>
              {t("settings.privacy_delete_type_prompt")} <span className={cx(tokens.text.danger)}>{confirmPhrase}</span>
            </label>
            <Input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={confirmPhrase}
              disabled={isDeleting}
              accent="danger"
              className={cx(
                "border-red-500/30 placeholder:text-slate-600",
                tokens.surface.sunken,
                tokens.text.primary
              )}
            />

            {error && (
              <p className={cx("mt-2 text-xs", tokens.text.danger)}>{t("settings.privacy_delete_error")}</p>
            )}

            <div className="mt-5 flex gap-3">
              <Button
                variant="secondary"
                fullWidth
                onClick={handleClose}
                disabled={isDeleting}
                className="rounded-xl"
              >
                {t("common.cancel")}
              </Button>
              <Button
                variant="danger"
                fullWidth
                onClick={handleConfirm}
                disabled={!isMatch || isDeleting}
                isLoading={isDeleting}
                className="rounded-xl"
              >
                {isDeleting ? t("common.loading") : t("settings.privacy_delete_confirm_button")}
              </Button>
            </div>
        </ModalShell>
  );
};
