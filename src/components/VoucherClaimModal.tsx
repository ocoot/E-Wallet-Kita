import React, { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useVoucher } from "../hooks/useVoucher";
import { PremiumVoucher } from "../types";
import { useToast } from "../contexts/ToastContext";
import { useLanguage } from "../contexts/LanguageContext";
import { ModalShell } from "./ModalShell";
import { X, Gift } from "lucide-react";

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
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      ariaLabelledBy="voucher-claim-title"
      ariaDescribedBy="voucher-claim-desc"
      className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border p-6 shadow-2xl bg-slate-900 border-indigo-500/20 text-white light_sakura:bg-white light_sakura:text-slate-800 light_sakura:border-rose-100"
    >
      <button
        onClick={onClose}
        aria-label={t("common.close") || "Close"}
        className="absolute top-4 right-4 text-slate-400 hover:text-white light_sakura:hover:text-slate-900 cursor-pointer"
      >
        <X size={18} />
      </button>

      <div className="mb-4 flex items-center gap-3">
        <div className="rounded-full p-2.5 bg-indigo-500/15 text-indigo-400 light_sakura:bg-rose-50 light_sakura:text-rose-500">
          <Gift size={20} />
        </div>
        <h3 id="voucher-claim-title" className="font-sans text-lg font-semibold tracking-tight">
          {t("voucher.title")}
        </h3>
      </div>

      <div id="voucher-claim-desc" className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
        {vouchers.length === 0 ? (
          <p className="text-slate-400 light_sakura:text-slate-500 text-sm text-center py-4">No active vouchers available</p>
        ) : (
          vouchers.map((v) => (
            <div key={v.id} className="flex justify-between items-center p-3 border border-slate-800 rounded-xl bg-slate-950/40 light_sakura:bg-slate-50 light_sakura:border-slate-100">
              <div>
                <p className="font-bold text-sm text-white light_sakura:text-slate-800">{v.code}</p>
                <p className="text-xs text-slate-400 light_sakura:text-slate-500">{t("voucher.discount", { percent: v.discount_percent })}</p>
              </div>
              <button
                onClick={() => handleClaim(v.id)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold cursor-pointer min-h-[44px] light_sakura:bg-rose-500 light_sakura:hover:bg-rose-400"
              >
                {t("voucher.claim")}
              </button>
            </div>
          ))
        )}
      </div>
    </ModalShell>
  );
};
