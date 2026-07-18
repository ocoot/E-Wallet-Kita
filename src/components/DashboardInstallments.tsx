import React from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { Landmark, ChevronRight } from "lucide-react";
import { useLanguage } from "../contexts/LanguageContext";
import { useAuth } from "../contexts/AuthContext";
import { useInstallments } from "../hooks/useInstallments";
import { audioFeedback } from "../lib/audio";
import { Card } from "./ui/Card";
import { useThemeTokens } from "../hooks/useThemeTokens";

const MotionCard = motion.create(Card);

/**
 * Widget dashboard ringkas untuk cicilan/utang jangka panjang yang masih
 * berjalan, menampilkan progres tiap cicilan (mis. "12/24 bulan"). Hanya
 * tampil kalau user punya minimal 1 cicilan aktif.
 */
export const DashboardInstallments: React.FC = () => {
  const { tokens, cx } = useThemeTokens();
  const { t } = useLanguage();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { installments, loading } = useInstallments(user?.id);

  const active = installments.filter((i) => !i.is_completed).slice(0, 3);

  if (loading || active.length === 0) return null;

  return (
    <MotionCard
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      border="subtle"
      elevation="lg"
    >
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5">
          <div className={cx("w-8 h-8 rounded-xl flex items-center justify-center shrink-0 bg-indigo-500/15 light_sakura:bg-rose-500/15", tokens.text.accent)}>
            <Landmark size={16} />
          </div>
          <h3 className={cx("font-sans font-bold text-sm", tokens.text.onSurface)}>
            {t("installments.dashboard_widget_title")}
          </h3>
        </div>
        <button
          onClick={() => { audioFeedback.playClick(); navigate("/installments"); }}
          className={cx("flex items-center gap-1 text-[clamp(0.6188rem,2.86vw,0.6875rem)] font-semibold transition-colors cursor-pointer hover:opacity-80", tokens.text.muted)}
        >
          {t("installments.dashboard_widget_cta")} <ChevronRight size={12} />
        </button>
      </div>

      <div className="space-y-3">
        {active.map((i) => (
          <div key={i.id} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className={cx("font-semibold truncate pr-2", tokens.text.secondary)}>{i.name}</span>
              <span className={cx("shrink-0", tokens.text.faint)}>{i.months_paid}/{i.total_months}</span>
            </div>
            <div className={cx("h-1.5 w-full rounded-full overflow-hidden", tokens.surface.sunken)}>
              <div
                className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 light_sakura:from-rose-500 light_sakura:to-rose-400"
                style={{ width: `${i.progressPercent}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </MotionCard>
  );
};
