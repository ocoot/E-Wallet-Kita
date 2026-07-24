import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { dbService } from "../lib/db";
import { Category } from "../types";
import { reportFrontendError } from "../lib/errorReporter";

interface CategoriesContextType {
  categories: Category[];
  loading: boolean;
  refresh: () => Promise<void>;
}

const CategoriesContext = createContext<CategoriesContextType>({
  categories: [],
  loading: true,
  refresh: async () => {},
});

/**
 * Single source of truth for the active categories list, fetched once and
 * shared across the whole app.
 *
 * Previously every consumer (Dashboard, History, Budget, NewTransaction,
 * BillReminders, ReceiptPreview, HistoryEditModal, DashboardBudgetAlerts —
 * 8 places) called the old `useCategories()` hook independently, each one
 * firing its own `getCategories()` request to Supabase on mount. Categories
 * rarely change, so that was 8x more network round-trips than needed any
 * time a user navigated between pages. Now there's exactly one fetch per
 * app session (plus an explicit `refresh()` for places that mutate
 * categories, e.g. AdminCategoryManager), and every consumer reads from
 * this shared context instead.
 */
export const CategoriesProvider = ({ children }: { children: React.ReactNode }) => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await dbService.getCategories();
      setCategories(data);
    } catch (err) {
      console.error("CategoriesProvider error:", err);
      void reportFrontendError({
        source: "frontend:categories",
        message: err instanceof Error ? err.message : String(err),
        context: { fn: "CategoriesProvider.refresh" },
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <CategoriesContext.Provider value={{ categories, loading, refresh }}>
      {children}
    </CategoriesContext.Provider>
  );
};

export const useCategoriesContext = () => useContext(CategoriesContext);
