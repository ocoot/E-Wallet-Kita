import { useState, useEffect, useCallback } from "react";
import { dbService } from "../lib/db";
import { SavingsPocket, SavingsSummary } from "../types";
import { reportFrontendError } from "../lib/errorReporter";

export interface SavingsPocketWithProgress extends SavingsPocket {
  /** 0-100, null kalau pocket tidak punya target_amount */
  progressPercent: number | null;
}

/**
 * Mengambil semua pos tabungan milik user + ringkasan total tersimpan.
 * "Saldo Tersedia" (spendable) dihitung di pemanggil dengan:
 *   accumulatedBalance.balance - summary.total_saved
 * karena getAccumulatedBalance() ada di hook/context terpisah (Dashboard).
 */
export function useSavings(userId: string | undefined) {
  const [pockets, setPockets] = useState<SavingsPocketWithProgress[]>([]);
  const [summary, setSummary] = useState<SavingsSummary>({ total_saved: 0, pocket_count: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async () => {
    if (!userId) {
      setPockets([]);
      setSummary({ total_saved: 0, pocket_count: 0 });
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [raw, summaryRes] = await Promise.all([
        dbService.getSavingsPockets(userId),
        dbService.getSavingsSummary()
      ]);

      const enriched: SavingsPocketWithProgress[] = raw.map((p) => ({
        ...p,
        progressPercent: p.target_amount
          ? Math.min(100, Math.round((p.current_amount / p.target_amount) * 100))
          : null
      }));

      setPockets(enriched);
      setSummary(summaryRes);
    } catch (err) {
      console.error("useSavings error:", err);
      void reportFrontendError({
        source: "frontend:savings",
        message: err instanceof Error ? err.message : String(err),
        context: { fn: "useSavings.load" },
      });
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  return { pockets, summary, loading, error, refresh: load };
}
