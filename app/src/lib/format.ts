/**
 * Presentation formatting helpers (PRESENTATION layer — no business rules).
 * NPR follows Nepali grouping (lakh / crore); other currencies use Western grouping.
 */

const NPR_FULL = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const INTL_FULL = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export function formatMoney(amount: number | null | undefined, currency = "NPR", opts: { compact?: boolean; withCode?: boolean } = {}): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return "—";
  const code = opts.withCode === false ? "" : `${currency} `;
  const sign = amount < 0 ? "−" : "";
  const abs = Math.abs(amount);
  if (opts.compact) {
    if (currency === "NPR") {
      if (abs >= 1e7) return `${code}${sign}${trim(abs / 1e7)} cr`;
      if (abs >= 1e5) return `${code}${sign}${trim(abs / 1e5)} lakh`;
      return `${code}${sign}${NPR_FULL.format(abs)}`;
    }
    if (abs >= 1e9) return `${code}${sign}${trim(abs / 1e9)}B`;
    if (abs >= 1e6) return `${code}${sign}${trim(abs / 1e6)}M`;
    if (abs >= 1e3) return `${code}${sign}${trim(abs / 1e3)}K`;
    return `${code}${sign}${INTL_FULL.format(abs)}`;
  }
  return `${code}${sign}${(currency === "NPR" ? NPR_FULL : INTL_FULL).format(abs)}`;
}

function trim(n: number): string {
  return n >= 100 ? n.toFixed(0) : n >= 10 ? n.toFixed(1) : n.toFixed(2);
}

export function formatPct(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${value.toFixed(digits)}%`;
}

const DATE_FMT = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const MONTH_FMT = new Intl.DateTimeFormat("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" });
const DATETIME_FMT = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kathmandu", timeZoneName: "short" });

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return DATE_FMT.format(new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso));
}

export function formatMonth(iso: string): string {
  return MONTH_FMT.format(new Date(`${iso.slice(0, 10)}T00:00:00Z`));
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return DATETIME_FMT.format(new Date(iso));
}

export function formatDays(days: number | null | undefined): string {
  if (days === null || days === undefined) return "—";
  if (days < 0) return `${Math.abs(days)} days overdue`;
  if (days === 0) return "Ends today";
  return `${days} days`;
}

export const STATUS_LABEL: Record<string, string> = {
  planned: "Planned", active: "Active", on_hold: "On hold", completed: "Completed", closed: "Closed", cancelled: "Cancelled",
  not_started: "Not started", in_progress: "In progress", open: "Open", mitigating: "Mitigating",
  low: "Low", medium: "Medium", high: "High", critical: "Critical",
};

export function labelFor(value: string | null | undefined): string {
  if (!value) return "—";
  return STATUS_LABEL[value] ?? value.replace(/_/g, " ");
}
