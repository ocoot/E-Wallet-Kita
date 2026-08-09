import { supabase } from "../lib/supabase";
import { PremiumVoucher } from "../types";

// Catatan: getClaimedVoucher, claimVoucher, dan revokeVoucher (versi hook)
// sudah dihapus per audit -- tidak ada satupun call site di seluruh repo
// (revokeVoucher di AdminVoucherManager.tsx adalah fungsi lokal terpisah,
// tidak terhubung ke hook ini). Tabel `user_voucher_claims` beserta RLS
// policy-nya tetap dipertahankan di database sebagai fondasi kalau fitur
// klaim-per-user ini suatu saat benar-benar dibangun.
export const useVoucher = () => {
  const getActiveVouchers = async (): Promise<PremiumVoucher[]> => {
    const { data, error } = await supabase
      .from("premium_vouchers")
      .select("*")
      .eq("is_active", true)
      .is("revoked_at", null);
    if (error) throw error;
    return data || [];
  };

  return { getActiveVouchers };
};
