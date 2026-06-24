import { supabase } from "../lib/supabase";
import { PremiumVoucher, UserVoucherClaim } from "../types";

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

  const getClaimedVoucher = async (userId: string): Promise<UserVoucherClaim | null> => {
    const { data, error } = await supabase
      .from("user_voucher_claims")
      .select("*, premium_vouchers(*)")
      .eq("user_id", userId)
      .order("claimed_at", { ascending: false })
      .limit(1)
      .single();
    if (error && error.code !== "PGRST116") throw error;
    return data || null;
  };

  const claimVoucher = async (voucherId: string, userId: string): Promise<void> => {
    const { error } = await supabase
      .from("user_voucher_claims")
      .insert({ voucher_id: voucherId, user_id: userId });
    if (error) throw error;
  };

  const revokeVoucher = async (voucherId: string): Promise<void> => {
    const { error } = await supabase
      .from("premium_vouchers")
      .update({ is_active: false, revoked_at: new Date().toISOString() })
      .eq("id", voucherId);
    if (error) throw error;
  };

  return { getActiveVouchers, getClaimedVoucher, claimVoucher, revokeVoucher };
};
