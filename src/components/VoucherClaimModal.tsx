import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useVoucher } from "../hooks/useVoucher";
import { PremiumVoucher } from "../types";
import { useToast } from "../contexts/ToastContext";
import { useLanguage } from "../contexts/LanguageContext";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onClaimed: () => void;
}

export const VoucherClaimModal: React.FC<Props> = ({ isOpen, onClose, onClaimed }) => {
  const { session } = useAuth();
  const { getActiveVouchers, claimVoucher } = useVoucher();
  const { showToast } = useToast();
  const { t } = useLanguage();
  const [vouchers, setVouchers] = useState<PremiumVoucher[]>([]);

  useEffect(() => {
    if (isOpen) {
      getActiveVouchers().then(setVouchers).catch(console.error);
    }
  }, [isOpen]);

  const handleClaim = async (voucherId: string) => {
    if (!session?.user.id) return;
    try {
      await claimVoucher(voucherId, session.user.id);
      showToast(t("voucher.claimed"), "success");
      onClaimed();
      onClose();
    } catch (e) {
      showToast("Gagal klaim voucher", "error");
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto bg-slate-950/70 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md my-auto bg-slate-900 light_sakura:bg-white rounded-3xl border border-slate-800 light_sakura:border-slate-200 shadow-2xl"
          >
            <div className="flex items-center justify-between p-6 pb-4">
              <h2 className="font-sans font-bold text-lg text-slate-100 light_sakura:text-slate-900">
                {t("voucher.title")}
              </h2>
              <button
                onClick={onClose}
                aria-label={t("common.close")}
                className="text-slate-500 hover:text-white light_sakura:hover:text-slate-900 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>
            <div className="px-6 pb-6 space-y-4">
              {vouchers.map((v) => (
                <div key={v.id} className="flex justify-between items-center p-3 rounded-2xl border border-slate-800 light_sakura:border-slate-200">
                  <div>
                    <p className="font-bold text-slate-100 light_sakura:text-slate-900">{v.code}</p>
                    <p className="text-sm text-slate-400 light_sakura:text-slate-500">{t("voucher.discount", { percent: v.discount_percent })}</p>
                  </div>
                  <button
                    onClick={() => handleClaim(v.id)}
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 light_sakura:bg-rose-500 light_sakura:hover:bg-rose-400 text-white text-sm font-semibold transition-colors cursor-pointer"
                  >
                    {t("voucher.claim")}
                  </button>
                </div>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
