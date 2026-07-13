-- Dummy QRIS toggle untuk Admin Panel > Monitor Premium.
--
-- Tujuan: memungkinkan admin menguji alur pembelian premium (create
-- transaction -> tampil QR -> polling status -> sukses -> akun jadi premium)
-- tanpa memanggil gateway KlikQRIS sungguhan, sebelum fitur premium
-- diperkenalkan ke publik. Kalau aktif, api/premium/payment.ts (method POST)
-- akan membuat QR palsu (is_sandbox = true) dan api/premium/payment.ts (method GET) akan
-- otomatis menandai transaksi tersebut SUCCESS setelah beberapa detik,
-- tanpa pernah menyentuh API KlikQRIS asli.
--
-- Disimpan di tabel app_settings yang sudah ada (bukan tabel baru) supaya
-- tetap konsisten dengan pola premium_base_price, dan policy RLS generik
-- di app_settings (select untuk semua authenticated, update hanya
-- admin/owner) otomatis berlaku untuk key ini juga -- tidak perlu migration
-- RLS baru.
insert into app_settings (
  key,
  value
)
values (
  'dummy_qris_enabled',
  'false'
)
on conflict (key) do nothing;
