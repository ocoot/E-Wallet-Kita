import { useLanguage } from "../contexts/LanguageContext";
import { useBudgets } from "./useBudgets";

export type SubGreetingType = "budget_danger" | "budget_warning" | "budget_ok" | "empty" | "loading";

export interface SubGreeting {
  text: string;
  type: SubGreetingType;
}

function getGreetingKey(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 11) return "dashboard.greeting_morning";
  if (hour >= 11 && hour < 15) return "dashboard.greeting_afternoon";
  if (hour >= 15 && hour < 19) return "dashboard.greeting_evening";
  return "dashboard.greeting_night";
}

/**
 * Diekstrak dari `DashboardHeader.tsx` (sebelumnya logika ini didefinisikan
 * ulang secara lokal di file itu) supaya bisa dipakai ulang oleh
 * `DashboardTitleHeader.tsx` (large title mobile) TANPA duplikasi -- kalau
 * cuma disalin-tempel, dua tempat itu gampang saling menyimpang begitu ada
 * perubahan aturan budget di salah satunya.
 *
 * Tidak menyentuh logika cuaca/event sama sekali (itu tetap murni di
 * `DashboardHeader.tsx`, tidak relevan untuk large title).
 */
export function useDashboardGreeting(userId: string | undefined, displayName: string) {
  const { t, locale } = useLanguage();
  const { budgets, loading: budgetsLoading } = useBudgets(userId);

  const greetingText = t(getGreetingKey(), { name: displayName });

  const getDynamicSubGreeting = (): SubGreeting => {
    if (budgetsLoading) {
      return {
        text: locale === "id" ? "Memuat status anggaran..." : "Loading budget status...",
        type: "loading",
      };
    }

    if (budgets.length > 0) {
      const dangerBudget = budgets.find((b) => b.status === "danger" || b.percent >= 100);
      if (dangerBudget) {
        return {
          text: locale === "id"
            ? `Peringatan Anggaran: Kategori "${dangerBudget.category_key}" telah terpakai ${Math.round(dangerBudget.percent)}%! Batasi pengeluaran Anda hari ini.`
            : `Budget Alert: Category "${dangerBudget.category_key}" is at ${Math.round(dangerBudget.percent)}%! Mind your spending today.`,
          type: "budget_danger",
        };
      }

      const warningBudget = budgets.find((b) => b.status === "warning");
      if (warningBudget) {
        return {
          text: locale === "id"
            ? `Perhatian Anggaran: Kategori "${warningBudget.category_key}" mendekati batas (${Math.round(warningBudget.percent)}% terpakai).`
            : `Budget Warning: Category "${warningBudget.category_key}" is approaching limit (${Math.round(warningBudget.percent)}% spent).`,
          type: "budget_warning",
        };
      }

      const totalLimit = budgets.reduce((acc, b) => acc + b.monthly_limit, 0);
      const totalSpent = budgets.reduce((acc, b) => acc + b.spent, 0);

      if (totalLimit > 0) {
        const today = new Date();
        const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
        const remainingDays = Math.max(1, daysInMonth - today.getDate() + 1);
        const remainingBudget = Math.max(0, totalLimit - totalSpent);
        const dailyAllowance = Math.floor(remainingBudget / remainingDays);
        const overallPercent = Math.round((totalSpent / totalLimit) * 100);

        const formattedAllowance = new Intl.NumberFormat(locale === "id" ? "id-ID" : "en-US", {
          style: "currency",
          currency: "IDR",
          maximumFractionDigits: 0,
        }).format(dailyAllowance);

        const rawText = locale === "id"
          ? `Status Anggaran Harian: Jatah aman harian ± ${formattedAllowance} (${remainingDays} hari tersisa, ${overallPercent}% anggaran terpakai).`
          : `Daily Budget Status: Safe daily allowance ± ${formattedAllowance} (${remainingDays} days remaining, ${overallPercent}% budget spent).`;

        return { text: rawText, type: "budget_ok" };
      }
    }

    return {
      text: locale === "id"
        ? "Belum ada anggaran kategori yang diatur. Buat anggaran untuk memantau pengeluaran Anda."
        : "No category budgets set yet. Create one to keep track of your spending.",
      type: "empty",
    };
  };

  return { greetingText, subGreeting: getDynamicSubGreeting() };
}
