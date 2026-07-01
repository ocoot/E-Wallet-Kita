-- Migration: Saldo Terakumulasi (Accumulated Balance) RPC
-- Date: 2026-07-31
-- Root cause / why:
--   Dashboard sebelumnya hanya menghitung income/expense/balance untuk BULAN
--   BERJALAN (lihat Dashboard.tsx: dbService.getTransactions(userId, currentMonthPrefix)).
--   User tidak bisa langsung melihat total saldo mereka yang sesungguhnya
--   (akumulasi dari seluruh bulan sebelumnya + bulan ini), sehingga harus
--   menjumlahkan manual dari riwayat transaksi. Fitur ini menambahkan RPC
--   agregat ringan (SUM di server, bukan fetch semua baris transaksi ke
--   client) untuk menghitung saldo terakumulasi sampai tanggal tertentu.
--
-- SECURITY INVOKER + tanpa parameter user_id: RLS "auth.uid() = user_id"
-- pada tabel transactions otomatis membatasi hasil ke milik user yang
-- memanggil, jadi tidak perlu p_user_id maupun role-check manual.
CREATE OR REPLACE FUNCTION public.get_accumulated_balance(
    p_as_of_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
    income_total NUMERIC,
    expense_total NUMERIC,
    balance NUMERIC,
    first_transaction_date DATE
)
SECURITY INVOKER
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'income'), 0)  AS income_total,
        COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'expense'), 0) AS expense_total,
        COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'income'), 0)
            - COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'expense'), 0) AS balance,
        MIN(t.transaction_date) AS first_transaction_date
    FROM public.transactions t
    WHERE t.user_id = auth.uid()
      AND t.transaction_date <= p_as_of_date;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_accumulated_balance(DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_accumulated_balance(DATE) TO authenticated;
