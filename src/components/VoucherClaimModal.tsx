import React, { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { useVoucher } from "../hooks/useVoucher";
import { PremiumVoucher } from "../types";
import { Modal } from "./Modal";
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
    <Modal isOpen={isOpen} onClose={onClose} title={t("voucher.title")}>
      <div className="space-y-4">
        {vouchers.map((v) => (
          <div key={v.id} className="flex justify-between items-center p-3 border rounded">
            <div>
              <p className="font-bold">{v.code}</p>
              <p>{t("voucher.discount", { percent: v.discount_percent })}</p>
            </div>
            <button
              onClick={() => handleClaim(v.id)}
              className="px-4 py-2 bg-indigo-500 text-white rounded"
            >
              {t("voucher.claim")}
            </button>
          </div>
        ))}
      </div>
    </Modal>
  );
};
