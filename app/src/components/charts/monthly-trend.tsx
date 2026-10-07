"use client";
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMoney, formatMonth } from "@/lib/format";
import { pickScale, scaled } from "./scale";
import { axisStyle, chartTheme, tooltipStyle } from "./theme";

export interface TrendDatum { period: string; budget: number; actual: number | null; forecast: number }

/**
 * Monthly Budget vs Actual (vs Forecast). Actual stops at the last closed month;
 * forecast is dashed (secondary encoding, not colour alone).
 */
export function MonthlyTrend({ data, currency = "NPR", height = 280, currentPeriod }: { data: TrendDatum[]; currency?: string; height?: number; currentPeriod?: string }) {
  const scale = pickScale(Math.max(0, ...data.flatMap((d) => [d.budget, d.actual ?? 0, d.forecast])), currency);
  const fmt = (v: number) => scaled(v, scale);
  return (
    <div style={{ width: "100%", height: height + 18 }}>
      <p className="mb-1 text-[11.5px] text-grey">{scale.unit} per month</p>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 12, right: 12, left: 4, bottom: 4 }}>
          <CartesianGrid vertical={false} stroke={chartTheme.grid} />
          <XAxis dataKey="period" tick={axisStyle} axisLine={{ stroke: chartTheme.grid }} tickLine={false} tickFormatter={formatMonth} minTickGap={24} />
          <YAxis tick={axisStyle} axisLine={false} tickLine={false} tickFormatter={fmt} width={44} />
          <Tooltip contentStyle={tooltipStyle} labelFormatter={(l) => formatMonth(String(l))} formatter={(v) => (v === null ? "—" : formatMoney(Number(v), currency))} />
          <Legend wrapperStyle={{ fontSize: 12.5, color: chartTheme.text }} iconType="plainline" iconSize={18} />
          {currentPeriod ? <ReferenceLine x={currentPeriod} stroke={chartTheme.axis} strokeDasharray="2 4" label={{ value: "now", position: "top", fontSize: 11, fill: chartTheme.muted }} /> : null}
          <Line name="Budget (phased)" type="monotone" dataKey="budget" stroke={chartTheme.budget} strokeWidth={2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
          <Line name="Forecast" type="monotone" dataKey="forecast" stroke={chartTheme.forecast} strokeWidth={2} strokeDasharray="6 4" dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
          <Line name="Actual" type="monotone" dataKey="actual" stroke={chartTheme.actual} strokeWidth={2.25} dot={false} activeDot={{ r: 4 }} connectNulls={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
