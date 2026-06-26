-- Root cause: get_admin_revenue_metrics() menghitung SEMUA baris di
-- premium_transactions tanpa memfilter is_sandbox. Ini sudah berpotensi
-- salah sebelumnya (kolom is_sandbox sudah ada sejak migration premium
-- pertama), tapi sekarang jadi penting untuk diperbaiki karena fitur
-- toggle "Dummy QRIS" di Admin Panel > Monitor Premium akan membuat
-- transaksi is_sandbox = true berstatus SUCCESS secara rutin untuk
-- keperluan testing -- tanpa fix ini, transaksi dummy akan ikut tercampur
-- ke Total Pendapatan & hitungan status di dashboard admin.
--
-- Fix: angka utama (totalRevenue, totalTransactions, successCount,
-- pendingCount, expiredCount, failedCount) sekarang hanya menghitung
-- transaksi live (is_sandbox = false). Ditambahkan field baru
-- 'sandboxCount' (jumlah transaksi dummy, status apa pun) supaya admin
-- tetap bisa melihat ada aktivitas testing tanpa mencampurnya ke angka
-- revenue asli.
CREATE OR REPLACE FUNCTION public.get_admin_revenue_metrics()
RETURNS JSON
SECURITY DEFINER
SET search_path = public
LANGUAGE sql
AS $$
  SELECT json_build_object(
    'totalRevenue',      COALESCE(SUM(total_amount) FILTER (WHERE status = 'SUCCESS' AND is_sandbox = false), 0),
    'totalTransactions', COUNT(*) FILTER (WHERE is_sandbox = false),
    'successCount',      COUNT(*) FILTER (WHERE status = 'SUCCESS' AND is_sandbox = false),
    'pendingCount',      COUNT(*) FILTER (WHERE status = 'PENDING' AND is_sandbox = false),
    'expiredCount',      COUNT(*) FILTER (WHERE status = 'EXPIRED' AND is_sandbox = false),
    'failedCount',       COUNT(*) FILTER (WHERE status = 'FAILED' AND is_sandbox = false),
    'sandboxCount',      COUNT(*) FILTER (WHERE is_sandbox = true)
  )
  FROM public.premium_transactions;
$$;
