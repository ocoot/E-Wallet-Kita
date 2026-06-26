-- Migration: Auto-catat transaksi saat Tandai Lunas (Bill Reminders -> Transactions)
-- Date: 2026-07-10
-- Root cause / why:
--   Sebelumnya tombol "Tandai Lunas" (web & bot Telegram) HANYA mengubah
--   bill_reminders.is_paid, tidak membuat entri apa pun di transactions --
--   sehingga saldo & riwayat transaksi tidak ikut berubah walau user sudah
--   menandai tagihan lunas. User (lewat permintaan eksplisit) minta supaya
--   "Tandai Lunas" juga otomatis mencatat pengeluaran, agar tidak perlu
--   input manual dua kali (sekali di Bill Reminders, sekali lagi di
--   Transaksi).
--
-- Keputusan desain (dikonfirmasi user, lihat percakapan):
--   1. Kalau bill.amount IS NULL saat user pencet "Tandai Lunas", DITOLAK
--      (RAISE EXCEPTION) -- user wajib isi nominal dulu lewat form edit
--      bill, bukan auto-insert amount 0 atau skip transaksi diam-diam.
--   2. "Tandai Lunas" di UI sebenarnya TOGGLE (lihat handleTogglePaid di
--      BillReminders.tsx: `markBillPaid(user.id, r.id, !r.is_paid)`), bukan
--      tombol satu-arah. Jadi RPC ini juga harus menangani arah sebaliknya
--      ("Batal Lunas" / undo): saat is_paid TRUE -> FALSE, transaksi yang
--      tadinya dibuat IKUT DIHAPUS (bukan dibiarkan).
--   3. transactions.source ditambah value baru 'bill_payment' (CHECK
--      constraint diperluas) -- keputusan eksplisit user supaya asal
--      transaksi jelas ketika diaudit, bukan disamarkan sebagai 'manual'.
--   4. bill_reminders.linked_transaction_id (baru, nullable, FK ke
--      transactions.id ON DELETE SET NULL) -- supaya saat undo, RPC tahu
--      PERSIS transaksi mana yang harus dihapus (bukan menebak dari
--      amount/tanggal/kategori yang berisiko salah hapus transaksi lain
--      yang kebetulan mirip).
--   5. Satu RPC inti (set_bill_paid_status) dipakai oleh DUA wrapper tipis:
--      - toggle_bill_paid_web(p_bill_id, p_mark_paid) -> dipanggil frontend
--        (authenticated role), validasi pemilik lewat auth.uid().
--      - mark_bill_paid_via_bot(p_chat_id, p_bill_id) DIGANTI (CREATE OR
--        REPLACE, signature sama) supaya tombol Telegram juga lewat jalur
--        yang sama -- TIDAK ada toggle "batal lunas" dari bot (sesuai
--        permintaan awal: bot cuma untuk menandai lunas, bukan undo;
--        undo tetap lewat web seperti sebelumnya).
--   6. Transaction_date pakai tanggal LOKAL user (users.timezone), konsisten
--      dengan insert_telegram_transaction() yang sudah ada.

-- ─────────────────────────────────────────────────────────────
-- 1. Perluas CHECK constraint transactions.source (tambah 'bill_payment')
--    Postgres tidak punya "ALTER CHECK", jadi drop lalu re-create constraint
--    dengan nama yang sama persis (idempotent: DROP IF EXISTS dulu).
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_source_check;
ALTER TABLE public.transactions
    ADD CONSTRAINT transactions_source_check
    CHECK (source IN ('manual', 'ai_web', 'telegram', 'bill_payment'));

-- ─────────────────────────────────────────────────────────────
-- 2. Kolom baru: link ke transaksi yang dibuat otomatis dari bill ini,
--    supaya undo ("Batal Lunas") tahu transaksi mana yang harus dihapus.
--    ON DELETE SET NULL: kalau transaksinya dihapus manual oleh user dari
--    halaman Riwayat Transaksi (di luar alur bill), bill TIDAK ikut error,
--    cukup link-nya jadi NULL (bill tetap is_paid=true, hanya histori
--    transaksinya yang hilang -- itu pilihan user kalau hapus manual).
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.bill_reminders
    ADD COLUMN IF NOT EXISTS linked_transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL;

-- ─────────────────────────────────────────────────────────────
-- 3. RPC inti: set status lunas/belum + insert/delete transaksi terkait.
--    SECURITY DEFINER, tapi p_user_id WAJIB diisi oleh caller (wrapper di
--    bawah), fungsi ini sendiri TIDAK pernah dipanggil langsung oleh
--    client (lihat REVOKE di akhir) supaya tidak ada jalan untuk
--    memalsukan p_user_id dari luar.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_bill_paid_status(
    p_user_id  UUID,
    p_bill_id  UUID,
    p_mark_paid BOOLEAN
)
RETURNS TABLE (
    id UUID,
    name TEXT,
    is_paid BOOLEAN,
    paid_at TIMESTAMPTZ,
    linked_transaction_id UUID
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    v_bill RECORD;
    v_timezone TEXT;
    v_local_date DATE;
    v_new_tx_id UUID;
BEGIN
    SELECT * INTO v_bill FROM public.bill_reminders WHERE id = p_bill_id AND user_id = p_user_id;
    IF v_bill IS NULL THEN
        RAISE EXCEPTION 'Bill % not found for this user', p_bill_id;
    END IF;

    -- Tidak ada perubahan state -- no-op, kembalikan kondisi saat ini.
    IF v_bill.is_paid = p_mark_paid THEN
        RETURN QUERY SELECT v_bill.id, v_bill.name, v_bill.is_paid, v_bill.paid_at, v_bill.linked_transaction_id;
        RETURN;
    END IF;

    IF p_mark_paid THEN
        -- Tandai Lunas: WAJIB ada amount (keputusan eksplisit -- tidak
        -- auto-insert amount 0, tidak skip transaksi diam-diam).
        IF v_bill.amount IS NULL THEN
            RAISE EXCEPTION 'BILL_AMOUNT_REQUIRED';
        END IF;

        SELECT u.timezone INTO v_timezone FROM public.users u WHERE u.id = p_user_id;
        v_local_date := (NOW() AT TIME ZONE public.safe_user_timezone(v_timezone))::DATE;

        INSERT INTO public.transactions (user_id, type, category, amount, note, source, transaction_date)
        VALUES (
            p_user_id,
            'expense',
            v_bill.category_key,
            v_bill.amount,
            v_bill.name,
            'bill_payment',
            v_local_date
        )
        RETURNING transactions.id INTO v_new_tx_id;

        UPDATE public.bill_reminders
        SET is_paid = TRUE,
            paid_at = NOW(),
            linked_transaction_id = v_new_tx_id,
            updated_at = NOW()
        WHERE bill_reminders.id = p_bill_id;
    ELSE
        -- Batal Lunas (undo): hapus transaksi yang dulu ditautkan, kalau
        -- masih ada (mungkin sudah dihapus manual oleh user -> linked_transaction_id
        -- sudah NULL lewat ON DELETE SET NULL, dalam hal itu cukup reset status).
        IF v_bill.linked_transaction_id IS NOT NULL THEN
            DELETE FROM public.transactions
            WHERE id = v_bill.linked_transaction_id AND user_id = p_user_id;
        END IF;

        UPDATE public.bill_reminders
        SET is_paid = FALSE,
            paid_at = NULL,
            linked_transaction_id = NULL,
            updated_at = NOW()
        WHERE bill_reminders.id = p_bill_id;
    END IF;

    RETURN QUERY
    SELECT b.id, b.name, b.is_paid, b.paid_at, b.linked_transaction_id
    FROM public.bill_reminders b
    WHERE b.id = p_bill_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_bill_paid_status(UUID, UUID, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_bill_paid_status(UUID, UUID, BOOLEAN) TO service_role;

-- ─────────────────────────────────────────────────────────────
-- 4. Wrapper untuk WEB: dipanggil oleh dbService.markBillPaid (frontend),
--    role 'authenticated', validasi pemilik lewat auth.uid() di dalam DB
--    (tidak percaya p_user_id dari client sama sekali -- makanya tidak ada
--    parameter user_id di wrapper ini).
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.toggle_bill_paid_web(
    p_bill_id UUID,
    p_mark_paid BOOLEAN
)
RETURNS TABLE (
    id UUID,
    name TEXT,
    is_paid BOOLEAN,
    paid_at TIMESTAMPTZ,
    linked_transaction_id UUID
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;
    RETURN QUERY SELECT * FROM public.set_bill_paid_status(auth.uid(), p_bill_id, p_mark_paid);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.toggle_bill_paid_web(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.toggle_bill_paid_web(UUID, BOOLEAN) TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- 5. Wrapper untuk BOT TELEGRAM: ganti isi mark_bill_paid_via_bot (dibuat
--    di migration 20260709000000) supaya lewat set_bill_paid_status juga,
--    PARAMETER tetap sama (p_chat_id, p_bill_id) jadi api/telegram-webhook.ts
--    & Edge Function tidak perlu ubah cara panggil -- tapi kolom RETURNS
--    TABLE bertambah (amount), dan Postgres tidak mengizinkan
--    CREATE OR REPLACE mengubah shape RETURNS TABLE suatu fungsi, jadi
--    DROP dulu secara eksplisit (idempotent, ikut §7.4 master prompt:
--    DROP FUNCTION IF EXISTS sebelum re-create dengan signature/shape baru).
--    Bot HANYA bisa menandai lunas (p_mark_paid=TRUE), tidak ada alur undo
--    dari bot (sesuai cakupan awal permintaan).
-- ─────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.mark_bill_paid_via_bot(BIGINT, UUID);

CREATE OR REPLACE FUNCTION public.mark_bill_paid_via_bot(
    p_chat_id BIGINT,
    p_bill_id UUID
)
RETURNS TABLE (
    id UUID,
    name TEXT,
    is_paid BOOLEAN,
    paid_at TIMESTAMPTZ,
    amount NUMERIC
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    v_user_id UUID;
BEGIN
    SELECT u.id INTO v_user_id FROM public.users u WHERE u.telegram_chat_id = p_chat_id LIMIT 1;

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'User not found for telegram_chat_id %', p_chat_id;
    END IF;

    RETURN QUERY
    SELECT r.id, r.name, r.is_paid, r.paid_at, b.amount
    FROM public.set_bill_paid_status(v_user_id, p_bill_id, TRUE) r
    JOIN public.bill_reminders b ON b.id = r.id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_bill_paid_via_bot(BIGINT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_bill_paid_via_bot(BIGINT, UUID) TO service_role;

COMMENT ON FUNCTION public.set_bill_paid_status IS
    'Sumber kebenaran tunggal untuk alur Tandai Lunas/Batal Lunas (web & bot), termasuk insert/delete transaksi terkait. Jangan duplikasi logic ini di tempat lain -- tambah wrapper baru kalau perlu jalur masuk baru.';
