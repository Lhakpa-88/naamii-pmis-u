import { monthStart, toISODate } from "@naamii/core";

/** Reporting window for trend charts: 18 closed months back, 6 months forward. */
export function trendWindow(today: Date) {
  const cur = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const from = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() - 18, 1));
  const to = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 6, 1));
  // "Current period" for actuals = the last fully closed month (previous month).
  const closed = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() - 1, 1));
  return { from: toISODate(from), to: toISODate(to), currentPeriod: monthStart(closed) };
}
