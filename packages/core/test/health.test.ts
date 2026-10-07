import { describe, expect, it } from "vitest";
import {
  DEFAULT_HEALTH_RULES, isAtRisk, projectAlerts, projectHealth, type HealthInput,
} from "../src/index.js";

const today = new Date(Date.UTC(2026, 9, 7)); // 7 Oct 2026

const base = (over: Partial<HealthInput> = {}): HealthInput => ({
  status: "active",
  startDate: "2025-01-01",
  endDate: "2027-12-31",
  totals: { budget: 100, actual: 50, committed: 0, forecast: 100, forecastToDate: 55 },
  milestones: [],
  risks: [],
  ...over,
});

describe("project health rules", () => {
  it("is good when spend tracks time and nothing is overdue", () => {
    const h = projectHealth(base({ milestones: [{ id: "m", name: "x", dueDate: "2027-01-01", completionDate: null, status: "not_started", isDeliverable: true }] }), today);
    expect(h).toEqual({ financial: "good", schedule: "good", deliverables: "good", risk: "good", overall: "good" });
    expect(isAtRisk(h)).toBe(false);
  });

  it("flags utilisation above 85% as a financial warning and ≥100% as critical", () => {
    expect(projectHealth(base({ totals: { budget: 100, actual: 90, committed: 0, forecast: 100, forecastToDate: 60 } }), today).financial).toBe("warning");
    expect(projectHealth(base({ totals: { budget: 100, actual: 101, committed: 0, forecast: 100, forecastToDate: 60 } }), today).financial).toBe("critical");
  });

  it("does not punish a completed project that finished within budget", () => {
    const h = projectHealth(base({ status: "completed", totals: { budget: 100, actual: 96, committed: 0, forecast: 100, forecastToDate: 100 } }), today);
    expect(h.financial).toBe("good");
    expect(h.schedule).toBe("good");
  });

  it("flags spending far below forecast as a warning", () => {
    const h = projectHealth(base({ startDate: "2026-03-01", endDate: "2028-02-29", totals: { budget: 100, actual: 9, committed: 0, forecast: 100, forecastToDate: 29 } }), today);
    expect(h.financial).toBe("warning");
    expect(projectAlerts(base({ startDate: "2026-03-01", endDate: "2028-02-29", totals: { budget: 100, actual: 9, committed: 0, forecast: 100, forecastToDate: 29 } }), today).map(a => a.code)).toContain("BELOW_FORECAST");
  });

  it("flags an active project past its end date as a schedule failure", () => {
    const h = projectHealth(base({ endDate: "2026-09-30" }), today);
    expect(h.schedule).toBe("critical");
    expect(projectAlerts(base({ endDate: "2026-09-30" }), today)[0].code).toBe("END_DATE_PASSED");
  });

  it("counts overdue milestones: one = warning, two = critical", () => {
    const m = (name: string, due: string): HealthInput["milestones"][number] => ({ id: name, name, dueDate: due, completionDate: null, status: "in_progress", isDeliverable: true });
    expect(projectHealth(base({ milestones: [m("a", "2026-09-30")] }), today).deliverables).toBe("warning");
    const two = projectHealth(base({ milestones: [m("a", "2026-06-30"), m("b", "2026-09-30")] }), today);
    expect(two.deliverables).toBe("critical");
    expect(isAtRisk(two)).toBe(true);
    const alert = projectAlerts(base({ milestones: [m("a", "2026-06-30"), m("b", "2026-09-30")] }), today).find(a => a.code === "MILESTONES_OVERDUE");
    expect(alert?.message).toBe("2 milestones are overdue: a, b.");
  });

  it("uses the highest open risk level", () => {
    const risks: HealthInput["risks"] = [
      { id: "1", issue: "x", riskLevel: "high", owner: null, dueDate: null, status: "open" },
      { id: "2", issue: "y", riskLevel: "critical", owner: null, dueDate: null, status: "closed" },
    ];
    expect(projectHealth(base({ risks }), today).risk).toBe("warning");
  });

  it("raises an informational 'ends soon' alert inside 90 days", () => {
    const alerts = projectAlerts(base({ endDate: "2026-12-31" }), today);
    expect(alerts.find(a => a.code === "ENDS_SOON")?.message).toBe("Project ends in 85 days.");
  });

  it("thresholds are configurable", () => {
    const rules = { ...DEFAULT_HEALTH_RULES, financial: { ...DEFAULT_HEALTH_RULES.financial, warningUtilization: 40 } };
    expect(projectHealth(base(), today, rules).financial).toBe("warning");
  });
});
