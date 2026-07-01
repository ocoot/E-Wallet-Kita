-- Migration: Self-Service Account Deletion (Privacy & Data Controls)
-- Date: 2026-07-31
-- Root cause / why:
--   Sebelumnya satu-satunya cara menghapus/mengelola akun user adalah lewat
--   Admin Panel (ban / role management), tidak ada cara bagi user sendiri
--   untuk menghapus akunnya sendiri beserta seluruh data pribadinya. Untuk
--   aplikasi finansial yang menyimpan data sensitif (termasuk hasil OCR
--   struk belanja), kepercayaan user terhadap kontrol atas datanya sendiri
--   penting. Fitur "Ekspor Data" ditangani di layer API (query read-only
--   per tabel dengan service role, difilter user_id yang sudah diverifikasi
--   dari JWT) sehingga tidak butuh RPC baru. Fitur "Hapus Akun" butuh RPC
--   karena tabel public.users TIDAK memiliki policy RLS DELETE sama sekali
--   (lihat 20260620000000_init.sql -- hanya SELECT/UPDATE/INSERT), jadi
--   harus lewat SECURITY DEFINER yang hanya bisa dipanggil oleh service_role
--   (backend API), setelah backend API memverifikasi identitas lewat JWT.
--
-- Desain:
--   - delete_own_account_data(p_user_id) menghapus semua data di skema
--     public yang terkait user tsb, dalam satu transaksi (body function
--     plpgsql otomatis transactional).
--   - Sebagian besar tabel sudah punya ON DELETE CASCADE ke public.users
--     (transactions, budgets, bill_reminders, bill_reminder_notifications,
--     receipt_drafts, installments, api_rate_limits, telegram_link_codes,
--     premium_transactions), jadi cukup dihapus lewat DELETE FROM
--     public.users di akhir.
--   - user_voucher_claims.user_id TIDAK punya ON DELETE action (default
--     NO ACTION/RESTRICT) -- lihat 20260626000000_premium_voucher_system.sql
--     -- jadi harus dihapus manual dulu, atau DELETE FROM users akan gagal
--     dengan FK violation kalau user pernah klaim voucher.
--   - telegram_pending_transactions di-keyed oleh chat_id (bukan user_id),
--     jadi dibersihkan manual berdasarkan telegram_chat_id user sebelum
--     kolom itu ikut terhapus.
--   - Baris di auth.users (dan tabel yang FK ke auth.users seperti
--     support_sessions & user_push_tokens) TIDAK dihapus di sini -- itu
--     tanggung jawab backend API lewat supabase.auth.admin.deleteUser(),
--     yang dipanggil SETELAH RPC ini sukses (lihat api/account/privacy.ts).

CREATE OR REPLACE FUNCTION public.delete_own_account_data(p_user_id UUID)
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    v_chat_id BIGINT;
BEGIN
    IF p_user_id IS NULL THEN
        RETURN FALSE;
    END IF;

    SELECT u.telegram_chat_id INTO v_chat_id FROM public.users u WHERE u.id = p_user_id;

    -- Tabel tanpa ON DELETE CASCADE yang mengacu ke public.users(id):
    DELETE FROM public.user_voucher_claims WHERE user_id = p_user_id;

    -- Draft transaksi Telegram sementara, keyed by chat_id bukan user_id:
    IF v_chat_id IS NOT NULL THEN
        DELETE FROM public.telegram_pending_transactions WHERE chat_id = v_chat_id;
    END IF;

    -- Baris admin_audit_logs & premium_vouchers.created_by sudah
    -- ON DELETE SET NULL, jadi tidak perlu ditangani manual di sini.

    -- Menghapus baris users akan cascade ke: transactions, budgets,
    -- bill_reminders, bill_reminder_notifications, receipt_drafts,
    -- installments, api_rate_limits, telegram_link_codes, premium_transactions.
    DELETE FROM public.users WHERE id = p_user_id;

    RETURN TRUE;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.delete_own_account_data(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_own_account_data(UUID) TO service_role;
