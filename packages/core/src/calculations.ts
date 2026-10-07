/**
 * Centralised financial and schedule calculations.
 * Every dashboard figure that is *derived* comes from here, so a formula is
 * defined once and tested once. Inputs are stored facts; nothing here reads
 * a database or renders UI.
 *
 *   Budget Utilisation % = Actual Expenditure / Approved Budget × 100
 *   Remaining Budget     = Approved Budget − Actual Expenditure
 *   Budget Variance      = Budget − Actual
 *   Forecast Variance    = Forecast − Budget
 *   Days Remaining       = Project End Date − Current Date
 */
import type { FinancialTotals, MonthlyFinancial, ProjectStatus } from "./types.js";

const MS_PER_DAY = 86_400_000;

/** Parse an ISO date (YYYY-MM-DD) as a UTC date to avoid timezone drift. */
export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
}

export function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Actual / Budget × 100. Returns null when there is no budget to divide by. */
export function utilizationPct(actual: number, budget: number): number | null {
  if (!Number.isFinite(budget) || budget <= 0) return null;
  return (actual / budget) * 100;
}

/** Approved Budget − Actual Expenditure (may be negative when over-spent). */
export function remainingBudget(budget: number, actual: number): number {
  return budget - actual;
}

/** Budget − Actual − Committed: what is still free to commit. */
export function uncommittedBudget(budget: number, actual: number, committed: number): number {
  return budget - actual - committed;
}

/** Budget − Actual. Positive = under budget. */
export function budgetVariance(budget: number, actual: number): number {
  return budget - actual;
}

/** Forecast − Budget. Positive = forecast overrun. */
export function forecastVariance(forecast: number, budget: number): number {
  return forecast - budget;
}

/** Whole days from `today` to `endDate` (negative once the end date has passed). */
export function daysRemaining(endDate: string | null, today: Date): number | null {
  if (!endDate) return null;
  const end = parseISODate(endDate);
  const t = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.round((end.getTime() - t) / MS_PER_DAY);
}

/** Share of the project duration that has elapsed, clamped to [0, 1]. */
export function elapsedFraction(startDate: string | null, endDate: string | null, today: Date): number | null {
  if (!startDate || !endDate) return null;
  const s = parseISODate(startDate).getTime();
  const e = parseISODate(endDate).getTime();
  if (e <= s) return null;
  const t = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.min(1, Math.max(0, (t - s) / (e - s)));
}

/**
 * Spend pace: utilisation relative to time elapsed.
 * 1.0 = spending exactly in line with the calendar; 1.3 = 30% ahead of time.
 */
export function spendPaceIndex(utilizationPercent: number | null, elapsed: number | null): number | null {
  if (utilizationPercent === null || elapsed === null || elapsed < 0.05) return null;
  return utilizationPercent / 100 / elapsed;
}

/**
 * Aggregate monthly facts into totals as of a reporting month.
 * `actual` and `committed` are summed over everything (closed months carry the
 * actuals; open months carry commitments). `forecastToDate` sums forecast for
 * months up to and including `asOfPeriod` so under/over-spend can be judged.
 */
export function aggregateTotals(rows: MonthlyFinancial[], approvedBudget: number, asOfPeriod: string): FinancialTotals {
  let actual = 0, committed = 0, forecast = 0, forecastToDate = 0;
  for (const r of rows) {
    actual += r.actual;
    committed += r.committed;
    forecast += r.forecast;
    if (r.period <= asOfPeriod) forecastToDate += r.forecast;
  }
  return { budget: approvedBudget, actual, committed, forecast, forecastToDate };
}

/** First day of the month containing `d`, as ISO. */
export function monthStart(d: Date): string {
  return toISODate(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)));
}

/**
 * Nepal fiscal-year label for a Gregorian date, e.g. 2026-10-07 → "2083/84".
 * The FY begins on Shrawan 1 (≈ 16/17 July). This is a labelling helper for
 * grouping and filters, not an accounting calendar; mirrors app.fiscal_year_label().
 */
export function fiscalYearLabel(iso: string): string {
  const d = parseISODate(iso);
  const m = d.getUTCMonth() + 1, day = d.getUTCDate(), y = d.getUTCFullYear();
  const fyStart = m > 7 || (m === 7 && day >= 16) ? y : y - 1;
  const bs = fyStart + 57;
  return `${bs}/${String((bs + 1) % 100).padStart(2, "0")}`;
}

export const ACTIVE_STATUSES: ReadonlySet<ProjectStatus> = new Set(["active"]);
export const OPEN_STATUSES: ReadonlySet<ProjectStatus> = new Set(["planned", "active", "on_hold"]);
export const CLOSED_STATUSES: ReadonlySet<ProjectStatus> = new Set(["completed", "closed", "cancelled"]);

export function isOpen(status: ProjectStatus): boolean {
  return OPEN_STATUSES.has(status);
}

/** Sum a numeric field across rows (null-safe). */
export function sumBy<T>(rows: T[], pick: (row: T) => number | null | undefined): number {
  let s = 0;
  for (const r of rows) s += pick(r) ?? 0;
  return s;
}

/** Group rows by a key, preserving first-seen order. */
export function groupBy<T, K extends string>(rows: T[], key: (row: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>();
  for (const r of rows) {
    const k = key(r);
    const arr = m.get(k);
    if (arr) arr.push(r); else m.set(k, [r]);
  }
  return m;
}
