import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { AlertTriangle, X } from "lucide-react";
import { useLanguage } from "../contexts/LanguageContext";
import { useLockBodyScroll } from "../hooks/useLockBodyScroll";

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
    }
  };

  const handleClose = () => {
    if (isDeleting) return;
    setInputValue("");
    setError(null);
    onCancel();
  };

  useLockBodyScroll(isOpen);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm"
          />
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 15 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 15 }}
            transition={{ type: "spring", duration: 0.3 }}
            className="relative z-10 w-full max-w-md my-auto max-h-[85vh] overflow-y-auto overflow-x-hidden rounded-2xl border border-red-500/30 bg-slate-900 p-6 shadow-2xl light_sakura:bg-white light_sakura:border-red-200"
          >
            <button
              onClick={handleClose}
              disabled={isDeleting}
              className="absolute top-4 right-4 text-slate-500 hover:text-slate-300 transition-colors cursor-pointer disabled:opacity-40"
            >
              <X size={18} />
            </button>

            <div className="mb-4 flex items-center gap-3">
              <div className="rounded-full p-2.5 bg-red-500/15 text-red-400 light_sakura:bg-red-50 light_sakura:text-red-500">
                <AlertTriangle size={22} />
              </div>
              <h3 className="font-sans text-lg font-semibold tracking-tight text-white light_sakura:text-slate-800">
                {t("settings.privacy_delete_title")}
              </h3>
            </div>

            <p className="mb-3 font-sans text-sm text-slate-300 light_sakura:text-slate-600 leading-relaxed">
              {t("settings.privacy_delete_desc")}
            </p>

            <ul className="mb-4 space-y-1.5 text-xs text-slate-400 light_sakura:text-slate-500 list-disc list-inside">
              <li>{t("settings.privacy_delete_point_1")}</li>
              <li>{t("settings.privacy_delete_point_2")}</li>
              <li>{t("settings.privacy_delete_point_3")}</li>
            </ul>

            <label className="block text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold text-slate-400 light_sakura:text-slate-500 uppercase tracking-wider mb-1.5">
              {t("settings.privacy_delete_type_prompt")} <span className="text-red-400">{confirmPhrase}</span>
            </label>
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={confirmPhrase}
              disabled={isDeleting}
              className="w-full bg-slate-950 border border-red-500/30 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-red-500 placeholder:text-slate-600 light_sakura:bg-slate-50 light_sakura:text-slate-800 disabled:opacity-50"
            />

            {error && (
              <p className="mt-2 text-xs text-red-400">{t("settings.privacy_delete_error")}</p>
            )}

            <div className="mt-5 flex gap-3">
              <button
                onClick={handleClose}
                disabled={isDeleting}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 light_sakura:bg-slate-100 text-slate-300 light_sakura:text-slate-600 font-semibold text-sm hover:bg-slate-700 transition-colors cursor-pointer disabled:opacity-50"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={handleConfirm}
                disabled={!isMatch || isDeleting}
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-semibold text-sm transition-colors shadow-lg shadow-red-600/20 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                {isDeleting ? t("common.loading") : t("settings.privacy_delete_confirm_button")}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
