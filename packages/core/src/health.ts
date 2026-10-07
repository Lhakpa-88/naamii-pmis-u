/**
 * Project health and alerts — rule-based, configurable, data-driven.
 * The thresholds live in one place (DEFAULT_HEALTH_RULES) and can be overridden
 * per deployment (e.g. from a settings table) without touching any UI code.
 */
import {
  daysRemaining,
  elapsedFraction,
  isOpen,
  parseISODate,
  spendPaceIndex,
  utilizationPct,
} from "./calculations.js";
import type { Alert, FinancialTotals, Health, Milestone, ProjectHealth, ProjectStatus, Risk } from "./types.js";

export interface HealthRules {
  financial: {
    /** Utilisation % at which the project is flagged amber. */
    warningUtilization: number;
    /** Utilisation % at which the project is flagged red. */
    criticalUtilization: number;
    /** Spend pace (utilisation ÷ time elapsed) above which the project is amber / red. */
    overPaceWarning: number;
    overPaceCritical: number;
    /** Actual ÷ forecast-to-date below which spending is "significantly below forecast". */
    underSpendRatio: number;
    /** Ignore pace/under-spend judgements before this share of the timeline has elapsed. */
    minElapsedForPace: number;
  };
  schedule: {
    /** Days-remaining at which an active project is flagged amber. */
    warningDays: number;
    /** Days-remaining at which an "ends soon" alert is raised (informational). */
    alertDays: number;
  };
  deliverables: {
    warningOverdue: number;
    criticalOverdue: number;
  };
}

export const DEFAULT_HEALTH_RULES: HealthRules = {
  financial: {
    warningUtilization: 85,
    criticalUtilization: 100,
    overPaceWarning: 1.15,
    overPaceCritical: 1.3,
    underSpendRatio: 0.5,
    minElapsedForPace: 0.2,
  },
  schedule: { warningDays: 30, alertDays: 90 },
  deliverables: { warningOverdue: 1, criticalOverdue: 2 },
};

const RANK: Record<Health, number> = { unknown: 0, good: 1, warning: 2, critical: 3 };

export function worstOf(...hs: Health[]): Health {
  return hs.reduce((acc, h) => (RANK[h] > RANK[acc] ? h : acc), "unknown" as Health);
}

export interface HealthInput {
  status: ProjectStatus;
  startDate: string | null;
  endDate: string | null;
  totals: FinancialTotals;
  milestones: Milestone[];
  risks: Risk[];
}

export function isMilestoneOverdue(m: Milestone, today: Date): boolean {
  if (!m.dueDate || m.status === "completed" || m.status === "cancelled") return false;
  return parseISODate(m.dueDate).getTime() < Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
}

export function overdueMilestones(milestones: Milestone[], today: Date): Milestone[] {
  return milestones.filter((m) => isMilestoneOverdue(m, today));
}

export function openRisks(risks: Risk[]): Risk[] {
  return risks.filter((r) => r.status !== "closed");
}

export function financialHealth(input: HealthInput, today: Date, rules: HealthRules = DEFAULT_HEALTH_RULES): Health {
  const { totals, status } = input;
  const util = utilizationPct(totals.actual, totals.budget);
  if (util === null) return "unknown";
  const r = rules.financial;

  if (util >= r.criticalUtilization) return isOpen(status) ? "critical" : "warning";
  if (!isOpen(status)) return "good"; // a closed project that stayed within budget is healthy

  if (util >= r.warningUtilization) return "warning";

  const elapsed = elapsedFraction(input.startDate, input.endDate, today);
  const pace = spendPaceIndex(util, elapsed);
  if (elapsed !== null && elapsed >= r.minElapsedForPace && pace !== null) {
    if (pace >= r.overPaceCritical) return "critical";
    if (pace >= r.overPaceWarning) return "warning";
    if (totals.forecastToDate > 0 && totals.actual / totals.forecastToDate < r.underSpendRatio) return "warning";
  }
  return "good";
}

export function scheduleHealth(input: HealthInput, today: Date, rules: HealthRules = DEFAULT_HEALTH_RULES): Health {
  if (!isOpen(input.status)) return "good";
  const days = daysRemaining(input.endDate, today);
  if (days === null) return "unknown";
  if (days < 0) return "critical";
  if (days <= rules.schedule.warningDays) return "warning";
  return "good";
}

export function deliverablesHealth(input: HealthInput, today: Date, rules: HealthRules = DEFAULT_HEALTH_RULES): Health {
  if (input.milestones.length === 0) return "unknown";
  const overdue = overdueMilestones(input.milestones, today).length;
  if (overdue >= rules.deliverables.criticalOverdue) return "critical";
  if (overdue >= rules.deliverables.warningOverdue) return "warning";
  return "good";
}

export function riskHealth(input: HealthInput): Health {
  const open = openRisks(input.risks);
  if (open.some((r) => r.riskLevel === "critical")) return "critical";
  if (open.some((r) => r.riskLevel === "high")) return "warning";
  return "good";
}

export function projectHealth(input: HealthInput, today: Date, rules: HealthRules = DEFAULT_HEALTH_RULES): ProjectHealth {
  const financial = financialHealth(input, today, rules);
  const schedule = scheduleHealth(input, today, rules);
  const deliverables = deliverablesHealth(input, today, rules);
  const risk = riskHealth(input);
  return { financial, schedule, deliverables, risk, overall: worstOf(financial, schedule, deliverables, risk) };
}

/** "At risk" = any dimension red, or two or more amber. Used by portfolio KPIs. */
export function isAtRisk(h: ProjectHealth): boolean {
  const dims = [h.financial, h.schedule, h.deliverables, h.risk];
  return dims.includes("critical") || dims.filter((d) => d === "warning").length >= 2;
}

const pct = (n: number) => `${Math.round(n)}%`;

/** Data-driven alerts for a project page. Wording is generated from the numbers. */
export function projectAlerts(input: HealthInput, today: Date, rules: HealthRules = DEFAULT_HEALTH_RULES): Alert[] {
  const alerts: Alert[] = [];
  const { totals, status } = input;
  const util = utilizationPct(totals.actual, totals.budget);
  const r = rules.financial;

  if (util !== null) {
    if (util >= r.criticalUtilization) {
      alerts.push({ severity: "critical", code: "BUDGET_EXHAUSTED", message: `Budget utilisation is ${pct(util)} — the approved budget is exhausted.` });
    } else if (util >= r.warningUtilization && isOpen(status)) {
      alerts.push({ severity: "warning", code: "UTILIZATION_HIGH", message: `Budget utilisation is above ${r.warningUtilization}% (${pct(util)}).` });
    }
    if (isOpen(status) && totals.actual + totals.committed > totals.budget && util < r.criticalUtilization) {
      alerts.push({ severity: "warning", code: "COMMITMENTS_EXCEED", message: `Actual plus committed amounts exceed the approved budget.` });
    }
    const elapsed = elapsedFraction(input.startDate, input.endDate, today);
    const pace = spendPaceIndex(util, elapsed);
    if (isOpen(status) && elapsed !== null && elapsed >= r.minElapsedForPace && pace !== null) {
      if (pace >= r.overPaceWarning && util < r.warningUtilization) {
        alerts.push({ severity: "warning", code: "SPEND_AHEAD_OF_SCHEDULE", message: `Spending is ${pct((pace - 1) * 100)} ahead of the time elapsed.` });
      }
      if (totals.forecastToDate > 0 && totals.actual / totals.forecastToDate < r.underSpendRatio) {
        alerts.push({ severity: "warning", code: "BELOW_FORECAST", message: `Actual expenditure is ${pct((totals.actual / totals.forecastToDate) * 100)} of forecast to date — significantly below forecast.` });
      }
    }
  }

  if (isOpen(status)) {
    const days = daysRemaining(input.endDate, today);
    if (days !== null) {
      if (days < 0) alerts.push({ severity: "critical", code: "END_DATE_PASSED", message: `The end date passed ${Math.abs(days)} days ago but the project is still ${status}.` });
      else if (days <= rules.schedule.alertDays) alerts.push({ severity: days <= rules.schedule.warningDays ? "warning" : "info", code: "ENDS_SOON", message: `Project ends in ${days} days.` });
    }
  }

  const overdue = overdueMilestones(input.milestones, today);
  if (overdue.length > 0) {
    const names = overdue.map((m) => m.name).join(", ");
    alerts.push({
      severity: overdue.length >= rules.deliverables.criticalOverdue ? "critical" : "warning",
      code: "MILESTONES_OVERDUE",
      message: `${overdue.length} milestone${overdue.length === 1 ? " is" : "s are"} overdue: ${names}.`,
    });
  }

  const open = openRisks(input.risks).filter((x) => x.riskLevel === "high" || x.riskLevel === "critical");
  if (open.length > 0) {
    alerts.push({
      severity: open.some((x) => x.riskLevel === "critical") ? "critical" : "warning",
      code: "RISKS_OPEN",
      message: `${open.length} high or critical risk${open.length === 1 ? "" : "s"} open.`,
    });
  }

  const order = { critical: 0, warning: 1, info: 2 } as const;
  return alerts.sort((a, b) => order[a.severity] - order[b.severity]);
}
