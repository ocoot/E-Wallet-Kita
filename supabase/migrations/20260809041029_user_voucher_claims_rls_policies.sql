-- Fix: RLS sudah ON di user_voucher_claims (sejak migration
-- 20260626000000_premium_voucher_system.sql) tapi belum ada policy sama
-- sekali -> default deny-all untuk role authenticated. Ini membuat
-- claimVoucher() dan getClaimedVoucher() di src/hooks/useVoucher.ts gagal
-- untuk user biasa (RLS ON + 0 policy = semua akses ditolak, bukan diizinkan).

CREATE POLICY user_voucher_claims_select ON public.user_voucher_claims
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('owner','admin')
    )
  );

CREATE POLICY user_voucher_claims_insert ON public.user_voucher_claims
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY user_voucher_claims_delete ON public.user_voucher_claims
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('owner','admin')
    )
  );
