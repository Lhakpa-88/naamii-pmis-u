"use client";
import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { axisStyle, chartTheme, tooltipStyle } from "./theme";

export interface SingleDatum { name: string; value: number; highlight?: boolean }

/** One measure across items: horizontal bars in a single hue with direct labels. */
export function SingleMeasureBars({ data, unit = "", height }: { data: SingleDatum[]; unit?: string; height?: number }) {
  const h = height ?? Math.max(120, 36 * data.length + 24);
  return (
    <div style={{ width: "100%", height: h }}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 40, left: 4, bottom: 4 }} barCategoryGap="30%">
          <XAxis type="number" hide domain={[0, (max: number) => Math.max(1, Math.ceil(max * 1.15))]} />
          <YAxis type="category" dataKey="name" tick={{ ...axisStyle, fill: chartTheme.text }} axisLine={false} tickLine={false} width={150} />
          <Tooltip cursor={{ fill: "#f4f5f7" }} contentStyle={tooltipStyle} formatter={(v) => `${v}${unit}`} />
          <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={22} isAnimationActive={false}>
            {data.map((d, i) => <Cell key={i} fill={d.highlight ? chartTheme.critical : chartTheme.single} />)}
            <LabelList dataKey="value" position="right" formatter={(v) => `${v}${unit}`} style={{ fontSize: 12, fill: chartTheme.text, fontWeight: 600 }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
