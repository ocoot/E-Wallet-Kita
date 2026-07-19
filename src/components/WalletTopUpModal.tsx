import React, { useEffect, useState } from "react";
import { Plus, X, CheckCircle2, XCircle } from "lucide-react";
import { useLanguage } from "../contexts/LanguageContext";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { useThemeTokens } from "../hooks/useThemeTokens";
import { audioFeedback } from "../lib/audio";
import { dbService } from "../lib/db";
import { WalletWithBalance } from "../types";
import { Button } from "./ui/Button";
import { ModalShell } from "./ui/ModalShell";
import { Input } from "./ui/Input";

type Status = "idle" | "loading" | "success" | "error";

interface WalletTopUpModalProps {
  isOpen: boolean;
  wallet: WalletWithBalance | null;
  formatIDR: (num: number) => string;
  onClose: () => void;
  /** Dipanggil sekali setelah top up SUKSES -- caller bertanggung jawab refresh saldo pos & transaksi. */
  onSuccess: () => void;
}

/**
 * Dialog "Top Up Saldo" -- dipicu dari ikon + di kartu Pos Dompet Dashboard
 * (DashboardWalletSelectorCard.tsx). Alurnya SENGAJA disamakan dengan
 * pencatatan transaksi pemasukan manual (NewTransaction.tsx): isi nominal,
 * simpan, done -- cuma dipangkas jadi 1 field saja (nominal) karena pos
 * tujuannya sudah pasti (pos yang sedang aktif di kartu), dan kategorinya
 * dikunci ke "topup" (lihat dbService.topUpWallet) supaya tidak tercampur
 * dengan kategori pemasukan lain seperti gaji/bonus di riwayat transaksi.
 */
export const WalletTopUpModal: React.FC<WalletTopUpModalProps> = ({
  isOpen,
  wallet,
  formatIDR,
  onClose,
  onSuccess,
}) => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { showToast } = useToast();
  const { tokens, cx } = useThemeTokens();

  const [amount, setAmount] = useState<number | "">("");
  const [status, setStatus] = useState<Status>("idle");

  const isBusy = status === "loading";

  // Reset form tiap kali dialog dibuka ulang / pindah pos, supaya nominal
  // dari sesi sebelumnya tidak ke-carry ke pos lain secara tidak sengaja.
  useEffect(() => {
    if (isOpen) {
      setAmount("");
      setStatus("idle");
    }
  }, [isOpen, wallet?.id]);

  if (!isOpen || !wallet) return null;

  const numericAmount = amount === "" ? 0 : Number(amount);
  const canSubmit = numericAmount > 0 && status !== "loading";

  const handleSubmit = async () => {
    if (!canSubmit || !user?.id) return;
    audioFeedback.playClick();
    setStatus("loading");
    try {
      await dbService.topUpWallet(user.id, wallet.id, numericAmount, t("walletActions.topup_note"));
      audioFeedback.playChime();
      setStatus("success");
      onSuccess();
    } catch (err) {
      console.error("WalletTopUpModal top up error:", err);
      audioFeedback.playAlert();
      setStatus("error");
    }
  };

  const handleClose = () => {
    if (isBusy) return;
    audioFeedback.playClick();
    onClose();
  };

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={handleClose}
      maxWidth="max-w-md"
      backdropLocked={isBusy}
      ariaLabel={t("walletActions.topup_title")}
      className="p-6"
    >
          {status === "success" ? (
            <div className="flex flex-col items-center text-center py-4 gap-3">
              <div className="rounded-full p-3 bg-emerald-500/15 text-emerald-400">
                <CheckCircle2 size={32} />
              </div>
              <h3 className="font-sans text-lg font-semibold tracking-tight">
                {t("walletActions.topup_success_title")}
              </h3>
              <p className={cx("font-sans text-sm leading-relaxed", tokens.text.muted)}>
                {t("walletActions.topup_success_desc", {
                  wallet: wallet.name,
                  amount: formatIDR(numericAmount),
                })}
              </p>
              <Button variant="success" onClick={handleClose} className="rounded-xl mt-2" fullWidth>
                {t("walletActions.done_action")}
              </Button>
            </div>
          ) : status === "error" ? (
            <div className="flex flex-col items-center text-center py-4 gap-3">
              <div className="rounded-full p-3 bg-red-500/15 text-red-400">
                <XCircle size={32} />
              </div>
              <h3 className="font-sans text-lg font-semibold tracking-tight">
                {t("walletActions.topup_error_title")}
              </h3>
              <p className={cx("font-sans text-sm leading-relaxed", tokens.text.muted)}>
                {t("walletActions.topup_error_desc")}
              </p>
              <div className="flex items-center gap-3 w-full mt-2">
                <Button variant="ghost" onClick={handleClose} className="rounded-xl" fullWidth>
                  {t("walletActions.close_action")}
                </Button>
                <Button variant="success" onClick={() => setStatus("idle")} className="rounded-xl" fullWidth>
                  {t("walletActions.retry_action")}
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="mb-4 flex items-center justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="rounded-full p-2.5 bg-emerald-500/15 text-emerald-400 shrink-0">
                    <Plus size={20} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-sans text-lg font-semibold tracking-tight truncate">
                      {t("walletActions.topup_title")}
                    </h3>
                    <p className={cx("font-sans text-[clamp(0.6188rem,2.86vw,0.6875rem)] truncate", tokens.text.muted)}>
                      {wallet.name}
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleClose}
                  disabled={isBusy}
                  aria-label={t("walletActions.close_action")}
                  className={cx("p-1.5 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed", tokens.modal.closeBtn)}
                >
                  <X size={16} />
                </button>
              </div>

              <div className={cx("rounded-2xl border px-4 py-3 mb-4 text-center", tokens.newTransaction.amountInputIncome)}>
                <span className="font-mono font-black text-2xl tabular-nums text-emerald-400">
                  +{formatIDR(numericAmount)}
                </span>
              </div>

              <div className="space-y-1.5">
                <label className={cx("text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold uppercase block", tokens.text.muted)}>
                  {t("walletActions.topup_amount_label")}
                </label>
                <Input
                  size="compact"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  autoFocus
                  disabled={isBusy}
                  placeholder={t("walletActions.topup_amount_placeholder")}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value === "" ? "" : Number(e.target.value))}
                  className="py-2.5"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-5">
                <Button type="button" variant="ghost" onClick={handleClose} disabled={isBusy} className="rounded-xl">
                  {t("walletActions.cancel_action")}
                </Button>
                <Button
                  type="button"
                  variant="success"
                  onClick={handleSubmit}
                  disabled={!canSubmit}
                  isLoading={isBusy}
                  className="rounded-xl"
                >
                  {isBusy ? t("walletActions.topup_processing") : t("walletActions.topup_button")}
                </Button>
              </div>
            </>
          )}
        </ModalShell>
  );
};
