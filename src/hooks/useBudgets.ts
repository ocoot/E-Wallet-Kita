import { useState, useEffect, useCallback } from "react";
import { dbService } from "../lib/db";
import { Budget, Category } from "../types";
import { reportFrontendError } from "../lib/errorReporter";

export type BudgetStatus = "safe" | "warning" | "danger";

export interface BudgetWithProgress extends Budget {
  spent: number;
  percent: number; // 0..100+ (bisa lebih dari 100 kalau over budget)
  status: BudgetStatus;
}

function getCurrentMonthPrefix(): string {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
}

function computeStatus(percent: number, alertThresholdPercent: number): BudgetStatus {
  if (percent >= 100) return "danger";
  if (percent >= alertThresholdPercent) return "warning";
  return "safe";
}

/**
 * Mengambil semua budget milik user beserta progres pengeluaran bulan ini
 * per kategori, untuk dipakai di halaman Budget maupun pengecekan peringatan
 * saat menyimpan transaksi baru.
 */
export function useBudgets(userId: string | undefined) {
  const [budgets, setBudgets] = useState<BudgetWithProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async () => {
    if (!userId) {
      setBudgets([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const monthPrefix = getCurrentMonthPrefix();
      const rawBudgets = await dbService.getBudgets(userId);

      const withProgress = await Promise.all(
        rawBudgets.map(async (b) => {
          const spent = await dbService.getCategoryExpenseForMonth(userId, b.category_key, monthPrefix);
          const percent = b.monthly_limit > 0 ? (spent / b.monthly_limit) * 100 : 0;
          return {
            ...b,
            spent,
            percent,
            status: computeStatus(percent, b.alert_threshold_percent)
          } as BudgetWithProgress;
        })
      );

      setBudgets(withProgress);
    } catch (err) {
      console.error("useBudgets error:", err);
      void reportFrontendError({
        source: "frontend:budget",
        message: err instanceof Error ? err.message : String(err),
        context: { fn: "useBudgets.load" },
      });
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  return { budgets, loading, error, refresh: load };
}

/**
 * Helper satuan: hitung status budget untuk SATU kategori setelah sebuah
 * transaksi baru disimpan. Dipakai di NewTransaction untuk menampilkan
 * toast peringatan, tanpa perlu reload seluruh daftar budget.
 */
export async function checkSingleCategoryBudget(
  userId: string,
  categoryKey: string
): Promise<{ budget: Budget; spent: number; percent: number; status: BudgetStatus } | null> {
  const allBudgets = await dbService.getBudgets(userId);
  const budget = allBudgets.find((b) => b.category_key === categoryKey);
  if (!budget) return null;

  const monthPrefix = getCurrentMonthPrefix();
  const spent = await dbService.getCategoryExpenseForMonth(userId, categoryKey, monthPrefix);
  const percent = budget.monthly_limit > 0 ? (spent / budget.monthly_limit) * 100 : 0;
  const status = computeStatus(percent, budget.alert_threshold_percent);

  return { budget, spent, percent, status };
}

export function getCategoryLabel(categories: Category[], key: string, locale: "id" | "en"): string {
  const cat = categories.find((c) => c.key === key);
  if (!cat) return key;
  return locale === "id" ? cat.label_id || cat.key : cat.label_en || cat.key;
}
