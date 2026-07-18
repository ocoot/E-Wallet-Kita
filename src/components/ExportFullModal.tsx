import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { FileText, X } from "lucide-react";
import { useLanguage } from "../contexts/LanguageContext";
import { isRangeValid, diffMonthsInclusive, MAX_RANGE_MONTHS } from "../lib/pdf/dateRange";
import { useWallets } from "../hooks/useWallets";
import { DropdownField } from "./DropdownField";
import { useLockBodyScroll } from "../hooks/useLockBodyScroll";
import { useDialogA11y } from "../hooks/useDialogA11y";
import { Button } from "./ui/Button";
import { useThemeTokens } from "../hooks/useThemeTokens";

interface ExportFullModalProps {
  isOpen: boolean;
  monthOptions: { value: string; label: string }[];
  onCancel: () => void;
  onGenerate: (fromMonth: string, toMonth: string, walletId: string | null) => void;
  isGenerating?: boolean;
}

export const ExportFullModal: React.FC<ExportFullModalProps> = ({
  isOpen,
  monthOptions,
  onCancel,
  onGenerate,
  isGenerating = false,
}) => {
  const { tokens, cx } = useThemeTokens();
  const { t } = useLanguage();
  const { activeWallets } = useWallets();

  const defaultMonth = monthOptions[0]?.value || "";
  const [fromMonth, setFromMonth] = useState(defaultMonth);
  const [toMonth, setToMonth] = useState(defaultMonth);
  const [walletId, setWalletId] = useState<string>("");

  React.useEffect(() => {
    if (isOpen) {
      setFromMonth(defaultMonth);
      setToMonth(defaultMonth);
      setWalletId("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const valid = isRangeValid(fromMonth, toMonth);
  const monthsSelected = fromMonth && toMonth ? diffMonthsInclusive(fromMonth, toMonth) : 0;

  useLockBodyScroll(isOpen);
  const panelRef = React.useRef<HTMLDivElement>(null);
  useDialogA11y(isOpen, panelRef, onCancel);

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
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            tabIndex={-1}
            className={cx("relative z-10 w-full max-w-md my-auto max-h-[85vh] overflow-y-auto overflow-x-hidden rounded-2xl border p-6 shadow-2xl outline-none", tokens.surface.card, tokens.border.accent, tokens.text.onSurface)}
          >
            <button
              onClick={onCancel}
              aria-label="Tutup"
              className={cx("absolute top-4 right-4 cursor-pointer", tokens.text.faint, "hover:text-white light_sakura:hover:text-slate-900")}
            >
              <X size={18} />
            </button>

            <div className="mb-4 flex items-center gap-3">
              <div className="rounded-full p-2.5 bg-indigo-500/15 text-indigo-400 light_sakura:bg-indigo-50 light_sakura:text-indigo-600">
                <FileText size={20} />
              </div>
              <h3 className="font-sans text-lg font-semibold tracking-tight">
                {t("export.modal_full_title")}
              </h3>
            </div>

            <p className={cx("mb-5 font-sans text-sm leading-relaxed", tokens.text.secondary)}>
              {t("export.modal_full_desc")}
            </p>

            <div className="grid grid-cols-2 gap-3 mb-2">
              <div className="space-y-1.5">
                <label className={cx("font-sans text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold uppercase tracking-wider block", tokens.text.muted)}>
                  {t("export.from_month")}
                </label>
                <DropdownField
                  value={fromMonth}
                  onChange={setFromMonth}
                  options={monthOptions}
                />
              </div>

              <div className="space-y-1.5">
                <label className={cx("font-sans text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold uppercase tracking-wider block", tokens.text.muted)}>
                  {t("export.to_month")}
                </label>
                <DropdownField
                  value={toMonth}
                  onChange={setToMonth}
                  options={monthOptions}
                />
              </div>
            </div>

            <div className="space-y-1.5 mb-3">
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
                    return { value: w.id, label: `${icon} ${w.name}${w.provider ? ` · ${w.provider}` : ""}` };
                  })
                ]}
              />
            </div>

            {!valid && monthsSelected !== 0 && (
              <p className={cx("text-xs font-medium mb-3", tokens.text.danger)}>
                {t("export.range_invalid")}
              </p>
            )}
            {valid && (
              <p className={cx("text-xs mb-3", tokens.text.muted)}>
                {monthsSelected} / {MAX_RANGE_MONTHS} {t("export.from_month").toLowerCase()}
              </p>
            )}

            <div className="flex items-center justify-end gap-3 mt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={onCancel}
                disabled={isGenerating}
                className="rounded-xl"
              >
                {t("common.cancel")}
              </Button>
              <Button
                type="button"
                variant="primary"
                disabled={!valid || isGenerating}
                isLoading={isGenerating}
                onClick={() => onGenerate(fromMonth, toMonth, walletId || null)}
                className="rounded-xl"
              >
                {t("export.generate_pdf")}
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
