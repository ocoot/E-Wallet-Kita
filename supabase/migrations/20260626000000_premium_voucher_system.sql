-- Migration: Add Premium Voucher System
-- Date: 2026-06-26

CREATE TABLE IF NOT EXISTS public.premium_vouchers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code text NOT NULL UNIQUE,
    discount_percent integer NOT NULL CHECK (discount_percent > 0 AND discount_percent <= 100),
    created_by uuid REFERENCES public.users(id),
    is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT now(),
    revoked_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.user_voucher_claims (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    voucher_id uuid NOT NULL REFERENCES public.premium_vouchers(id),
    user_id uuid NOT NULL REFERENCES public.users(id),
    claimed_at timestamptz DEFAULT now(),
    UNIQUE(voucher_id, user_id)
);

ALTER TABLE public.premium_transactions ADD COLUMN IF NOT EXISTS voucher_id uuid REFERENCES public.premium_vouchers(id);
ALTER TABLE public.premium_transactions ADD COLUMN IF NOT EXISTS discount_percent integer;
ALTER TABLE public.premium_transactions ADD COLUMN IF NOT EXISTS discount_amount integer;
ALTER TABLE public.premium_transactions ADD COLUMN IF NOT EXISTS final_amount integer;
