import React from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { ChevronRight } from "lucide-react";
import { useLanguage } from "../contexts/LanguageContext";
import { useAuth } from "../contexts/AuthContext";
import { useBillReminders } from "../hooks/useBillReminders";
import { audioFeedback } from "../lib/audio";
import { useThemeTokens } from "../hooks/useThemeTokens";

/**
 * Baris "Tagihan Mendatang" di dalam grouped list Pantauan Keuangan (lihat
 * Dashboard.tsx) -- versi RINGKAS satu baris ala iOS Settings/Wallet: ikon
 * bulat + judul + SATU baris subjudul (nama tagihan paling mendesak · sisa
 * waktunya, mis. "Listrik PLN · 3 hari lagi") + chevron. Daftar lengkap
 * semua tagihan yang jatuh tempo (bukan cuma yang paling mendesak) sengaja
 * TIDAK ditampilkan di sini lagi -- itu tugas halaman /bill-reminders yang
 * dituju kalau baris ini di-tap.
 */
export const DashboardBillReminders: React.FC = () => {
  const { tokens, cx } = useThemeTokens();
  const { t } = useLanguage();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { reminders, loading } = useBillReminders(user?.id);

  // Tampilkan hanya yang overdue atau due_soon (≤3 hari) atau mendekati 7 hari.
  // `reminders` sudah terurut overdue -> due_soon -> upcoming (lihat
  // useBillReminders.ts), jadi alerts[0] otomatis yang paling mendesak.
  const alerts = reminders.filter((r) => !r.is_paid && r.daysUntilDue <= 7);

  if (loading || alerts.length === 0) return null;

  const mostUrgent = alerts[0];
  const statusText =
    mostUrgent.urgency === "overdue"
      ? t("bill_reminders.status_overdue")
      : t("bill_reminders.days_left", { days: mostUrgent.daysUntilDue });

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <button
        type="button"
        onClick={() => { audioFeedback.playClick(); navigate("/bill-reminders"); }}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left cursor-pointer"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="min-w-0">
            <h3 className={cx("font-sans font-bold text-sm truncate", tokens.text.heading)}>
              {t("bill_reminders.dashboard_alert_title")}
            </h3>
            <p className={cx("text-xs truncate", tokens.text.muted)}>
              {mostUrgent.name} · {statusText}
            </p>
          </div>
        </div>
        <ChevronRight size={18} className={cx("shrink-0", tokens.text.muted)} />
      </button>
    </motion.div>
  );
};
