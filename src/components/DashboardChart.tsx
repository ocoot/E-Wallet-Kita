import React from "react";
import { useLanguage } from "../contexts/LanguageContext";
import { Transaction } from "../types";
import { Activity } from "lucide-react";
import { audioFeedback } from "../lib/audio";
import { EmptyState } from "./EmptyState";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  LineChart,
  Line
} from "recharts";

interface DashboardChartProps {
  transactions: Transaction[];
  chartData: any[];
  chartMode: "area" | "line";
  setChartMode: (mode: "area" | "line") => void;
  chartType: "daily" | "cumulative";
  setChartType: (type: "daily" | "cumulative") => void;
  labelIncome: string;
  labelExpense: string;
  labelBalance: string;
  formatIDR: (num: number) => string;
}

export const DashboardChart: React.FC<DashboardChartProps> = ({
  transactions,
  chartData,
  chartMode,
  setChartMode,
  chartType,
  setChartType,
  labelIncome,
  labelExpense,
  labelBalance,
  formatIDR,
}) => {
  const { t } = useLanguage();

  // Custom tooltips renderer to perfectly match Obsidian and Sakura modes
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="p-4 bg-slate-950/95 border border-slate-800 text-slate-100 rounded-2xl shadow-xl backdrop-blur-md light_sakura:bg-white light_sakura:border-rose-100 light_sakura:text-slate-800">
          <p className="font-sans font-bold text-xs mb-2 text-slate-400 light_sakura:text-slate-500">{label}</p>
          <div className="space-y-1.5 font-mono text-xs">
            {payload.map((p: any) => {
              const isInc = p.name === labelIncome;
              const isExp = p.name === labelExpense;
              let colorCls = "text-indigo-400 light_sakura:text-indigo-600";
              if (isInc) colorCls = "text-emerald-400 light_sakura:text-emerald-600";
              if (isExp) colorCls = "text-red-400 light_sakura:text-rose-600";

              return (
                <div key={p.name} className="flex items-center justify-between gap-6">
                  <span className="text-slate-400 light_sakura:text-slate-500">{p.name}:</span>
                  <span className={`font-bold ${colorCls}`}>{formatIDR(p.value)}</span>
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
    <div id="dashboard-trends-panel" className="p-6 md:p-8 rounded-3xl border bg-slate-900 border-slate-900 transition-colors duration-300 light_sakura:bg-white light_sakura:border-rose-100/10 shadow-lg space-y-6">
      {/* Chart Header & Tab Options */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800/50 pb-5 light_sakura:border-rose-100/30">
        <div>
          <h3 className="font-sans font-bold text-base text-white tracking-tight light_sakura:text-slate-800">
            {t("dashboard.chart_title")}
          </h3>
          <p className="font-sans text-xs text-slate-400 mt-1 light_sakura:text-slate-500">
            {chartType === "cumulative" 
              ? t("dashboard.chart_desc_cumulative")
              : t("dashboard.chart_desc_daily")}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Chart Type Selector: Cumulative vs Daily */}
          <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 light_sakura:bg-rose-50/50 light_sakura:border-rose-100">
            <button
              onClick={() => {
                audioFeedback.playClick();
                setChartType("cumulative");
              }}
              className={`px-3 py-1.5 text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold rounded-lg transition-all cursor-pointer ${
                chartType === "cumulative"
                  ? "bg-slate-900 text-indigo-400 shadow-sm light_sakura:bg-white light_sakura:text-rose-500"
                  : "text-slate-400 hover:text-slate-200 light_sakura:text-slate-500"
              }`}
            >
              {t("dashboard.chart_cumulative")}
            </button>
            <button
              onClick={() => {
                audioFeedback.playClick();
                setChartType("daily");
              }}
              className={`px-3 py-1.5 text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold rounded-lg transition-all cursor-pointer ${
                chartType === "daily"
                  ? "bg-slate-900 text-indigo-400 shadow-sm light_sakura:bg-white light_sakura:text-rose-500"
                  : "text-slate-400 hover:text-slate-200 light_sakura:text-slate-500"
              }`}
            >
              {t("dashboard.chart_daily")}
            </button>
          </div>

          {/* Chart Mode Selector: Area vs Line */}
          <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 light_sakura:bg-rose-50/50 light_sakura:border-rose-100">
            <button
              onClick={() => {
                audioFeedback.playClick();
                setChartMode("area");
              }}
              className={`px-3 py-1.5 text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold rounded-lg transition-all cursor-pointer ${
                chartMode === "area"
                  ? "bg-slate-900 text-indigo-300 shadow-sm light_sakura:bg-white light_sakura:text-rose-500"
                  : "text-slate-400 hover:text-slate-200 light_sakura:text-slate-500"
              }`}
            >
              {t("dashboard.chart_area")}
            </button>
            <button
              onClick={() => {
                audioFeedback.playClick();
                setChartMode("line");
              }}
              className={`px-3 py-1.5 text-[clamp(0.5625rem,2.6vw,0.625rem)] font-bold rounded-lg transition-all cursor-pointer ${
                chartMode === "line"
                  ? "bg-slate-900 text-indigo-300 shadow-sm light_sakura:bg-white light_sakura:text-rose-500"
                  : "text-slate-400 hover:text-slate-200 light_sakura:text-slate-500"
              }`}
            >
              {t("dashboard.chart_line")}
            </button>
          </div>
        </div>
      </div>

      {/* Dynamic Rendering of Recharts */}
      {transactions.length === 0 ? (
        <EmptyState message={t("dashboard.chart_no_data")} />
      ) : (
        <div className="w-full overflow-hidden">
          <ResponsiveContainer width="100%" height={320}>
            {chartMode === "area" ? (
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
            ) : (
              <LineChart
                data={chartData}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
              >
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
                <Line
                  type="monotone"
                  dataKey={labelIncome}
                  stroke="#10b981"
                  strokeWidth={2.5}
                  dot={{ r: 2 }}
                  activeDot={{ r: 4 }}
                />
                <Line
                  type="monotone"
                  dataKey={labelExpense}
                  stroke="#f43f5e"
                  strokeWidth={2.5}
                  dot={{ r: 2 }}
                  activeDot={{ r: 4 }}
                />
                <Line
                  type="monotone"
                  dataKey={labelBalance}
                  stroke="#6366f1"
                  strokeWidth={3}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            )}
          </ResponsiveContainer>
        </div>
      )}

      {/* Small Elegant Secondary Panel explaining Category analysis context */}
      {transactions.length > 0 && (
        <div className="flex flex-wrap gap-4 items-center justify-between text-[clamp(0.6188rem,2.86vw,0.6875rem)] text-slate-500 border-t border-slate-800/40 pt-4 progress-legend light_sakura:border-rose-100/30 light_sakura:text-slate-400">
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
    </div>
  );
};
