import { useState, useEffect, useCallback } from "react";
import { dbService } from "../lib/db";
import { GoldPocket, GoldHoldingsSummary, GoldBrand } from "../types";
import { reportFrontendError } from "../lib/errorReporter";

export interface GoldPriceRow {
  brand: GoldBrand;
  sell_price_per_gram: number;
  // Nullable sejak migration 20260803020000_allow_null_buyback_price.sql --
  // sumber harga (iamutaki) tidak selalu punya data buyback untuk brand
  // tertentu. Runtime sudah aman (GoldSavings.tsx sudah cek `!!price?.buyback_price_per_gram`),
  // ini cuma menyelaraskan tipe supaya TypeScript ikut menangkap kasusnya.
  buyback_price_per_gram: number | null;
  price_date: string;
  fetched_at: string;
  // Harga hari sebelumnya (brand yang sama), dipakai untuk indikator ↑↓ di
  // GoldSavings.tsx. `null` kalau brand baru pertama kali sync.
  prev_sell_price_per_gram: number | null;
  prev_buyback_price_per_gram: number | null;
  prev_price_date: string | null;
}

/**
 * Mengambil semua pos tabungan emas milik user + ringkasan agregat + harga
 * terbaru tiap brand.
 *
 * Catatan akuntansi (update: lihat migration
 * 20260814000000_decouple_gold_simulation_from_balance.sql): Beli/Jual
 * emas TIDAK LAGI memotong/menambah "Saldo Tersedia" -- murni simulasi.
 * `summary.total_cash_locked` cuma basis hitung Untung/Rugi
 * (`summary.unrealized_gain_loss`), bukan pengurang saldo dompet manapun.
 * "Saldo Tersedia" per pos dompet sekarang HANYA dikurangi dana Tabungan
 * riil (savings_pockets), dihitung server-side di get_wallets_with_balance().
 */
export function useGoldSavings(userId: string | undefined) {
  const [pockets, setPockets] = useState<GoldPocket[]>([]);
  const [summary, setSummary] = useState<GoldHoldingsSummary>({
    total_grams: 0,
    total_cash_locked: 0,
    total_market_value: 0,
    unrealized_gain_loss: 0,
    pocket_count: 0,
    stale_pocket_count: 0
  });
  const [prices, setPrices] = useState<GoldPriceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async () => {
    if (!userId) {
      setPockets([]);
      setPrices([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [pocketsRes, summaryRes, pricesRes] = await Promise.all([
        dbService.getGoldPockets(userId),
        dbService.getGoldHoldingsSummary(),
        dbService.getLatestGoldPrices()
      ]);

      setPockets(pocketsRes);
      setSummary(summaryRes);
      setPrices(pricesRes as GoldPriceRow[]);
    } catch (err) {
      console.error("useGoldSavings error:", err);
      void reportFrontendError({
        source: "frontend:gold-savings",
        message: err instanceof Error ? err.message : String(err),
        context: { fn: "useGoldSavings.load" },
      });
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  return { pockets, summary, prices, loading, error, refresh: load };
}
