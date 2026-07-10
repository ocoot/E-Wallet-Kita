import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { FileText, X } from "lucide-react";
import { useLanguage } from "../contexts/LanguageContext";
import { useWallets } from "../hooks/useWallets";
import { DropdownField } from "./DropdownField";
import { useLockBodyScroll } from "../hooks/useLockBodyScroll";

interface ExportSummaryModalProps {
  isOpen: boolean;
  periodLabel: { start: string; end: string };
  onCancel: () => void;
  onGenerate: (walletId: string | null) => void;
  isGenerating?: boolean;
}

export const ExportSummaryModal: React.FC<ExportSummaryModalProps> = ({
  isOpen,
  periodLabel,
  onCancel,
  onGenerate,
  isGenerating = false,
}) => {
  const { t } = useLanguage();
  const { activeWallets } = useWallets();
  const [walletId, setWalletId] = useState<string>("");

  React.useEffect(() => {
    if (isOpen) setWalletId("");
  }, [isOpen]);

  useLockBodyScroll(isOpen);

  return (
    <AnimatePresence>
      {isOpen && (
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
            className="relative z-10 w-full max-w-md my-auto max-h-[85vh] overflow-y-auto overflow-x-hidden rounded-2xl border p-6 shadow-2xl bg-slate-900 border-indigo-500/20 text-white light_sakura:bg-white light_sakura:text-slate-800 light_sakura:border-rose-100"
          >
            <button
              onClick={onCancel}
              className="absolute top-4 right-4 text-slate-400 hover:text-white light_sakura:hover:text-slate-900 cursor-pointer"
            >
              <X size={18} />
            </button>

            <div className="mb-4 flex items-center gap-3">
              <div className="rounded-full p-2.5 bg-indigo-500/15 text-indigo-400 light_sakura:bg-indigo-50 light_sakura:text-indigo-600">
                <FileText size={20} />
              </div>
              <h3 className="font-sans text-lg font-semibold tracking-tight">
                {t("export.summary_confirm_title")}
              </h3>
            </div>

            <p className="mb-5 font-sans text-sm opacity-80 leading-relaxed">
              {t("export.summary_confirm_desc", { start: periodLabel.start, end: periodLabel.end })}
            </p>

            <div className="space-y-1.5 mb-5">
              <label className="font-sans text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold text-slate-400 uppercase tracking-wider block light_sakura:text-slate-500">
                {t("wallet.label_pos")}
              </label>
              <DropdownField
                value={walletId}
                onChange={setWalletId}
                options={[
                  { value: "", label: t("export.wallet_filter_all") },
                  ...activeWallets.map((w) => {
                    const icon = w.type === "general" ? "💰" : w.type === "ewallet" ? "📱" : w.type === "bank" ? "🏦" : "💵";
                    return { value: w.id, label: `${icon} ${w.name}${w.provider ? ` · ${w.provider}` : ""}` };
                  })
                ]}
              />
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onCancel}
                disabled={isGenerating}
                className="cursor-pointer rounded-xl px-4 py-2 font-sans text-sm font-medium hover:bg-slate-800 hover:text-white light_sakura:text-slate-600 light_sakura:hover:bg-rose-100 disabled:opacity-50"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                disabled={isGenerating}
                onClick={() => onGenerate(walletId || null)}
                className={`cursor-pointer rounded-xl px-4.5 py-2 font-sans text-sm font-semibold tracking-tight text-white shadow-lg transition-all duration-200
                  bg-indigo-600 hover:bg-indigo-500 hover:shadow-indigo-500/20 light_sakura:bg-rose-500 light_sakura:hover:bg-rose-400
                  ${isGenerating ? "opacity-40 cursor-not-allowed" : ""}`}
              >
                {t("export.confirm_export")}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
