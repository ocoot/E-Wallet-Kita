-- Migration: Profile birth date + wallet-linked contact numbers
-- Date: 2026-08-29
-- Description:
--   1. Tambah kolom `birth_date` di public.users (opsional) -- dipakai untuk
--      menampilkan penanda "Ulang Tahun Anda" di halaman Kalender (CalendarPage.tsx),
--      mirip penanda hari libur nasional yang sudah ada.
--   2. Tambah kolom `phone_wallet_id` & `bank_wallet_id` di public.users --
--      BUKAN kolom nomor telepon/rekening baru yang berdiri sendiri.
--      Sesuai keputusan produk (live sync, read-only di halaman Profil),
--      profil hanya menyimpan REFERENSI ke pos dompet mana yang jadi
--      "sumber kebenaran" nomor HP (pos bertipe 'ewallet') dan nomor
--      rekening (pos bertipe 'bank'). Nomor aktualnya SELALU dibaca dari
--      wallets.phone_number / wallets.account_number pada saat itu juga --
--      begitu nomor di pos dompet diubah lewat halaman Pos Dompet, profil
--      otomatis ikut berubah tanpa perlu disalin ulang secara manual.
--   3. Trigger validasi: pastikan wallet yang direferensikan benar-benar
--      milik user yang sama DAN bertipe sesuai (ewallet untuk
--      phone_wallet_id, bank untuk bank_wallet_id) -- mencegah user
--      (secara tidak sengaja lewat bug frontend, atau sengaja lewat request
--      manual) menaut ke pos dompet milik user lain atau tipe yang salah.

-- 1. birth_date
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS birth_date DATE;

-- 2. Referensi pos dompet untuk nomor HP & nomor rekening
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS phone_wallet_id UUID REFERENCES public.wallets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS bank_wallet_id UUID REFERENCES public.wallets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_users_phone_wallet_id ON public.users(phone_wallet_id);
CREATE INDEX IF NOT EXISTS idx_users_bank_wallet_id ON public.users(bank_wallet_id);

-- 3. Trigger validasi kepemilikan & tipe pos dompet yang ditaut
CREATE OR REPLACE FUNCTION public.validate_user_contact_wallet_links()
RETURNS TRIGGER AS $$
DECLARE
  v_wallet public.wallets%ROWTYPE;
BEGIN
  IF NEW.phone_wallet_id IS NOT NULL THEN
    SELECT * INTO v_wallet FROM public.wallets WHERE id = NEW.phone_wallet_id;
    IF NOT FOUND OR v_wallet.user_id <> NEW.id THEN
      RAISE EXCEPTION 'phone_wallet_id harus menunjuk ke pos dompet milik user yang sama';
    END IF;
    IF v_wallet.type <> 'ewallet' THEN
      RAISE EXCEPTION 'phone_wallet_id harus menunjuk ke pos dompet bertipe ewallet';
    END IF;
  END IF;

  IF NEW.bank_wallet_id IS NOT NULL THEN
    SELECT * INTO v_wallet FROM public.wallets WHERE id = NEW.bank_wallet_id;
    IF NOT FOUND OR v_wallet.user_id <> NEW.id THEN
      RAISE EXCEPTION 'bank_wallet_id harus menunjuk ke pos dompet milik user yang sama';
    END IF;
    IF v_wallet.type <> 'bank' THEN
      RAISE EXCEPTION 'bank_wallet_id harus menunjuk ke pos dompet bertipe bank';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_validate_user_contact_wallet_links ON public.users;
CREATE TRIGGER trg_validate_user_contact_wallet_links
  BEFORE INSERT OR UPDATE OF phone_wallet_id, bank_wallet_id ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_user_contact_wallet_links();

-- 4. RPC kecil untuk update ketiga field ini sekaligus dari halaman Profil --
--    dipanggil lewat supabase.rpc supaya trigger validasi di atas selalu
--    ikut jalan (update langsung lewat .from('users').update() juga tetap
--    kena trigger karena BEFORE UPDATE, tapi RPC ini mempermudah frontend
--    mengirim "kosongkan" secara eksplisit tanpa ambigu dengan "tidak diubah").
CREATE OR REPLACE FUNCTION public.update_profile_contact_details(
  p_user_id UUID,
  p_birth_date DATE,
  p_clear_birth_date BOOLEAN DEFAULT FALSE,
  p_phone_wallet_id UUID DEFAULT NULL,
  p_clear_phone_wallet_id BOOLEAN DEFAULT FALSE,
  p_bank_wallet_id UUID DEFAULT NULL,
  p_clear_bank_wallet_id BOOLEAN DEFAULT FALSE
)
RETURNS VOID AS $$
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Tidak diizinkan mengubah profil user lain';
  END IF;

  UPDATE public.users
  SET
    birth_date = CASE WHEN p_clear_birth_date THEN NULL WHEN p_birth_date IS NOT NULL THEN p_birth_date ELSE birth_date END,
    phone_wallet_id = CASE WHEN p_clear_phone_wallet_id THEN NULL WHEN p_phone_wallet_id IS NOT NULL THEN p_phone_wallet_id ELSE phone_wallet_id END,
    bank_wallet_id = CASE WHEN p_clear_bank_wallet_id THEN NULL WHEN p_bank_wallet_id IS NOT NULL THEN p_bank_wallet_id ELSE bank_wallet_id END
  WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.update_profile_contact_details(UUID, DATE, BOOLEAN, UUID, BOOLEAN, UUID, BOOLEAN) TO authenticated;
