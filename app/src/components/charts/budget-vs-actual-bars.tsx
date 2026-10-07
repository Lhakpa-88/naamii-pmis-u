"use client";
import { Bar, BarChart, CartesianGrid, LabelList, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMoney } from "@/lib/format";
import { pickScale, scaled } from "./scale";
import { axisStyle, chartTheme, tooltipStyle } from "./theme";

export interface BudgetActualDatum { name: string; budget: number; actual: number }

/** Grouped bars: Budget (Cool Grey) vs Actual (Dark Blue Grey) per category. One axis, one unit. */
export function BudgetVsActualBars({ data, currency = "NPR", height = 260 }: { data: BudgetActualDatum[]; currency?: string; height?: number }) {
  const scale = pickScale(Math.max(0, ...data.flatMap((d) => [d.budget, d.actual])), currency);
  const fmt = (v: number) => scaled(v, scale);
  return (
    <div style={{ width: "100%", height: height + 18 }}>
      <p className="mb-1 text-[11.5px] text-grey">{scale.unit}</p>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 22, right: 8, left: 0, bottom: 4 }} barCategoryGap="28%" barGap={2}>
          <CartesianGrid vertical={false} stroke={chartTheme.grid} />
          <XAxis dataKey="name" tick={axisStyle} axisLine={{ stroke: chartTheme.grid }} tickLine={false} interval={0} />
          <YAxis tick={axisStyle} axisLine={false} tickLine={false} tickFormatter={fmt} width={44} />
          <Tooltip cursor={{ fill: "#f4f5f7" }} contentStyle={tooltipStyle} formatter={(v) => formatMoney(Number(v), currency)} />
          <Legend wrapperStyle={{ fontSize: 12.5, color: chartTheme.text }} iconType="square" iconSize={10} />
          <Bar name="Budget" dataKey="budget" fill={chartTheme.budget} stroke={chartTheme.budgetStroke} strokeWidth={1} radius={[4, 4, 0, 0]} maxBarSize={56}>
            <LabelList dataKey="budget" position="top" formatter={(v) => fmt(Number(v))} style={{ fontSize: 11, fill: chartTheme.muted }} />
          </Bar>
          <Bar name="Actual" dataKey="actual" fill={chartTheme.actual} radius={[4, 4, 0, 0]} maxBarSize={56}>
            <LabelList dataKey="actual" position="top" formatter={(v) => fmt(Number(v))} style={{ fontSize: 11, fill: chartTheme.text }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
