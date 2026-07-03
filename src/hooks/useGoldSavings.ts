import { useState, useEffect, useCallback } from "react";
import { dbService } from "../lib/db";
import { GoldPocket, GoldHoldingsSummary, GoldBrand } from "../types";

export interface GoldPriceRow {
  brand: GoldBrand;
  sell_price_per_gram: number;
  buyback_price_per_gram: number;
  price_date: string;
  fetched_at: string;
}

/**
 * Mengambil semua pos tabungan emas milik user + ringkasan agregat + harga
 * terbaru tiap brand. "Saldo Tersedia" (spendable) dihitung di pemanggil
 * dengan: accumulatedBalance.balance - savingsSummary.total_saved -
 * goldSummary.total_cash_locked (lihat catatan akuntansi di migration
 * 20260803000000_gold_savings.sql).
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

  const load = useCallback(async () => {
    if (!userId) {
      setPockets([]);
      setPrices([]);
      setLoading(false);
      return;
    }
    setLoading(true);
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
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  return { pockets, summary, prices, loading, refresh: load };
}
