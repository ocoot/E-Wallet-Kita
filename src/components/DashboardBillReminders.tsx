import React from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { Bell, ChevronRight, AlertCircle, Clock } from "lucide-react";
import { useLanguage } from "../contexts/LanguageContext";
import { useAuth } from "../contexts/AuthContext";
import { useBillReminders } from "../hooks/useBillReminders";
import { audioFeedback } from "../lib/audio";
import { Card } from "./ui/Card";

const MotionCard = motion.create(Card);

/**
 * Widget dashboard untuk pengingat tagihan yang jatuh tempo segera.
 * Hanya tampil kalau ada tagihan yang overdue atau jatuh tempo ≤7 hari.
 * Tidak punya logic tersendiri — data murni dari useBillReminders.
 */
export const DashboardBillReminders: React.FC = () => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { reminders, loading } = useBillReminders(user?.id);

  // Tampilkan hanya yang overdue atau due_soon (≤3 hari) atau mendekati 7 hari
  const alerts = reminders.filter(
    (r) => !r.is_paid && r.daysUntilDue <= 7
  );

  if (loading || alerts.length === 0) return null;

  const hasOverdue = alerts.some((r) => r.urgency === "overdue");

  return (
    <MotionCard
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      border="subtle"
      elevation="lg"
    >
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5">
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
            hasOverdue
              ? "bg-red-500/15 text-red-400"
              : "bg-orange-500/15 text-orange-400"
          }`}>
            {hasOverdue ? <AlertCircle size={16} /> : <Bell size={16} />}
          </div>
          <h3 className="font-sans font-bold text-sm text-slate-100 light_sakura:text-slate-800">
            {t("bill_reminders.dashboard_alert_title")}
          </h3>
        </div>
        <button
          onClick={() => {
            audioFeedback.playClick();
            navigate("/bill-reminders");
          }}
          className={`flex items-center gap-1 text-[clamp(0.6188rem,2.86vw,0.6875rem)] font-semibold cursor-pointer ${
            hasOverdue
              ? "text-red-400 hover:text-red-300 light_sakura:text-red-600"
              : "text-orange-400 hover:text-orange-300 light_sakura:text-orange-600"
          }`}
        >
          {t("bill_reminders.dashboard_alert_cta")}
          <ChevronRight size={12} />
        </button>
      </div>

      <ul className="space-y-1.5">
        {alerts.slice(0, 4).map((r) => (
          <li
            key={r.id}
            className="flex items-center justify-between gap-2 text-xs text-slate-300 light_sakura:text-slate-700"
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <Clock size={10} className="shrink-0 text-slate-500" />
              <span className="truncate font-medium">{r.name}</span>
            </div>
            <span className={`shrink-0 font-semibold ${
              r.urgency === "overdue"
                ? "text-red-400"
                : r.urgency === "due_soon"
                ? "text-orange-400"
                : "text-slate-400"
            }`}>
              {r.urgency === "overdue"
                ? t("bill_reminders.status_overdue")
                : t("bill_reminders.days_left", { days: r.daysUntilDue })}
            </span>
          </li>
        ))}
      </ul>
    </MotionCard>
  );
};
