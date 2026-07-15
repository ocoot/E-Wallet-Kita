-- Migration: Perbaiki ensure_general_wallet() jadi atomic (tutup race condition)
-- Date: 2026-08-15
-- Description:
--   Audit tanggal 2026-07-15 menemukan 2 baris wallet bertipe 'general' untuk
--   1 user (id 7081e8fb... dan 89a0b61b...), padahal wallets_one_general_per_user
--   (unique index partial WHERE type='general') seharusnya mencegah ini.
--
--   Root cause: index unique-nya ternyata tidak pernah berhasil dibuat di DB
--   live (terverifikasi lewat pg_indexes -- 0 baris kembali), jadi tidak ada
--   yang menutup race condition di ensure_general_wallet(). Fungsi versi lama
--   memakai pola SELECT dulu baru INSERT kalau NULL -- TIDAK atomic. Kalau web
--   app dan bot Telegram memanggil fungsi ini nyaris bersamaan (mis. user
--   mencatat transaksi lewat web tepat saat bot Telegram sedang sinkron),
--   keduanya bisa sama-sama melihat "belum ada general wallet" lalu sama-sama
--   INSERT, menghasilkan 2 baris general wallet dengan saldo yang pecah.
--
--   Duplikat yang sudah ada sudah dibereskan manual lewat SQL Editor (transaksi
--   dipindah ke wallet asli, wallet duplikat dihapus) dan unique index-nya
--   sudah dibuat ulang secara manual. Migration ini fokus ke root cause di
--   level fungsi supaya race condition yang sama tidak berulang di masa depan,
--   dan supaya kalau race tetap terjadi, hasilnya "sembuh sendiri" (tetap 1
--   wallet, tidak ada error yang bocor ke user) alih-alih gagal total.
--
--   Perubahan:
--     1. Pastikan unique index wallets_one_general_per_user ada (idempotent --
--        aman dijalankan meski sudah dibuat manual sebelumnya).
--     2. ensure_general_wallet() sekarang pakai INSERT ... ON CONFLICT ...
--        DO NOTHING yang mengacu ke index partial itu, dengan fallback SELECT
--        kalau ternyata baris general sudah ada (dibuat oleh request lain yang
--        menang race). Satu round-trip DB, tidak ada window antara "cek" dan
--        "insert" seperti versi lama.

-- 1. Pastikan unique index ada (idempotent, jaring pengaman kalau migration
--    ini dijalankan di environment yang belum pernah kena fix manual) --------
CREATE UNIQUE INDEX IF NOT EXISTS wallets_one_general_per_user
    ON public.wallets (user_id)
    WHERE type = 'general';

-- 2. ensure_general_wallet(): versi atomic ------------------------------------
CREATE OR REPLACE FUNCTION public.ensure_general_wallet(p_user_id UUID)
RETURNS UUID
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    v_wallet_id UUID;
BEGIN
    -- Coba insert langsung. Kalau ada request lain yang barusan menang race
    -- dan sudah insert general wallet duluan, ON CONFLICT DO NOTHING bikin
    -- statement ini no-op (tidak raise exception) dan v_wallet_id tetap NULL --
    -- ditangani oleh fallback SELECT di bawah, bukan oleh caller.
    INSERT INTO public.wallets (user_id, name, type, starting_balance)
    VALUES (p_user_id, 'Saldo Umum', 'general', 0)
    ON CONFLICT (user_id) WHERE type = 'general' DO NOTHING
    RETURNING id INTO v_wallet_id;

    IF v_wallet_id IS NULL THEN
        SELECT id INTO v_wallet_id FROM public.wallets
        WHERE user_id = p_user_id AND type = 'general'
        LIMIT 1;
    END IF;

    RETURN v_wallet_id;
END;
$$;
