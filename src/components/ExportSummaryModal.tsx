import React, { useState } from "react";
import { FileText, X } from "lucide-react";
import { useLanguage } from "../contexts/LanguageContext";
import { useWallets } from "../hooks/useWallets";
import { DropdownField } from "./DropdownField";
import { ModalShell } from "./ModalShell";

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

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onCancel}
      ariaLabelledBy="export-summary-title"
      ariaDescribedBy="export-summary-desc"
      className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border p-6 shadow-2xl bg-slate-900 border-indigo-500/20 text-white light_sakura:bg-white light_sakura:text-slate-800 light_sakura:border-rose-100"
    >
      <button
        onClick={onCancel}
        aria-label={t("common.close") || "Close"}
        className="absolute top-4 right-4 text-slate-400 hover:text-white light_sakura:hover:text-slate-900 cursor-pointer"
      >
        <X size={18} />
      </button>

      <div className="mb-4 flex items-center gap-3">
        <div className="rounded-full p-2.5 bg-indigo-500/15 text-indigo-400 light_sakura:bg-indigo-50 light_sakura:text-indigo-600">
          <FileText size={20} />
        </div>
        <h3 id="export-summary-title" className="font-sans text-lg font-semibold tracking-tight">
          {t("export.summary_confirm_title")}
        </h3>
      </div>

      <p id="export-summary-desc" className="mb-5 font-sans text-sm opacity-80 leading-relaxed">
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
          className="cursor-pointer rounded-xl px-4 py-2 font-sans text-sm font-medium hover:bg-slate-800 hover:text-white light_sakura:text-slate-600 light_sakura:hover:bg-rose-100 disabled:opacity-50 min-h-[44px]"
        >
          {t("common.cancel")}
        </button>
        <button
          type="button"
          disabled={isGenerating}
          onClick={() => onGenerate(walletId || null)}
          className={`cursor-pointer rounded-xl px-4.5 py-2 font-sans text-sm font-semibold tracking-tight text-white shadow-lg transition-all duration-200 min-h-[44px]
            bg-indigo-600 hover:bg-indigo-500 hover:shadow-indigo-500/20 light_sakura:bg-rose-500 light_sakura:hover:bg-rose-400
            ${isGenerating ? "opacity-40 cursor-not-allowed" : ""}`}
        >
          {t("export.confirm_export")}
        </button>
      </div>
    </ModalShell>
  );
};
