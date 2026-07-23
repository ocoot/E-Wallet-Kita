import React, { useState } from "react";
import { FileText, X } from "lucide-react";
import { useLanguage } from "../contexts/LanguageContext";
import { useWallets } from "../hooks/useWallets";
import { DropdownField } from "./DropdownField";
import { Button } from "./ui/Button";
import { useThemeTokens } from "../hooks/useThemeTokens";
import { ModalShell } from "./ui/ModalShell";
import { audioFeedback } from "../lib/audio";

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
  const { tokens, cx } = useThemeTokens();
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
      maxWidth="max-w-md"
      ariaLabel={t("export.summary_confirm_title")}
      className="p-6"
    >
            <button
              onClick={() => { audioFeedback.playClick(); onCancel(); }}
              aria-label="Tutup"
              className={cx("absolute top-4 right-4 cursor-pointer", tokens.text.faint, tokens.hover.textInverse)}
            >
              <X size={18} />
            </button>

            <div className="mb-4 flex items-center gap-3">
              <div className={cx("rounded-full p-2.5", tokens.budgetProgressCard.badgeBgSafe, tokens.text.accentStrong)}>
                <FileText size={20} />
              </div>
              <h3 className="font-sans text-lg font-semibold tracking-tight">
                {t("export.summary_confirm_title")}
              </h3>
            </div>

            <p className={cx("mb-5 font-sans text-sm leading-relaxed", tokens.text.secondary)}>
              {t("export.summary_confirm_desc", { start: periodLabel.start, end: periodLabel.end })}
            </p>

            <div className="space-y-1.5 mb-5">
              <label className={cx("font-sans text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold uppercase tracking-wider block", tokens.text.muted)}>
                {t("wallet.label_pos")}
              </label>
              <DropdownField
                value={walletId}
                onChange={setWalletId}
                options={[
                  { value: "", label: t("export.wallet_filter_all") },
                  ...activeWallets.map((w) => {
                    const icon = w.type === "general" ? "" : w.type === "ewallet" ? "" : w.type === "bank" ? "" : "";
                    return { value: w.id, label: `${icon} ${w.name}${(w.provider && w.provider !== w.name) ? ` · ${w.provider}` : ""}` };
                  })
                ]}
              />
            </div>

            <div className="flex items-center justify-end gap-3">
              <Button
                type="button"
                variant="ghost"
                onClick={() => { audioFeedback.playClick(); onCancel(); }}
                disabled={isGenerating}
                className="rounded-xl"
              >
                {t("common.cancel")}
              </Button>
              <Button
                type="button"
                variant="primary"
                disabled={isGenerating}
                isLoading={isGenerating}
                onClick={() => { audioFeedback.playClick(); onGenerate(walletId || null); }}
                className="rounded-xl"
              >
                {t("export.confirm_export")}
              </Button>
            </div>
        </ModalShell>
  );
};
