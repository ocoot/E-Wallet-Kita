import React from "react";
import { motion } from "motion/react";
import { AlertCircle, HelpCircle, Trash2, CheckCircle } from "lucide-react";
import { Button } from "./ui/Button";
import { ModalShell } from "./ui/ModalShell";
import { useThemeTokens } from "../hooks/useThemeTokens";

interface ModalProps {
  isOpen: boolean;
  title: string;
  description: string;
  type?: "danger" | "warning" | "info" | "success";
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  confirmDisabled?: boolean;
}

/**
 * Sesi ini: di-refactor supaya compose dari `ModalShell` alih-alih menulis
 * ulang backdrop/animasi/a11y sendiri (dulu satu-satunya dari 13 komponen
 * modal yang tidak lewat `ModalShell`, lihat AUDIT-konsistensi-komponen.md
 * temuan #2 / prioritas #1). API publik (props) SENGAJA tidak diubah sama
 * sekali supaya 18 file pemanggil tidak perlu disentuh.
 *
 * Panel danger/normal punya warna bg/border sendiri yang beda dari default
 * `ModalShell` (`tokens.surface.card`/`tokens.border.default`) -- makanya
 * dioper lewat prop `panelTone`, bukan `className`, supaya tidak ada kelas
 * Tailwind yang tabrakan di properti yang sama (lihat komentar di
 * `ModalShell.tsx`).
 *
 * Catatan visual minor yang sengaja dibiarkan berubah (mengikuti standar
 * `ModalShell` yang dipakai 12 modal lain, bukan bug):
 * - `max-h-[85vh]` -> `max-h-[90vh]` (dulu beda sendiri, sekarang seragam).
 * - `aria-labelledby`+`aria-describedby` manual -> `ariaLabel` (pola yang
 *   sama persis dipakai `DeleteAccountModal`/`WalletTopUpModal`/dst).
 */
export const Modal: React.FC<ModalProps> = ({
  isOpen,
  title,
  description,
  type = "info",
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  confirmDisabled = false
}) => {
  const { tokens, cx } = useThemeTokens();

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onCancel}
      maxWidth="max-w-md"
      ariaLabel={title}
      className="p-6"
      panelTone={
        type === "danger"
          ? cx(tokens.modal.panelDanger, tokens.surface.card)
          : tokens.modal.panelNormal
      }
    >
      {/* Type Icon indicator row */}
      <div className="mb-4 flex items-center gap-3">
        <motion.div
          // P4 4.6: kompensasi visual ketiadaan haptic -- ikon sukses
          // "melompat" masuk dengan spring bounce yang cukup kuat
          // secara visual, supaya tetap terasa sebagai sinyal
          // konfirmasi meski tanpa getaran fisik. Tipe lain tetap
          // statis (bounce cuma relevan untuk state "berhasil").
          initial={type === "success" ? { scale: 0, rotate: -25 } : false}
          animate={type === "success" ? { scale: 1, rotate: 0 } : undefined}
          transition={{ type: "spring", stiffness: 420, damping: 14 }}
          className={cx(
            "rounded-full p-2.5",
            type === "danger"
              ? cx(tokens.budgetProgressCard.badgeBgDanger, tokens.newTransaction.amountDisplayExpense)
              : type === "warning"
                ? cx(tokens.budgetProgressCard.badgeBgWarning, tokens.text.warning)
                : type === "success"
                  ? cx(tokens.budget.statusSafe, tokens.text.success)
                  : cx(tokens.budgetProgressCard.badgeBgSafe, tokens.text.accentStrong)
          )}
        >
          {type === "danger" && <Trash2 size={22} />}
          {type === "warning" && <AlertCircle size={22} />}
          {type === "info" && <HelpCircle size={22} />}
          {type === "success" && <CheckCircle size={22} />}
        </motion.div>
        <h3 className="font-sans text-lg font-semibold tracking-tight">
          {title}
        </h3>
      </div>

      {/* Description textual info */}
      <p className="mb-6 font-sans text-sm block opacity-85 leading-relaxed">
        {description}
      </p>

      {/* Actions button group */}
      <div className="flex items-center justify-end gap-3 max-sm:gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={onCancel}
          className="min-h-[44px] max-sm:flex-1 rounded-xl"
        >
          {cancelLabel}
        </Button>

        <Button
          type="button"
          variant={type === "danger" ? "danger" : "primary"}
          disabled={confirmDisabled}
          onClick={onConfirm}
          className="min-h-[44px] max-sm:flex-1 rounded-xl"
        >
          {confirmLabel}
        </Button>
      </div>
    </ModalShell>
  );
};
