import React from "react";
import { useLanguage } from "../contexts/LanguageContext";
import { Transaction } from "../types";
import { Activity } from "lucide-react";
import { EmptyState } from "./EmptyState";
import { Card } from "./ui/Card";
import { useThemeTokens } from "../hooks/useThemeTokens";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

interface DashboardChartProps {
  transactions: Transaction[];
  chartData: any[];
  labelIncome: string;
  labelExpense: string;
  labelBalance: string;
  formatIDR: (num: number) => string;
}

/**
 * Sesi permintaan user: dulu ada 2 tab selector (Kumulatif/Harian dan Bagan
 * Area/Bagan Garis, 4 opsi total via `chartMode`/`chartType` yang di-lift
 * ke Dashboard.tsx). Sekarang PERMANEN cuma mode kumulatif + bagan area --
 * kedua tab selector dihapus total, begitu juga cabang render <LineChart>
 * dan opsi harian di `getChartData()` (lihat Dashboard.tsx). Kalau nanti
 * mode lain mau dikembalikan, cara paling gampang: kembalikan prop
 * chartMode/chartType + kedua blok tombol di bawah dari riwayat git,
 * bukan re-implementasi dari nol.
 */
export const DashboardChart: React.FC<DashboardChartProps> = ({
  transactions,
  chartData,
  labelIncome,
  labelExpense,
  labelBalance,
  formatIDR,
}) => {
  const { t } = useLanguage();
  const { tokens, cx } = useThemeTokens();

  // Custom tooltips renderer to perfectly match Obsidian and Sakura modes
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className={cx("p-4 border rounded-2xl shadow-xl backdrop-blur-md", tokens.surface.card, tokens.border.accent, tokens.text.heading)}>
          <p className={cx("font-sans font-bold text-xs mb-2", tokens.text.muted)}>{label}</p>
          <div className="space-y-1.5 font-mono text-xs">
            {payload.map((p: any) => {
              const isInc = p.name === labelIncome;
              const isExp = p.name === labelExpense;
              let colorCls: string = tokens.text.accentStrong;
              if (isInc) colorCls = tokens.text.success;
              if (isExp) colorCls = tokens.text.danger;

              return (
                <div key={p.name} className="flex items-center justify-between gap-6">
                  <span className={tokens.text.muted}>{p.name}:</span>
                  <span className={`font-bold tabular-nums ${colorCls}`}>{formatIDR(p.value)}</span>
                </div>
              );
            })}
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <Card id="dashboard-trends-panel" padding="lg" border="subtle" elevation="ambient" className="space-y-6">
      {/* Chart Header -- tanpa tab selector lagi, lihat komentar di atas
          komponen. */}
      <div className={cx("border-b pb-5", tokens.border.accent)}>
        <h3 className={cx("font-sans font-bold text-base tracking-tight", tokens.text.onSurface)}>
          {t("dashboard.chart_title")}
        </h3>
        <p className={cx("font-sans text-xs mt-1", tokens.text.muted)}>
          {t("dashboard.chart_desc_cumulative")}
        </p>
      </div>

      {/* Rendering Recharts -- permanen AreaChart kumulatif */}
      {transactions.length === 0 ? (
        <EmptyState message={t("dashboard.chart_no_data")} />
      ) : (
        <div className="w-full overflow-hidden">
          <ResponsiveContainer width="100%" height={320}>
            <AreaChart
              data={chartData}
              margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
            >
              <defs>
                <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0.01} />
                </linearGradient>
                <linearGradient id="colorExpense" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.22} />
                  <stop offset="95%" stopColor="#f43f5e" stopOpacity={0.01} />
                </linearGradient>
                <linearGradient id="colorBalance" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.22} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0.01} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" opacity={0.25} />
              <XAxis 
                dataKey="day" 
                stroke="#71717a" 
                fontSize={10} 
                tickLine={false} 
                axisLine={false} 
                className="font-mono text-[clamp(0.5062rem,2.34vw,0.5625rem)]"
              />
              <YAxis 
                stroke="#71717a" 
                fontSize={10} 
                tickLine={false} 
                axisLine={false} 
                tickFormatter={(val) => 
                  val >= 1000000 
                    ? `${(val / 1000000).toFixed(1)}jt` 
                    : val >= 1000 
                    ? `${(val / 1000).toFixed(0)}rb` 
                    : val
                }
                className="font-mono"
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend 
                verticalAlign="top" 
                height={36} 
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ fontSize: '11px', fontFamily: 'Inter, sans-serif', paddingBottom: '10px' }}
              />
              <Area
                type="monotone"
                dataKey={labelIncome}
                stroke="#10b981"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorIncome)"
              />
              <Area
                type="monotone"
                dataKey={labelExpense}
                stroke="#f43f5e"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorExpense)"
              />
              <Area
                type="monotone"
                dataKey={labelBalance}
                stroke="#6366f1"
                strokeWidth={2.5}
                fillOpacity={1}
                fill="url(#colorBalance)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Small Elegant Secondary Panel explaining Category analysis context */}
      {transactions.length > 0 && (
        <div className={cx("flex flex-wrap gap-4 items-center justify-between text-[clamp(0.6188rem,2.86vw,0.6875rem)] border-t pt-4 progress-legend", tokens.border.accent, tokens.text.faint)}>
          <span className="flex items-center gap-1.5 font-sans font-medium">
            <Activity size={12} className="text-zinc-400" />
            {t("dashboard.chart_instruction")}
          </span>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              {labelIncome}
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-rose-500" />
              {labelExpense}
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-indigo-500" />
              {labelBalance}
            </span>
          </div>
        </div>
      )}
    </Card>
  );
};
