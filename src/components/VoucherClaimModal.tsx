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
  const [isLoadingVouchers, setIsLoadingVouchers] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [claimingId, setClaimingId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setIsLoadingVouchers(true);
      setLoadError(false);
      getActiveVouchers()
        .then(setVouchers)
        .catch((e) => {
          console.error(e);
          setLoadError(true);
          showToast(t("toast.error_general"), "error");
        })
        .finally(() => setIsLoadingVouchers(false));
    }
  }, [isOpen]);

  const handleClaim = async (voucherId: string) => {
    if (!session?.user.id || claimingId) return;
    setClaimingId(voucherId);
    try {
      await claimVoucher(voucherId, session.user.id);
      showToast(t("voucher.claimed"), "success");
      onClaimed();
      onClose();
    } catch (e) {
      showToast(t("voucher.claim_error") || "Gagal klaim voucher", "error");
    } finally {
      setClaimingId(null);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t("voucher.title")}>
      <div className="space-y-4">
        {isLoadingVouchers ? (
          <p className="text-center text-sm opacity-70 py-4">{t("common.loading")}</p>
        ) : loadError ? (
          <p className="text-center text-sm text-red-400 py-4">{t("toast.error_general")}</p>
        ) : vouchers.length === 0 ? (
          <p className="text-center text-sm opacity-70 py-4">{t("voucher.empty") || "-"}</p>
        ) : (
          vouchers.map((v) => (
            <div key={v.id} className="flex justify-between items-center p-3 border rounded">
              <div>
                <p className="font-bold">{v.code}</p>
                <p>{t("voucher.discount", { percent: v.discount_percent })}</p>
              </div>
              <button
                onClick={() => handleClaim(v.id)}
                disabled={claimingId !== null}
                className="px-4 py-2 bg-indigo-500 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {claimingId === v.id ? t("common.loading") : t("voucher.claim")}
              </button>
            </div>
          ))
        )}
      </div>
    </Modal>
  );
};
