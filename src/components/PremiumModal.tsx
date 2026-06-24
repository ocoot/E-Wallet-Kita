import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ShieldCheck, Loader2, CheckCircle2, XCircle, Clock, Download, Sparkles, X } from "lucide-react";
import { useLanguage } from "../contexts/LanguageContext";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { audioFeedback } from "../lib/audio";
import { createPremiumTransaction, checkPremiumStatus, isSandboxMode, PREMIUM_AMOUNT, QRIS_EXPIRY_SECONDS, PremiumTransaction, getPremiumPricing } from "../lib/premium";
import { useVoucher } from "../hooks/useVoucher";
import { PremiumVoucher, PremiumPricing } from "../types";
import { generatePremiumReceipt } from "../lib/receipt";
import { Modal } from "./Modal";
import { getPremiumBasePrice } from "../lib/settings";

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

  const [step, setStep] = useState<Step>("terms");
  const [tx, setTx] = useState<PremiumTransaction | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(QRIS_EXPIRY_SECONDS);
  const [paidAt, setPaidAt] = useState<string | null>(null);
  const [askDownload, setAskDownload] = useState(false);
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

  const handleDownloadReceipt = () => {
    if (!tx || !paidAt) return;
    const doc = generatePremiumReceipt({
      orderId: tx.order_id,
      amount: tx.amount,
      totalAmount: tx.total_amount,
      paidAt,
      buyerName: user?.user_metadata?.full_name || user?.email || t("admin.guest_user"),
      sandbox: isSandboxMode(),
      t,
    });
    doc.save(`struk-premium-${tx.order_id}.pdf`);
    showToast(t("premium.receipt_downloaded"), "success");
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4"
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
          className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-sm p-6 relative"
        >
          {(step === "terms" || step === "expired" || step === "failed") && (
            <button onClick={onClose} className="absolute top-4 right-4 text-slate-500 hover:text-white">
              <X size={18} />
            </button>
          )}

          {step === "terms" && (
            <div className="text-center">
              <Sparkles className="mx-auto text-amber-400 mb-3" size={36} />
              <h3 className="text-lg font-bold text-white">{t("premium.terms_title")}</h3>
              <p className="text-sm text-gray-400 mt-2">{t("premium.terms_desc", { amount: pricing.basePrice.toLocaleString("id-ID") })}</p>
              
              {activeVouchers.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs text-gray-400 mb-2">{t("voucher.title")}</p>
                  <select 
                    className="w-full h-12 px-4 bg-slate-800/80 border border-slate-700 rounded-xl text-white font-medium focus:ring-2 focus:ring-indigo-500"
                    onChange={(e) => setSelectedVoucher(activeVouchers.find(v => v.id === e.target.value) || null)}
                  >
                    <option value="">{t("voucher.no_voucher")}</option>
                    {activeVouchers.map(v => <option key={v.id} value={v.id}>{v.code} - {v.discount_percent}% OFF</option>)}
                  </select>
                </div>
              )}

              <div className="mt-4 p-4 bg-slate-800/50 rounded-xl text-xs space-y-1">
                <p className="flex justify-between text-slate-300">
                  <span>{t("voucher.price_before")}</span> 
                  <span className="font-semibold text-white">Rp {pricing.basePrice.toLocaleString("id-ID")}</span>
                </p>
                {pricing.discountAmount > 0 && (
                  <p className="flex justify-between text-emerald-400">
                    <span>{t("voucher.discount", { percent: pricing.discountPercent })}</span> 
                    <span className="font-semibold">-Rp {pricing.discountAmount.toLocaleString("id-ID")}</span>
                  </p>
                )}
                <p className="flex justify-between font-bold text-white text-base mt-2">
                  <span>{t("voucher.total")}</span> 
                  <span>Rp {pricing.finalPrice.toLocaleString("id-ID")}</span>
                </p>
              </div>

              <ul className="text-left text-xs text-gray-400 mt-4 space-y-1.5 bg-slate-800/50 rounded-xl p-4">
                <li>• {t("premium.terms_point_1")}</li>
                <li>• {t("premium.terms_point_2")}</li>
                <li>• {t("premium.terms_point_3")}</li>
                <li>• {t("premium.terms_point_4")}</li>
              </ul>
              <div className="flex gap-3 mt-6">
                <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-slate-800 text-gray-300 text-sm font-semibold">{t("common.cancel")}</button>
                <button onClick={startPayment} className="flex-1 py-3 rounded-xl bg-indigo-600 text-white text-sm font-semibold">{t("premium.terms_agree")}</button>
              </div>
            </div>
          )}

          {step === "checking" && (
            <div className="text-center py-10">
              <Loader2 className="mx-auto animate-spin text-indigo-400 mb-3" size={36} />
              <p className="text-sm text-gray-300">{t("premium.creating_transaction")}</p>
            </div>
          )}

          {step === "qris" && tx && (
            <div className="text-center">
              <h3 className="text-base font-bold text-white">{t("premium.qris_title")}</h3>
              <div className="bg-white rounded-2xl p-4 mt-4 inline-block">
                <img src={tx.qris_url} alt="QRIS" className="w-48 h-48" />
              </div>
              <p className="text-2xl font-bold text-white mt-4">Rp {tx.total_amount.toLocaleString("id-ID")}</p>
              <p className="text-[11px] text-amber-400 mt-1">{t("premium.unique_code_note")}</p>
              <div className="flex items-center justify-center gap-2 mt-3 text-sm text-gray-400">
                <Clock size={14} />
                <span>{t("premium.expires_in", { time: `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")}` })}</span>
              </div>
              <div className="flex items-center justify-center gap-2 mt-4 text-xs text-indigo-300">
                <Loader2 size={13} className="animate-spin" />
                <span>{t("premium.waiting_payment")}</span>
              </div>
              {isSandboxMode() && <p className="text-[10px] text-gray-500 mt-3">{t("premium.sandbox_notice")}</p>}
              
              <button
                onClick={() => setShowCancelConfirm(true)}
                className="mt-4 w-full py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 font-medium text-sm"
              >
                {t("premium.cancel_transaction")}
              </button>
              
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
              <CheckCircle2 className="mx-auto text-emerald-400 mb-3" size={48} />
              <h3 className="text-lg font-bold text-white">{t("premium.success_title")}</h3>
              <p className="text-sm text-gray-400 mt-2">{t("premium.success_desc")}</p>

              {askDownload ? (
                <div className="flex gap-3 mt-6">
                  <button onClick={() => { setAskDownload(false); onClose(); }} className="flex-1 py-3 rounded-xl bg-slate-800 text-gray-300 text-sm font-semibold">{t("premium.skip_receipt")}</button>
                  <button onClick={() => { handleDownloadReceipt(); setAskDownload(false); onClose(); }} className="flex-1 py-3 rounded-xl bg-indigo-600 text-white text-sm font-semibold flex items-center justify-center gap-2">
                    <Download size={15} /> {t("premium.download_receipt")}
                  </button>
                </div>
              ) : (
                <button onClick={onClose} className="mt-6 w-full py-3 rounded-xl bg-indigo-600 text-white text-sm font-semibold">{t("common.close")}</button>
              )}
            </div>
          )}

          {step === "expired" && (
            <div className="text-center py-4">
              <Clock className="mx-auto text-amber-400 mb-3" size={40} />
              <h3 className="text-lg font-bold text-white">{t("premium.expired_title")}</h3>
              <p className="text-sm text-gray-400 mt-2">{t("premium.expired_desc")}</p>
              <button onClick={() => setStep("terms")} className="mt-6 w-full py-3 rounded-xl bg-indigo-600 text-white text-sm font-semibold">{t("premium.retry")}</button>
            </div>
          )}

          {step === "failed" && (
            <div className="text-center py-4">
              <XCircle className="mx-auto text-red-400 mb-3" size={40} />
              <h3 className="text-lg font-bold text-white">{t("premium.failed_title")}</h3>
              <p className="text-sm text-gray-400 mt-2">{t("premium.failed_desc")}</p>
              <button onClick={() => setStep("terms")} className="mt-6 w-full py-3 rounded-xl bg-indigo-600 text-white text-sm font-semibold">{t("premium.retry")}</button>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
