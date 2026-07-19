import React, { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Send, X, CheckCircle2, XCircle, Eye, EyeOff } from "lucide-react";
import { useLanguage } from "../contexts/LanguageContext";
import { useAuth } from "../contexts/AuthContext";
import { useThemeTokens } from "../hooks/useThemeTokens";
import { useLockBodyScroll } from "../hooks/useLockBodyScroll";
import { useDialogA11y } from "../hooks/useDialogA11y";
import { audioFeedback } from "../lib/audio";
import { dbService } from "../lib/db";
import { WalletWithBalance } from "../types";
import { walletDisplayLabel } from "../lib/walletLabel";
import { Button } from "./ui/Button";
import { DropdownField } from "./DropdownField";

type Status = "idle" | "loading" | "success" | "error";

const maskContact = (value: string) => {
  const v = value.trim();
  if (v.length <= 4) return "•".repeat(Math.max(v.length, 3));
  return "•".repeat(v.length - 4) + " " + v.slice(-4);
};

interface WalletTransferModalProps {
  isOpen: boolean;
  sourceWallet: WalletWithBalance | null;
  /** Semua Pos Dompet aktif milik user (termasuk sourceWallet) -- dipakai untuk daftar pilihan pos tujuan. */
  wallets: WalletWithBalance[];
  formatIDR: (num: number) => string;
  onClose: () => void;
  /** Dipanggil sekali setelah transfer SUKSES -- caller bertanggung jawab refresh saldo pos & transaksi. */
  onSuccess: () => void;
}

/**
 * Dialog "Transfer Saldo" -- dipicu dari ikon kirim di kartu Pos Dompet
 * Dashboard (DashboardWalletSelectorCard.tsx). Mengirim nominal dari pos
 * yang sedang aktif ke pos lain milik user sendiri (BUKAN transfer ke user
 * lain -- app ini tidak punya konsep user lain untuk Pos Dompet). Dicatat
 * sebagai sepasang transaksi (expense pos asal + income pos tujuan) lewat
 * dbService.transferBetweenWallets, konsisten dengan model saldo pos yang
 * dihitung dari SUM(transactions) per wallet_id.
 *
 * Nomor rekening/HP pos tujuan ditampilkan (dengan toggle show/hide, sama
 * seperti pola di DashboardWalletSelectorCard) begitu pos tujuan dipilih,
 * KHUSUS untuk tipe pos ewallet/bank -- murni informasi konfirmasi visual
 * ("benar pos ini yang dituju?"), bukan input yang bisa diedit, karena
 * nomor itu sudah tersimpan di data pos itu sendiri (lihat Wallets.tsx).
 */
export const WalletTransferModal: React.FC<WalletTransferModalProps> = ({
  isOpen,
  sourceWallet,
  wallets,
  formatIDR,
  onClose,
  onSuccess,
}) => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { tokens, cx } = useThemeTokens();

  const [amount, setAmount] = useState<number | "">("");
  const [targetId, setTargetId] = useState<string>("");
  const [contactVisible, setContactVisible] = useState(false);
  const [status, setStatus] = useState<Status>("idle");

  const isBusy = status === "loading";
  const panelRef = React.useRef<HTMLDivElement>(null);

  useLockBodyScroll(isOpen);
  useDialogA11y(isOpen, panelRef, isBusy ? undefined : onClose);

  const targetOptions = useMemo(
    () => wallets.filter((w) => w.id !== sourceWallet?.id),
    [wallets, sourceWallet?.id]
  );

  // Reset form tiap kali dialog dibuka ulang / pos asal berganti.
  useEffect(() => {
    if (isOpen) {
      setAmount("");
      setContactVisible(false);
      setStatus("idle");
      setTargetId((prev) => {
        const stillValid = targetOptions.some((w) => w.id === prev);
        if (stillValid) return prev;
        return targetOptions[0]?.id ?? "";
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, sourceWallet?.id]);

  if (!isOpen || !sourceWallet) return null;

  const targetWallet = targetOptions.find((w) => w.id === targetId) || null;
  const numericAmount = amount === "" ? 0 : Number(amount);
  const insufficientBalance = numericAmount > sourceWallet.balance;
  const canSubmit =
    numericAmount > 0 && !!targetWallet && !insufficientBalance && status !== "loading";

  const contactValue =
    targetWallet?.type === "ewallet" ? targetWallet.phone_number :
    targetWallet?.type === "bank" ? targetWallet.account_number : null;

  const handleSubmit = async () => {
    if (!canSubmit || !user?.id || !targetWallet) return;
    audioFeedback.playClick();
    setStatus("loading");
    try {
      await dbService.transferBetweenWallets(
        user.id,
        sourceWallet.id,
        targetWallet.id,
        numericAmount,
        t("walletActions.transfer_note_out", { wallet: targetWallet.name }),
        t("walletActions.transfer_note_in", { wallet: sourceWallet.name })
      );
      audioFeedback.playChime();
      setStatus("success");
      onSuccess();
    } catch (err) {
      console.error("WalletTransferModal transfer error:", err);
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
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={handleClose}
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
          className={cx("relative z-10 w-full max-w-md my-auto max-h-[85vh] overflow-y-auto overflow-x-hidden rounded-2xl p-6 shadow-2xl outline-none", tokens.modal.panel)}
        >
          {status === "success" ? (
            <div className="flex flex-col items-center text-center py-4 gap-3">
              <div className={cx("rounded-full p-3 bg-indigo-500/15", tokens.icon.accent)}>
                <CheckCircle2 size={32} />
              </div>
              <h3 className="font-sans text-lg font-semibold tracking-tight">
                {t("walletActions.transfer_success_title")}
              </h3>
              <p className={cx("font-sans text-sm leading-relaxed", tokens.text.muted)}>
                {t("walletActions.transfer_success_desc", {
                  amount: formatIDR(numericAmount),
                  from: sourceWallet.name,
                  to: targetWallet?.name ?? "",
                })}
              </p>
              <Button variant="primary" onClick={handleClose} className="rounded-xl mt-2" fullWidth>
                {t("walletActions.done_action")}
              </Button>
            </div>
          ) : status === "error" ? (
            <div className="flex flex-col items-center text-center py-4 gap-3">
              <div className="rounded-full p-3 bg-red-500/15 text-red-400">
                <XCircle size={32} />
              </div>
              <h3 className="font-sans text-lg font-semibold tracking-tight">
                {t("walletActions.transfer_error_title")}
              </h3>
              <p className={cx("font-sans text-sm leading-relaxed", tokens.text.muted)}>
                {t("walletActions.transfer_error_desc")}
              </p>
              <div className="flex items-center gap-3 w-full mt-2">
                <Button variant="ghost" onClick={handleClose} className="rounded-xl" fullWidth>
                  {t("walletActions.close_action")}
                </Button>
                <Button variant="primary" onClick={() => setStatus("idle")} className="rounded-xl" fullWidth>
                  {t("walletActions.retry_action")}
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={cx("rounded-full p-2.5 bg-indigo-500/15", tokens.icon.accent)}>
                    <Send size={18} />
                  </div>
                  <div>
                    <h3 className="font-sans text-lg font-semibold tracking-tight">
                      {t("walletActions.transfer_title")}
                    </h3>
                    <p className={cx("font-sans text-[11px]", tokens.text.muted)}>
                      {t("walletActions.transfer_from_label")}: {sourceWallet.name}
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

              <div className={cx("rounded-2xl border px-4 py-3 mb-4 text-center", tokens.walletTransferModal.summaryCardBg)}>
                <span className={cx("font-sans font-black text-2xl tabular-nums", tokens.text.accent)}>
                  {formatIDR(numericAmount)}
                </span>
              </div>

              {targetOptions.length === 0 ? (
                <p className={cx("text-xs leading-relaxed rounded-xl border p-3", tokens.text.muted, tokens.border.subtleRose)}>
                  {t("walletActions.transfer_no_target")}
                </p>
              ) : (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label className={cx("text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold uppercase block", tokens.text.muted)}>
                      {t("walletActions.transfer_to_label")}
                    </label>
                    <DropdownField
                      value={targetId}
                      onChange={(v) => { audioFeedback.playClick(); setTargetId(v); setContactVisible(false); }}
                      placeholder={t("walletActions.transfer_to_placeholder")}
                      options={targetOptions.map((w) => ({
                        value: w.id,
                        label: `${walletDisplayLabel(w)} (${formatIDR(w.balance)})`,
                      }))}
                    />
                  </div>

                  {targetWallet && (targetWallet.type === "ewallet" || targetWallet.type === "bank") && (
                    <div className="space-y-1.5">
                      <label className={cx("text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold uppercase block", tokens.text.muted)}>
                        {t("walletActions.transfer_contact_label")}
                      </label>
                      {contactValue ? (
                        <div
                          onClick={() => setContactVisible((v) => !v)}
                          className={cx(
                            "flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-sm tabular-nums cursor-pointer",
                            tokens.surface.sunken,
                            tokens.border.subtleRose
                          )}
                        >
                          <span className="truncate">{contactVisible ? contactValue : maskContact(contactValue)}</span>
                          {contactVisible ? <EyeOff size={13} className="shrink-0" /> : <Eye size={13} className="shrink-0" />}
                        </div>
                      ) : (
                        <p className={cx("text-xs italic", tokens.text.faint)}>
                          {t("walletActions.transfer_contact_empty")}
                        </p>
                      )}
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label className={cx("text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold uppercase block", tokens.text.muted)}>
                      {t("walletActions.transfer_amount_label")}
                    </label>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      disabled={isBusy}
                      placeholder={t("walletActions.topup_amount_placeholder")}
                      value={amount}
                      onChange={(e) => setAmount(e.target.value === "" ? "" : Number(e.target.value))}
                      className={tokens.form.inputLg}
                    />
                    {insufficientBalance && numericAmount > 0 && (
                      <p className="text-[11px] text-red-400">{t("walletActions.transfer_insufficient")}</p>
                    )}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-5">
                <Button type="button" variant="ghost" onClick={handleClose} disabled={isBusy} className="rounded-xl">
                  {t("walletActions.cancel_action")}
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  onClick={handleSubmit}
                  disabled={!canSubmit}
                  isLoading={isBusy}
                  className="rounded-xl"
                >
                  {isBusy ? t("walletActions.transfer_processing") : t("walletActions.transfer_button")}
                </Button>
              </div>
            </>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
