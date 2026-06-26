import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export type BudgetCheckStatus = "safe" | "warning" | "danger";

export interface BudgetCheckResult {
  categoryKey: string;
  monthlyLimit: number;
  spent: number;
  percent: number;
  status: BudgetCheckStatus;
}

function currentMonthRange(): { start: string; end: string } {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth() + 1;
  const lastDay = new Date(year, month, 0).getDate();
  const prefix = `${year}-${String(month).padStart(2, "0")}`;
  return { start: `${prefix}-01`, end: `${prefix}-${String(lastDay).padStart(2, "0")}` };
}

/**
 * Cek status budget kategori tertentu untuk user, dipakai oleh bot Telegram
 * setelah sebuah transaksi expense berhasil disimpan (baik via chat text
 * maupun receipt OCR). Mengembalikan null kalau user belum mengatur budget
 * untuk kategori tersebut (tidak ada apa-apa yang perlu diperingatkan).
 *
 * Catatan: ini sengaja terpisah dari src/hooks/useBudgets.ts (frontend) —
 * backend pakai service-role client (bypass RLS) sementara frontend pakai
 * anon/authenticated client dengan RLS, sama seperti pola categories.ts vs
 * useCategories.ts.
 */
export async function checkCategoryBudgetStatus(
  userId: string,
  categoryKey: string
): Promise<BudgetCheckResult | null> {
  const { data: budget, error: budgetErr } = await supabase
    .from("budgets")
    .select("monthly_limit, alert_threshold_percent")
    .eq("user_id", userId)
    .eq("category_key", categoryKey)
    .maybeSingle();

  if (budgetErr) {
    console.error("Error fetching budget for telegram check:", budgetErr);
    return null;
  }
  if (!budget) return null;

  const { start, end } = currentMonthRange();
  const { data: rows, error: txErr } = await supabase
    .from("transactions")
    .select("amount")
    .eq("user_id", userId)
    .eq("type", "expense")
    .eq("category", categoryKey)
    .gte("transaction_date", start)
    .lte("transaction_date", end);

  if (txErr) {
    console.error("Error summing category expense for telegram budget check:", txErr);
    return null;
  }

  const spent = (rows || []).reduce((sum, r: any) => sum + Number(r.amount), 0);
  const percent = budget.monthly_limit > 0 ? (spent / budget.monthly_limit) * 100 : 0;
  const status: BudgetCheckStatus =
    percent >= 100 ? "danger" : percent >= budget.alert_threshold_percent ? "warning" : "safe";

  return {
    categoryKey,
    monthlyLimit: budget.monthly_limit,
    spent,
    percent,
    status
  };
}
