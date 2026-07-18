import React from "react";
import { useThemeTokens } from "../hooks/useThemeTokens";

/* ── Base shimmer block ────────────────────────────────────────── */

const shimmer = "animate-pulse bg-slate-800/60 light_sakura:bg-rose-200/60 rounded-lg";

function Block({ className = "" }: { className?: string }) {
  return <div className={`${shimmer} ${className}`} />;
}

/* ── Route-specific skeletons ──────────────────────────────────── */

export function DashboardSkeleton() {
  const { tokens, cx } = useThemeTokens();
  return (
    <div className="space-y-6 animate-fade-in" aria-label="Loading dashboard">
      {/* Stats cards: 4 columns */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className={cx("h-24 rounded-xl border p-4 flex flex-col justify-between bg-slate-900/50 border-slate-800/50 light_sakura:bg-rose-50/50 light_sakura:border-rose-100/50")}>
            <Block className="w-16 h-3" />
            <Block className="w-24 h-6" />
            <Block className="w-12 h-3" />
          </div>
        ))}
      </div>

      {/* Chart area */}
      <div className={cx("h-64 rounded-xl border p-6 bg-slate-900/50 border-slate-800/50 light_sakura:bg-rose-50/50 light_sakura:border-rose-100/50")}>
        <Block className="w-32 h-4 mb-4" />
        <div className="flex items-end gap-3 h-40">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div key={i} className={`flex-1 bg-slate-800/60 rounded-lg animate-pulse`} style={{ height: `${30 + (i * 8)}%` }} />
          ))}
        </div>
      </div>

      {/* Recent transactions */}
      <div className="space-y-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className={cx("h-16 rounded-xl border p-4 flex items-center gap-4 bg-slate-900/50 border-slate-800/50 light_sakura:bg-rose-50/50 light_sakura:border-rose-100/50")}>
            <Block className="w-10 h-10 rounded-full shrink-0" />
            <div className="flex-1 space-y-2">
              <Block className="w-32 h-3" />
              <Block className="w-20 h-2" />
            </div>
            <Block className="w-16 h-4" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function HistorySkeleton() {
  const { tokens, cx } = useThemeTokens();
  return (
    <div className="space-y-4 animate-fade-in" aria-label="Loading history">
      {/* Filter bar */}
      <div className={cx("h-10 rounded-xl border bg-slate-900/50 border-slate-800/50 light_sakura:bg-rose-50/50 light_sakura:border-rose-100/50")} />

      {/* Table rows */}
      <div className={cx("rounded-xl border border-slate-800/50 overflow-hidden light_sakura:border-rose-100/50")}>
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className={cx("h-14 flex items-center gap-4 px-4 border-b border-slate-800/30 light_sakura:border-rose-100/30")}>
            <Block className="w-20 h-3" />
            <Block className="w-12 h-5" />
            <Block className="w-24 h-3" />
            <Block className="flex-1 h-3" />
            <Block className="w-16 h-4" />
            <Block className="w-8 h-8 rounded-lg" />
          </div>
        ))}
      </div>

      {/* Pagination */}
      <div className="flex justify-center gap-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="w-10 h-10 rounded-lg bg-slate-800/60 animate-pulse" />
        ))}
      </div>
    </div>
  );
}

export function TransactionSkeleton() {
  const { tokens, cx } = useThemeTokens();
  return (
    <div className="space-y-6 max-w-lg animate-fade-in" aria-label="Loading form">
      <Block className="w-48 h-6" />
      <Block className="w-full h-12 rounded-xl" />
      <Block className="w-full h-12 rounded-xl" />
      <Block className="w-full h-12 rounded-xl" />
      <Block className="w-32 h-10 rounded-xl" />
    </div>
  );
}

export function BudgetSkeleton() {
  const { tokens, cx } = useThemeTokens();
  return (
    <div className="space-y-4 animate-fade-in" aria-label="Loading budgets">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className={cx("h-28 rounded-xl border p-4 bg-slate-900/50 border-slate-800/50 light_sakura:bg-rose-50/50 light_sakura:border-rose-100/50")}>
            <Block className="w-24 h-4 mb-3" />
            <Block className="w-full h-3 mb-1" />
            <Block className="w-3/4 h-3 mb-3" />
            <div className="flex justify-between">
              <Block className="w-16 h-3" />
              <Block className="w-16 h-3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SettingsSkeleton() {
  const { tokens, cx } = useThemeTokens();
  return (
    <div className="space-y-4 animate-fade-in" aria-label="Loading settings">
      {[1, 2, 3].map((i) => (
        <div key={i} className={cx("h-20 rounded-xl border p-4 bg-slate-900/50 border-slate-800/50 light_sakura:bg-rose-50/50 light_sakura:border-rose-100/50")}>
          <Block className="w-32 h-4 mb-2" />
          <Block className="w-48 h-3" />
        </div>
      ))}
    </div>
  );
}

export function BillRemindersSkeleton() {
  const { tokens, cx } = useThemeTokens();
  return (
    <div className="space-y-4 animate-fade-in" aria-label="Loading bill reminders">
      <Block className="w-36 h-10 rounded-xl" />
      {[1, 2, 3].map((i) => (
        <div key={i} className={cx("h-20 rounded-xl border p-4 flex items-center gap-4 bg-slate-900/50 border-slate-800/50 light_sakura:bg-rose-50/50 light_sakura:border-rose-100/50")}>
          <Block className="w-10 h-10 rounded-full shrink-0" />
          <div className="flex-1 space-y-2">
            <Block className="w-28 h-3" />
            <Block className="w-16 h-2" />
          </div>
          <Block className="w-14 h-5 rounded-lg" />
        </div>
      ))}
    </div>
  );
}

export function AdminSkeleton() {
  const { tokens, cx } = useThemeTokens();
  return (
    <div className="space-y-4 animate-fade-in" aria-label="Loading admin panel">
      {/* Tab bar */}
      <div className="flex gap-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-9 w-24 rounded-lg bg-slate-800/60 animate-pulse" />
        ))}
      </div>
      {/* Content */}
      <div className={cx("h-80 rounded-xl border p-6 bg-slate-900/50 border-slate-800/50 light_sakura:bg-rose-50/50 light_sakura:border-rose-100/50")}>
        <Block className="w-40 h-5 mb-6" />
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center gap-4 mb-4">
            <Block className="w-8 h-8 rounded-full shrink-0" />
            <Block className="flex-1 h-3" />
            <Block className="w-16 h-3" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Default generic skeleton */
export function DefaultSkeleton() {
  const { tokens, cx } = useThemeTokens();
  return (
    <div className="space-y-4 animate-fade-in" aria-label="Loading">
      <Block className="w-48 h-6" />
      <Block className="w-full h-40 rounded-xl" />
      <Block className="w-full h-24 rounded-xl" />
    </div>
  );
}
