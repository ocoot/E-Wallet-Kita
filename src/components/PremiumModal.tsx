import React, { useEffect, useRef, useState } from "react";
import { ShieldCheck, Loader2, XCircle, Clock, Download, Sparkles, X, Mail } from "lucide-react";
import { useLanguage } from "../contexts/LanguageContext";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { supabase } from "../lib/supabase";
import { audioFeedback } from "../lib/audio";
import { createPremiumTransaction, checkPremiumStatus, isSandboxMode, PREMIUM_AMOUNT, QRIS_EXPIRY_SECONDS, PremiumTransaction, getPremiumPricing } from "../lib/premium";
import { useVoucher } from "../hooks/useVoucher";
import { DropdownField } from "./DropdownField";
import { PremiumVoucher, PremiumPricing } from "../types";
import { generatePremiumReceipt } from "../lib/receipt";
import { ReceiptCard } from "./ReceiptCard";
import { sendPremiumReceiptEmail } from "../lib/email";
import { Modal } from "./Modal";
import { Button } from "./ui/Button";
import { getPremiumBasePrice } from "../lib/settings";
import { useThemeTokens } from "../hooks/useThemeTokens";
import { ModalShell } from "./ui/ModalShell";

type Step = "terms" | "qris" | "checking" | "success" | "expired" | "failed";

interface PremiumModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPremiumActivated: () => void;
}

export const PremiumModal: React.FC<PremiumModalProps> = ({ isOpen, onClose, onPremiumActivated }) => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { showToast } = useToast();
  const { tokens, cx } = useThemeTokens();

  const [step, setStep] = useState<Step>("terms");
  const [displayName, setDisplayName] = useState<string>("");

  useEffect(() => {
    if (!user) return;
    const fetchProfile = async () => {
      const { data, error } = await supabase
        .from("users")
        .select("display_name")
        .eq("id", user.id)
        .single();
      if (!error && data?.display_name) {
        setDisplayName(data.display_name);
      }
    };
    fetchProfile();
  }, [user]);

  const [tx, setTx] = useState<PremiumTransaction | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(QRIS_EXPIRY_SECONDS);
  const [paidAt, setPaidAt] = useState<string | null>(null);
  const [askDownload, setAskDownload] = useState(false);
  const [actionLoading, setActionLoading] = useState<"download" | "email" | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
  const { getActiveVouchers, getClaimedVoucher } = useVoucher();
  const [activeVouchers, setActiveVouchers] = useState<PremiumVoucher[]>([]);
  const [selectedVoucher, setSelectedVoucher] = useState<PremiumVoucher | null>(null);
  const [basePrice, setBasePrice] = useState(PREMIUM_AMOUNT);
  const [pricing, setPricing] = useState<PremiumPricing>(getPremiumPricing(PREMIUM_AMOUNT));

  const reset = () => {
    setStep("terms");
    setTx(null);
    setSecondsLeft(QRIS_EXPIRY_SECONDS);
    setPaidAt(null);
    setAskDownload(false);
    setActionLoading(null);
    setShowCancelConfirm(false);
    setSelectedVoucher(null);
    if (pollRef.current) clearInterval(pollRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  useEffect(() => {
    if (isOpen) {
      getActiveVouchers().then(setActiveVouchers).catch(console.error);
      getPremiumBasePrice().then(setBasePrice).catch(console.error);
      reset();
    }
  }, [isOpen]);

  useEffect(() => {
    const p = getPremiumPricing(basePrice, selectedVoucher?.discount_percent || 0);
    setPricing(p);
  }, [selectedVoucher, basePrice]);

  const startPayment = async () => {
    if (!user) return;
    setStep("checking");
    try {
      const transaction = await createPremiumTransaction(user.id, selectedVoucher?.id, selectedVoucher?.discount_percent, basePrice);
      setTx(transaction);
      setSecondsLeft(QRIS_EXPIRY_SECONDS);
      setStep("qris");
      audioFeedback.playClick();
    } catch (e: any) {
      showToast(t("premium.error_create"), "error");
      setStep("terms");
    }
  };

  // countdown timer
  useEffect(() => {
    if (step !== "qris") return;
    timerRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          if (pollRef.current) clearInterval(pollRef.current);
          setStep("expired");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [step]);

  // poll status
  useEffect(() => {
    if (step !== "qris" || !tx) return;
    pollRef.current = setInterval(async () => {
      try {
        const status = await checkPremiumStatus(tx.order_id);
        if (status === "SUCCESS") {
          if (pollRef.current) clearInterval(pollRef.current);
          if (timerRef.current) clearInterval(timerRef.current);
          setPaidAt(new Date().toISOString());
          setStep("success");
          setAskDownload(true);
          audioFeedback.playChime();
          showToast(t("premium.success_toast"), "success");
          onPremiumActivated();
        } else if (status === "EXPIRED") {
          if (pollRef.current) clearInterval(pollRef.current);
          setStep("expired");
        }
      } catch {
        // keep polling silently; network blip shouldn't kill the flow
      }
    }, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [step, tx]);

  // Nama pembeli dipakai di 3 tempat (preview ReceiptCard di layar, unduh
  // PDF, kirim email) -- dihitung sekali di sini supaya ketiganya tidak
  // pernah beda-beda.
  const buyerName = displayName || user?.user_metadata?.full_name || user?.email || t("admin.guest_user");

  const handleDownloadReceipt = async () => {
    if (!tx || !paidAt) return;
    setActionLoading("download");
    try {
      const pdf = await generatePremiumReceipt({
        orderId: tx.order_id,
        amount: tx.amount,
        totalAmount: tx.total_amount,
        paidAt,
        buyerName,
        sandbox: isSandboxMode(),
        t,
      });
      pdf.save(`Struk-${tx.order_id}.pdf`);
      showToast(t("premium.receipt_downloaded"), "success");
    } catch (err) {
      console.error("Error generating or saving PDF:", err);
      showToast(t("premium.receipt_download_failed") || t("toast.error_general"), "error");
    } finally {
      setActionLoading(null);
    }
  };

  const handleSendReceipt = async () => {
    if (!tx || !paidAt || !user?.email) return;
    setActionLoading("email");
    try {
      await sendPremiumReceiptEmail({
        email: user.email,
        customerName: buyerName,
        orderId: tx.order_id,
        amount: tx.amount,
        totalAmount: tx.total_amount,
        paidAt,
        buyerName,
        sandbox: isSandboxMode(),
        t,
      });
      showToast(t("premium.receipt_email_success"), "success");
      setAskDownload(false);
      onClose();
    } catch (err) {
      console.error("Error sending receipt email:", err);
      showToast(t("premium.receipt_email_failed"), "error");
    } finally {
      setActionLoading(null);
    }
  };

  if (!isOpen) return null;

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="max-w-sm"
      ariaLabel={t("premium.title")}
      className="p-6 relative"
    >
          {(step === "terms" || step === "expired" || step === "failed") && (
            <button onClick={onClose} aria-label="Tutup" className={cx("absolute top-4 right-4 rounded-lg p-0.5", tokens.premiumModal.closeBtn)}>
              <X size={18} />
            </button>
          )}

          {step === "terms" && (
            <div className="text-center">
              <Sparkles className="mx-auto text-amber-400 mb-3" size={36} />
              <h3 className={cx("text-lg font-bold", tokens.text.onSurface)}>{t("premium.terms_title")}</h3>
              <p className={cx("text-sm mt-2", tokens.text.mutedAlt)}>{t("premium.terms_desc", { amount: pricing.basePrice.toLocaleString("id-ID") })}</p>
              
              {activeVouchers.length > 0 && (
                <div className="mt-4">
                  <p className={cx("text-xs mb-2", tokens.text.muted)}>{t("voucher.title")}</p>
                  <DropdownField
                    value={selectedVoucher?.id ?? ""}
                    onChange={(v) => setSelectedVoucher(activeVouchers.find(vo => vo.id === v) || null)}
                    options={[
                      { value: "", label: t("voucher.no_voucher") },
                      ...activeVouchers.map(v => ({ value: v.id, label: `${v.code} - ${v.discount_percent}% OFF` })),
                    ]}
                  />
                </div>
              )}

              <div className={cx("mt-4 p-4 rounded-xl text-xs space-y-1", tokens.premiumModal.infoBoxBg)}>
                <p className={cx("flex justify-between", tokens.text.label)}>
                  <span>{t("voucher.price_before")}</span> 
                  <span className={cx("font-semibold font-mono tabular-nums", tokens.text.onSurface)}>Rp {pricing.basePrice.toLocaleString("id-ID")}</span>
                </p>
                {pricing.discountAmount > 0 && (
                  <p className={cx("flex justify-between", tokens.text.success)}>
                    <span>{t("voucher.discount", { percent: pricing.discountPercent })}</span> 
                    <span className="font-semibold font-mono tabular-nums">-Rp {pricing.discountAmount.toLocaleString("id-ID")}</span>
                  </p>
                )}
                <p className={cx("flex justify-between font-bold text-base mt-2", tokens.text.onSurface)}>
                  <span>{t("voucher.total")}</span> 
                  <span className="font-mono tabular-nums">Rp {pricing.finalPrice.toLocaleString("id-ID")}</span>
                </p>
              </div>

              <ul className={cx("text-left text-xs mt-4 space-y-1.5 rounded-xl p-4", tokens.premiumModal.infoBoxBg, tokens.text.mutedAlt)}>
                <li>• {t("premium.terms_point_1")}</li>
                <li>• {t("premium.terms_point_2")}</li>
                <li>• {t("premium.terms_point_3")}</li>
                <li>• {t("premium.terms_point_4")}</li>
              </ul>
              <div className="flex gap-3 mt-6">
                <Button variant="secondary" fullWidth onClick={onClose} className="rounded-xl">{t("common.cancel")}</Button>
                <Button variant="primary" fullWidth onClick={startPayment} className="rounded-xl">{t("premium.terms_agree")}</Button>
              </div>
            </div>
          )}

          {step === "checking" && (
            <div className="text-center py-10">
              <Loader2 className={cx("mx-auto animate-spin mb-3", tokens.icon.accent)} size={36} />
              <p className={cx("text-sm", tokens.text.label)}>{t("premium.creating_transaction")}</p>
            </div>
          )}

          {step === "qris" && tx && (
            <div className="text-center">
              <h3 className={cx("text-base font-bold", tokens.text.onSurface)}>{t("premium.qris_title")}</h3>
              <div className={cx("bg-white rounded-2xl p-4 mt-4 inline-block", tokens.premiumModal.qrWrapperBorder)}>
                <img src={tx.qris_url} alt="QRIS" className="w-48 h-48" />
              </div>
              <p className={cx("text-2xl font-bold font-mono tabular-nums mt-4", tokens.text.onSurface)}>Rp {tx.total_amount.toLocaleString("id-ID")}</p>
              <p className={cx("text-[clamp(0.6188rem,2.86vw,0.6875rem)] mt-1", tokens.text.warning)}>{t("premium.unique_code_note")}</p>
              <div className={cx("flex items-center justify-center gap-2 mt-3 text-sm", tokens.text.muted)}>
                <Clock size={14} />
                <span>{t("premium.expires_in", { time: `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")}` })}</span>
              </div>
              <div className={cx("flex items-center justify-center gap-2 mt-4 text-xs", tokens.premiumModal.footerNoteText)}>
                <Loader2 size={13} className="animate-spin" />
                <span>{t("premium.waiting_payment")}</span>
              </div>
              {isSandboxMode() && <p className={cx("text-[clamp(0.5625rem,2.6vw,0.625rem)] mt-3", tokens.text.faint)}>{t("premium.sandbox_notice")}</p>}
              {!isSandboxMode() && tx.is_sandbox && <p className={cx("text-[clamp(0.5625rem,2.6vw,0.625rem)] mt-3", tokens.text.faint)}>{t("premium.dummy_qris_notice")}</p>}
              
              <Button
                variant="danger-ghost"
                fullWidth
                onClick={() => setShowCancelConfirm(true)}
                className="mt-4 rounded-xl border border-red-500/30"
              >
                {t("premium.cancel_transaction")}
              </Button>
              
              <Modal
                isOpen={showCancelConfirm}
                title={t("voucher.confirm_cancel_tx")}
                description={t("voucher.confirm_cancel_tx_desc")}
                type="warning"
                confirmLabel={t("voucher.cancel_tx")}
                cancelLabel={t("voucher.continue_payment")}
                onConfirm={reset}
                onCancel={() => setShowCancelConfirm(false)}
              />
            </div>
          )}

          {step === "success" && (
            <div className="text-center py-4">
              <h3 className={cx("text-lg font-bold mb-4", tokens.text.onSurface)}>{t("premium.success_title")}</h3>

              {tx && paidAt && (
                <ReceiptCard
                  data={{
                    orderId: tx.order_id,
                    buyerName,
                    amount: tx.amount,
                    totalAmount: tx.total_amount,
                    paidAt,
                    sandbox: isSandboxMode(),
                  }}
                  t={t}
                />
              )}

              {askDownload ? (
                <div className="flex flex-col gap-3 mt-6">
                  <Button
                    variant="secondary"
                    fullWidth
                    disabled={actionLoading !== null}
                    onClick={() => {
                      setAskDownload(false);
                      onClose();
                    }}
                    className="rounded-xl"
                  >
                    {t("premium.skip_receipt")}
                  </Button>

                  <div className="grid grid-cols-2 gap-3">
                    <Button
                      variant="secondary"
                      disabled={actionLoading !== null}
                      isLoading={actionLoading === "download"}
                      onClick={handleDownloadReceipt}
                      icon={<Download size={16} />}
                      className="rounded-xl"
                    >
                      {actionLoading === "download" ? t("common.generating_pdf") : t("premium.download_receipt")}
                    </Button>

                    <Button
                      variant="primary"
                      disabled={actionLoading !== null}
                      isLoading={actionLoading === "email"}
                      onClick={handleSendReceipt}
                      icon={<Mail size={16} />}
                      className="rounded-xl"
                    >
                      {actionLoading === "email" ? t("common.sending") : t("premium.email_receipt")}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button variant="primary" fullWidth onClick={onClose} className="mt-6 rounded-xl">{t("common.close")}</Button>
              )}
            </div>
          )}

          {step === "expired" && (
            <div className="text-center py-4">
              <Clock className="mx-auto text-amber-400 mb-3" size={40} />
              <h3 className={cx("text-lg font-bold", tokens.text.onSurface)}>{t("premium.expired_title")}</h3>
              <p className={cx("text-sm mt-2", tokens.text.mutedAlt)}>{t("premium.expired_desc")}</p>
              <Button variant="primary" fullWidth onClick={() => setStep("terms")} className="mt-6 rounded-xl">{t("premium.retry")}</Button>
            </div>
          )}

          {step === "failed" && (
            <div className="text-center py-4">
              <XCircle className="mx-auto text-red-400 mb-3" size={40} />
              <h3 className={cx("text-lg font-bold", tokens.text.onSurface)}>{t("premium.failed_title")}</h3>
              <p className={cx("text-sm mt-2", tokens.text.mutedAlt)}>{t("premium.failed_desc")}</p>
              <Button variant="primary" fullWidth onClick={() => setStep("terms")} className="mt-6 rounded-xl">{t("premium.retry")}</Button>
            </div>
          )}
        </ModalShell>
  );
};
