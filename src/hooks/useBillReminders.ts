import { useState, useEffect, useCallback } from "react";
import { dbService } from "../lib/db";
import { BillReminder } from "../types";
import { reportFrontendError } from "../lib/errorReporter";

export type BillUrgency = "overdue" | "due_soon" | "upcoming" | "paid";

export interface BillReminderWithUrgency extends BillReminder {
  urgency: BillUrgency;
  /** Hari tersisa hingga jatuh tempo (negatif = sudah lewat) */
  daysUntilDue: number;
  /** Tanggal jatuh tempo bulan/tahun ini dalam format YYYY-MM-DD */
  nextDueDate: string;
}

/**
 * Hitung tanggal jatuh tempo berikutnya dari sebuah reminder.
 * - monthly: due_day hari ini atau lebih → bulan ini; sudah lewat → bulan depan.
 * - yearly: due_date tahun ini atau lebih → tahun ini; sudah lewat → tahun depan.
 * - one_time: due_date tetap.
 */
export function computeNextDueDate(reminder: BillReminder, today: Date): Date {
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  if (reminder.recurrence_type === "monthly" && reminder.due_day != null) {
    // Coba bulan ini
    const candidate = new Date(todayMidnight.getFullYear(), todayMidnight.getMonth(), reminder.due_day);
    // Kalau jatuh tempo bulan ini sudah lewat (dan belum bayar), majukan ke bulan depan
    if (candidate < todayMidnight && !reminder.is_paid) {
      return new Date(todayMidnight.getFullYear(), todayMidnight.getMonth() + 1, reminder.due_day);
    }
    return candidate;
  }

  if (reminder.recurrence_type === "yearly" && reminder.due_date) {
    const base = new Date(reminder.due_date + "T00:00:00");
    const candidate = new Date(todayMidnight.getFullYear(), base.getMonth(), base.getDate());
    if (candidate < todayMidnight && !reminder.is_paid) {
      return new Date(todayMidnight.getFullYear() + 1, base.getMonth(), base.getDate());
    }
    return candidate;
  }

  // one_time
  if (reminder.due_date) {
    return new Date(reminder.due_date + "T00:00:00");
  }

  return todayMidnight;
}

function toYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function computeUrgency(daysUntilDue: number, isPaid: boolean): BillUrgency {
  if (isPaid) return "paid";
  if (daysUntilDue < 0) return "overdue";
  if (daysUntilDue <= 3) return "due_soon";
  return "upcoming";
}

/**
 * Mengambil semua pengingat tagihan milik user beserta status urgensi
 * (overdue, due_soon, upcoming, paid) berdasarkan tanggal jatuh tempo.
 */
export function useBillReminders(userId: string | undefined) {
  const [reminders, setReminders] = useState<BillReminderWithUrgency[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async () => {
    if (!userId) {
      setReminders([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const raw = await dbService.getBillReminders(userId);
      const today = new Date();

      const enriched: BillReminderWithUrgency[] = raw.map((r) => {
        const nextDue = computeNextDueDate(r, today);
        const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const diffMs = nextDue.getTime() - todayMidnight.getTime();
        const daysUntilDue = Math.round(diffMs / (1000 * 60 * 60 * 24));
        return {
          ...r,
          urgency: computeUrgency(daysUntilDue, r.is_paid),
          daysUntilDue,
          nextDueDate: toYMD(nextDue)
        };
      });

      // Sort: overdue dulu, lalu due_soon, upcoming, paid paling belakang
      const order: BillUrgency[] = ["overdue", "due_soon", "upcoming", "paid"];
      enriched.sort((a, b) => {
        const oa = order.indexOf(a.urgency);
        const ob = order.indexOf(b.urgency);
        if (oa !== ob) return oa - ob;
        return a.daysUntilDue - b.daysUntilDue;
      });

      setReminders(enriched);
    } catch (err) {
      console.error("useBillReminders error:", err);
      void reportFrontendError({
        source: "frontend:bill-reminders",
        message: err instanceof Error ? err.message : String(err),
        context: { fn: "useBillReminders.load" },
      });
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  return { reminders, loading, error, refresh: load };
}
