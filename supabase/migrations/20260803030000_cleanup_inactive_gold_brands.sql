-- Bersihkan baris gold_prices untuk brand yang sudah tidak lagi disinkron
-- gold-price-sync (cakupan dipersempit ke antam, pegadaian, ubs, galeri24).
-- Root cause laporan user: strip harga di halaman Tabungan Emas masih
-- menampilkan Hartadinata Abadi / Sampoerna Gold / Logam Mulia -- itu baris
-- lama dari sebelum cakupan dipersempit, edge function tidak pernah
-- menghapusnya, cuma berhenti meng-upsert-nya. Sudah difilter juga di
-- frontend (db.ts getLatestGoldPrices, lihat ACTIVE_GOLD_BRANDS di
-- types.ts) -- DELETE ini pelengkap defense-in-depth di level data, supaya
-- tidak membingungkan kalau ada yang query tabel ini langsung.
--
-- CATATAN: TIDAK menghapus gold_pockets/gold_pocket_entries brand-brand
-- itu (kalau ada) -- kalau user pernah bikin pos dengan brand di luar 4
-- ini, pos & riwayatnya tetap aman, cuma harga referensinya saja yang
-- tidak lagi diperbarui otomatis (staleness guard akan memblokir
-- transaksi baru untuk pos itu, sesuai desain).

DELETE FROM public.gold_prices
WHERE brand NOT IN ('antam', 'pegadaian', 'ubs', 'galeri24');
