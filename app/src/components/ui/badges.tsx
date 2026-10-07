import type { Health, ProjectStatus, RiskLevel } from "@naamii/core";
import { labelFor } from "@/lib/format";

const HEALTH_STYLE: Record<Health, { dot: string; text: string; label: string; icon: string }> = {
  good:     { dot: "bg-good",     text: "text-good",     label: "On track",   icon: "●" },
  warning:  { dot: "bg-warning",  text: "text-warning",  label: "Attention",  icon: "▲" },
  critical: { dot: "bg-critical", text: "text-critical", label: "At risk",    icon: "■" },
  unknown:  { dot: "bg-cool",     text: "text-grey",     label: "No data",    icon: "○" },
};

/** Traffic-light indicator: colour + shape + label, never colour alone. */
export function HealthDot({ health, title }: { health: Health; title?: string }) {
  const s = HEALTH_STYLE[health];
  return (
    <span className={`inline-flex items-center gap-1.5 text-[12px] font-medium ${s.text}`} title={title ?? s.label} aria-label={title ?? s.label}>
      <span aria-hidden className="text-[10px] leading-none">{s.icon}</span>
    </span>
  );
}

export function HealthBadge({ health, label }: { health: Health; label?: string }) {
  const s = HEALTH_STYLE[health];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border border-cool-200 bg-white px-2 py-0.5 text-[12px] font-medium ${s.text}`}>
      <span aria-hidden className="text-[10px] leading-none">{s.icon}</span>
      {label ?? s.label}
    </span>
  );
}

const STATUS_STYLE: Record<ProjectStatus, string> = {
  active: "bg-cool-100 text-ink border-cool-300",
  planned: "bg-white text-grey border-cool-300",
  on_hold: "bg-white text-warning border-cool-300",
  completed: "bg-white text-good border-cool-300",
  closed: "bg-white text-grey border-cool-300",
  cancelled: "bg-white text-grey border-cool-300 line-through",
};

export function StatusBadge({ status }: { status: ProjectStatus }) {
  return <span className={`inline-block rounded-full border px-2 py-0.5 text-[12px] font-medium ${STATUS_STYLE[status]}`}>{labelFor(status)}</span>;
}

const RISK_STYLE: Record<RiskLevel, string> = {
  low: "text-grey", medium: "text-ink", high: "text-warning", critical: "text-critical",
};
export function RiskBadge({ level }: { level: RiskLevel }) {
  return <span className={`text-[12px] font-semibold ${RISK_STYLE[level]}`}>{labelFor(level)}</span>;
}
