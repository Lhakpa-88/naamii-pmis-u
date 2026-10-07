import { describe, expect, it } from "vitest";
import {
  aggregateTotals, budgetVariance, daysRemaining, elapsedFraction, fiscalYearLabel,
  forecastVariance, remainingBudget, spendPaceIndex, uncommittedBudget, utilizationPct,
} from "../src/index.js";

const today = new Date(Date.UTC(2026, 9, 7)); // 7 Oct 2026

describe("financial formulas", () => {
  it("utilisation = actual / budget × 100", () => {
    expect(utilizationPct(20_785_341, 22_500_000)).toBeCloseTo(92.38, 1);
    expect(utilizationPct(0, 100)).toBe(0);
  });
  it("utilisation is null when there is no budget", () => {
    expect(utilizationPct(10, 0)).toBeNull();
  });
  it("remaining = budget − actual (can go negative)", () => {
    expect(remainingBudget(100, 30)).toBe(70);
    expect(remainingBudget(100, 130)).toBe(-30);
  });
  it("uncommitted = budget − actual − committed", () => {
    expect(uncommittedBudget(100, 30, 20)).toBe(50);
  });
  it("variances keep budget, actual and forecast distinct", () => {
    expect(budgetVariance(100, 80)).toBe(20);      // under budget
    expect(forecastVariance(110, 100)).toBe(10);   // forecast overrun
  });
});

describe("schedule formulas", () => {
  it("days remaining counts whole days to the end date", () => {
    expect(daysRemaining("2026-12-31", today)).toBe(85);
    expect(daysRemaining("2026-10-07", today)).toBe(0);
    expect(daysRemaining("2026-09-30", today)).toBe(-7);
    expect(daysRemaining(null, today)).toBeNull();
  });
  it("elapsed fraction is clamped to [0,1]", () => {
    expect(elapsedFraction("2025-01-01", "2026-12-31", today)).toBeCloseTo(0.88, 2);
    expect(elapsedFraction("2027-01-01", "2028-01-01", today)).toBe(0);
    expect(elapsedFraction("2020-01-01", "2021-01-01", today)).toBe(1);
  });
  it("spend pace compares utilisation with time elapsed", () => {
    expect(spendPaceIndex(50, 0.5)).toBeCloseTo(1);
    expect(spendPaceIndex(65, 0.5)).toBeCloseTo(1.3);
    expect(spendPaceIndex(50, 0.01)).toBeNull(); // too early to judge
  });
});

describe("aggregation", () => {
  it("sums actuals/commitments over all rows and forecast only to date", () => {
    const rows = [
      { period: "2026-08-01", fiscalYear: "2083/84", budget: 10, actual: 9, committed: 0, forecast: 10 },
      { period: "2026-09-01", fiscalYear: "2083/84", budget: 10, actual: 8, committed: 0, forecast: 10 },
      { period: "2026-10-01", fiscalYear: "2083/84", budget: 10, actual: 0, committed: 4, forecast: 11 },
      { period: "2026-11-01", fiscalYear: "2083/84", budget: 10, actual: 0, committed: 0, forecast: 11 },
    ];
    const t = aggregateTotals(rows, 40, "2026-09-01");
    expect(t).toEqual({ budget: 40, actual: 17, committed: 4, forecast: 42, forecastToDate: 20 });
  });
});

describe("Nepal fiscal year label", () => {
  it("rolls over in mid-July", () => {
    expect(fiscalYearLabel("2026-10-07")).toBe("2083/84");
    expect(fiscalYearLabel("2026-07-15")).toBe("2082/83");
    expect(fiscalYearLabel("2026-07-16")).toBe("2083/84");
    expect(fiscalYearLabel("2025-01-01")).toBe("2081/82");
  });
});
