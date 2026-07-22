import React, { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { AlertTriangle, CheckCircle2, TrendingUp, Flame } from "lucide-react";
import { BudgetWithProgress } from "../hooks/useBudgets";
import { useLanguage } from "../contexts/LanguageContext";
import { Badge, type BadgeTone } from "./ui/Badge";
import { useThemeTokens } from "../hooks/useThemeTokens";

interface BudgetProgressCardProps {
  budget: BudgetWithProgress;
  label: string;
  onEdit: () => void;
  onDelete: () => void;
  editSlot: React.ReactNode;
}

function useCountUp(target: number, duration = 900) {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    let start: number | null = null;
    const from = 0;
    const step = (ts: number) => {
      if (!start) start = ts;
      const elapsed = ts - start;
      const progress = Math.min(elapsed / duration, 1);
      // easeOutCubic
      const ease = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(from + (target - from) * ease));
      if (progress < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [target, duration]);

  return value;
}

const getStatusConfig = (tokens: any) => ({
  safe: {
    barFrom: "#6366f1",
    barTo: "#818cf8",
    glow: "rgba(63, 190, 155,0.35)",
    icon: <CheckCircle2 size={12} />,
    badgeBg: tokens.budgetProgressCard.badgeBgSafe,
    badgeText: tokens.budgetProgressCard.badgeTextSafe,
    ringColor: "#6366f1",
  },
  warning: {
    barFrom: "#f59e0b",
    barTo: "#fcd34d",
    glow: "rgba(245,158,11,0.35)",
    icon: <AlertTriangle size={12} />,
    badgeBg: tokens.budgetProgressCard.badgeBgWarning,
    badgeText: tokens.budgetProgressCard.badgeTextWarning,
    ringColor: "#f59e0b",
  },
  danger: {
    barFrom: "#ef4444",
    barTo: "#f87171",
    glow: "rgba(239,68,68,0.35)",
    icon: <Flame size={12} />,
    badgeBg: tokens.budgetProgressCard.badgeBgDanger,
    badgeText: tokens.budgetProgressCard.badgeTextDanger,
    ringColor: "#ef4444",
  },
});

const STATUS_TONE: Record<keyof ReturnType<typeof getStatusConfig>, BadgeTone> = {
  safe: "success",
  warning: "warning",
  danger: "danger",
};

const SIZE = 96;
const STROKE = 8;
const R = (SIZE - STROKE) / 2;
const CIRC = 2 * Math.PI * R;

export const BudgetProgressCard: React.FC<BudgetProgressCardProps> = ({
  budget,
  label,
  editSlot,
  onDelete,
}) => {
  const { t } = useLanguage();
  const { tokens, cx, isSakura } = useThemeTokens();
  const cfg = getStatusConfig(tokens)[budget.status];
  const clampedPercent = Math.min(100, budget.percent);
  const animPercent = useCountUp(Math.round(budget.percent));
  const animClamp = Math.min(100, animPercent);

  const formatIDR = (n: number) => "Rp\u00A0" + Math.round(n).toLocaleString("id-ID");

  const dashOffset = CIRC - (animClamp / 100) * CIRC;
  const remaining = Math.max(0, budget.monthly_limit - budget.spent);
  const overBudget = budget.spent > budget.monthly_limit;

  const gradId = `grad-${budget.id}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", duration: 0.45 }}
      className={cx(
        "rounded-2xl border overflow-hidden",
        tokens.surface.sunken,
        tokens.border.accent
      )}
    >
      {/* Top accent stripe */}
      <div
        className="h-0.5 w-full"
        style={{ background: `linear-gradient(90deg, ${cfg.barFrom}, ${cfg.barTo})` }}
      />

      <div className="p-5 space-y-4">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className={cx("text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold uppercase tracking-widest mb-0.5", tokens.text.faint)}>
              {t("budget.page_title")}
            </p>
            <h3 className={cx("font-semibold text-sm truncate leading-snug", tokens.text.primary)}>
              {label}
            </h3>
          </div>
          <Badge
            tone={STATUS_TONE[budget.status]}
            icon={cfg.icon}
            className="shrink-0 normal-case tracking-normal"
          >
            {t(`budget.status_${budget.status}`)}
          </Badge>
        </div>

        {/* Circular gauge + bar combo */}
        <div className="flex items-center gap-4">
          {/* SVG donut gauge */}
          <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
            <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
              <defs>
                <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor={cfg.barFrom} />
                  <stop offset="100%" stopColor={cfg.barTo} />
                </linearGradient>
              </defs>
              {/* Track */}
              <circle
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={R}
                fill="none"
                stroke={isSakura ? "rgba(30,41,59,0.10)" : "rgba(255,255,255,0.06)"}
                strokeWidth={STROKE}
              />
              {/* Progress arc */}
              <circle
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={R}
                fill="none"
                stroke={`url(#${gradId})`}
                strokeWidth={STROKE}
                strokeLinecap="round"
                strokeDasharray={CIRC}
                strokeDashoffset={dashOffset}
                transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
                style={{
                  filter: `drop-shadow(0 0 5px ${cfg.glow})`,
                  transition: "stroke-dashoffset 0.05s linear",
                }}
              />
            </svg>
            {/* Center label */}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span
                className="text-lg font-black leading-none tabular-nums"
                style={{ color: cfg.barFrom }}
              >
                {animPercent > 999 ? "999+" : animPercent}%
              </span>
              <span className={cx("text-[clamp(0.5062rem,2.34vw,0.5625rem)] font-medium mt-0.5", tokens.text.faint)}>
                terpakai
              </span>
            </div>
          </div>

          {/* Right: linear bar + figures */}
          <div className="flex-1 space-y-3 min-w-0">
            {/* Segmented progress bar */}
            <div className="space-y-1">
              <div className={cx("flex justify-between text-[clamp(0.5625rem,2.6vw,0.625rem)] font-mono tabular-nums", tokens.text.faint)}>
                <span>Rp0</span>
                <span>{formatIDR(budget.monthly_limit)}</span>
              </div>
              <div className={cx("relative h-3 rounded-full overflow-hidden", tokens.surface.sunken)}>
                {/* Threshold marker */}
                {budget.alert_threshold_percent < 100 && (
                  <div
                    className={cx("absolute top-0 bottom-0 w-px z-10", isSakura ? "bg-slate-900/30" : "bg-white/30")}
                    style={{ left: `${budget.alert_threshold_percent}%` }}
                  />
                )}
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${animClamp}%` }}
                  transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
                  className="h-full rounded-full relative"
                  style={{
                    background: `linear-gradient(90deg, ${cfg.barFrom}, ${cfg.barTo})`,
                    boxShadow: `0 0 8px ${cfg.glow}`,
                  }}
                >
                  {/* Shimmer */}
                  <div
                    className="absolute inset-0 rounded-full overflow-hidden"
                    style={{
                      background:
                        "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.18) 50%, transparent 100%)",
                      backgroundSize: "200% 100%",
                      animation: "shimmer 2s infinite",
                    }}
                  />
                </motion.div>
              </div>
              {/* Threshold label */}
              {budget.alert_threshold_percent < 100 && (
                <div
                  className={cx("text-[clamp(0.5062rem,2.34vw,0.5625rem)]", tokens.text.faint)}
                  style={{ paddingLeft: `${Math.min(budget.alert_threshold_percent, 80)}%` }}
                >
                  ↑ {budget.alert_threshold_percent}%
                </div>
              )}
            </div>

            {/* Spent / Remaining */}
            <div className="grid grid-cols-2 gap-2">
              <div className={cx("rounded-xl px-3 py-2", tokens.surface.card)}>
                <p className={cx("text-[clamp(0.5062rem,2.34vw,0.5625rem)] uppercase tracking-wider font-bold mb-0.5", tokens.text.faint)}>
                  Terpakai
                </p>
                <p
                  className="font-mono text-[clamp(0.5906rem,2.73vw,0.6563rem)] font-black leading-tight whitespace-nowrap tabular-nums tracking-tight"
                  style={{ color: cfg.barFrom }}
                >
                  {formatIDR(budget.spent)}
                </p>
              </div>
              <div className={cx("rounded-xl px-3 py-2", tokens.surface.card)}>
                <p className={cx("text-[clamp(0.5062rem,2.34vw,0.5625rem)] uppercase tracking-wider font-bold mb-0.5", tokens.text.faint)}>
                  {overBudget ? "Melebihi" : "Sisa"}
                </p>
                <p className={`font-mono text-[clamp(0.5906rem,2.73vw,0.6563rem)] font-black leading-tight whitespace-nowrap tabular-nums tracking-tight ${overBudget ? "text-red-400" : "text-emerald-400"}`}>
                  {overBudget
                    ? `+${formatIDR(budget.spent - budget.monthly_limit)}`
                    : formatIDR(remaining)}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Edit / Delete slot */}
        <div className={cx("border-t pt-4 space-y-3", tokens.border.accent)}>
          <div className="flex items-center gap-2">
            <TrendingUp size={11} className="text-slate-500 shrink-0" />
            <p className={cx("text-[clamp(0.5625rem,2.6vw,0.625rem)]", tokens.text.faint)}>
              Anggaran bulanan: <span className={cx("font-mono tabular-nums font-semibold", tokens.text.label)}>{formatIDR(budget.monthly_limit)}</span>
              {" · "}Peringatan di <span className={cx("font-semibold", tokens.text.label)}>{budget.alert_threshold_percent}%</span>
            </p>
          </div>
          {editSlot}
          <div className="flex justify-end">
            <button
              onClick={onDelete}
              className={cx(
                "text-[clamp(0.5625rem,2.6vw,0.625rem)] font-medium transition-colors cursor-pointer",
                tokens.budgetProgressCard.deleteBtn
              )}
            >
              Hapus anggaran ini
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </motion.div>
  );
};
