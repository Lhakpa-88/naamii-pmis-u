import type { Health } from "@naamii/core";
import { HealthDot } from "./badges";

export function KpiCard({ label, value, sub, health, emphasis }: { label: string; value: string; sub?: string; health?: Health; emphasis?: "critical" | "warning" }) {
  const valueColor = emphasis === "critical" ? "text-critical" : emphasis === "warning" ? "text-warning" : "text-ink";
  return (
    <div className="rounded-card border border-cool-200 bg-white px-5 py-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12px] font-medium uppercase tracking-wide text-grey">{label}</p>
        {health ? <HealthDot health={health} /> : null}
      </div>
      <p className={`tnum mt-2 whitespace-nowrap text-[22px] font-semibold leading-none xl:text-[24px] ${valueColor}`}>{value}</p>
      {sub ? <p className="mt-2 text-[12.5px] text-grey">{sub}</p> : null}
    </div>
  );
}
