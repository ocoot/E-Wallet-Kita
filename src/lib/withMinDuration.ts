/**
 * Membungkus sebuah promise supaya resolve tidak lebih cepat dari `ms`.
 *
 * Dipakai untuk aksi yang secara teknis sangat cepat (single insert/update
 * ke Supabase, biasanya < 200ms) tapi butuh terasa "diproses" secara UX --
 * supaya aplikasi finansial ini tidak terasa instan/murahan saat
 * menyimpan transaksi, top up, transfer, edit saldo, dll.
 *
 * Error dari `promise` tetap dilempar apa adanya (tidak ditelan),
 * hanya waktu resolve-nya saja yang dijamin minimal `ms`.
 */
export async function withMinDuration<T>(promise: Promise<T>, ms = 1000): Promise<T> {
  const delay = new Promise<void>((resolve) => setTimeout(resolve, ms));
  const [result] = await Promise.all([promise, delay]);
  return result;
}
