import { useState, useEffect, useCallback } from "react";
import { dbService } from "../lib/db";
import { Installment } from "../types";

export interface InstallmentWithProgress extends Installment {
  /** 0-100, dibulatkan */
  progressPercent: number;
  monthsRemaining: number;
  /** Estimasi tanggal lunas (bulan ke-total_months dari start_date), null kalau sudah lunas */
  estimatedPayoffDate: string | null;
}

function addMonths(dateStr: string, months: number): Date {
  const base = new Date(dateStr + "T00:00:00");
  return new Date(base.getFullYear(), base.getMonth() + months, base.getDate());
}

function toYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Mengambil semua cicilan/utang jangka panjang milik user beserta info
 * progres (persentase, sisa bulan, estimasi tanggal lunas).
 */
export function useInstallments(userId: string | undefined) {
  const [installments, setInstallments] = useState<InstallmentWithProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async () => {
    if (!userId) {
      setInstallments([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const raw = await dbService.getInstallments(userId);

      const enriched: InstallmentWithProgress[] = raw.map((inst) => {
        const progressPercent = inst.total_months > 0
          ? Math.round((inst.months_paid / inst.total_months) * 100)
          : 0;
        const monthsRemaining = Math.max(inst.total_months - inst.months_paid, 0);
        const estimatedPayoffDate = inst.is_completed
          ? null
          : toYMD(addMonths(inst.start_date, inst.total_months));

        return { ...inst, progressPercent, monthsRemaining, estimatedPayoffDate };
      });

      // Sort: belum lunas dulu (paling dekat lunas di atas), lalu yang sudah lunas
      enriched.sort((a, b) => {
        if (a.is_completed !== b.is_completed) return a.is_completed ? 1 : -1;
        return b.progressPercent - a.progressPercent;
      });

      setInstallments(enriched);
    } catch (err) {
      console.error("useInstallments error:", err);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  return { installments, loading, error, refresh: load };
}
