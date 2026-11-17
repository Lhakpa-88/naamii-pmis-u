/**
 * Data-entry model (business rule, not UI).
 *
 * One definition of every field that can be entered — used by the Excel
 * template, the Excel importer and the on-screen forms, so all three accept
 * exactly the same data and apply exactly the same validation.
 *
 * Who enters what:
 *   Finance & Operations (admin)  → every sheet below.
 *   Project Lead (project manager)→ Milestones, Risks, Team and the monthly
 *                                   Forecast for their own projects (no budget,
 *                                   actual, committed or compensation data).
 * The database enforces the same split with Row Level Security.
 */
import type { Role } from "./types.js";

export type EntryEntity = "projects" | "financials" | "milestones" | "risks" | "team";
export type FieldType = "text" | "number" | "date" | "month" | "enum" | "boolean";

export interface FieldSpec {
  /** Stable key used in forms and by the importer. */
  key: string;
  /** Column heading in the Excel template and label on the form. */
  header: string;
  type: FieldType;
  required?: boolean;
  /** Allowed values for `enum` fields (stored value; shown with enumLabel). */
  options?: readonly string[];
  min?: number;
  max?: number;
  /** Only Finance & Operations may enter this field. */
  financeOnly?: boolean;
  /** Shown in the template (cell note + Instructions sheet) and as a form hint. */
  help: string;
}

export interface SheetSpec {
  entity: EntryEntity;
  /** Worksheet name in the template. */
  sheet: string;
  /** Singular noun for messages, e.g. "milestone". */
  noun: string;
  /** Only Finance & Operations may enter this sheet at all. */
  financeOnly: boolean;
  /** How an existing record is recognised when a workbook is imported. */
  matchedBy: string;
  description: string;
  fields: FieldSpec[];
}

export const PROJECT_STATUSES = ["planned", "active", "on_hold", "completed", "closed", "cancelled"] as const;
export const MILESTONE_STATUSES = ["not_started", "in_progress", "completed", "cancelled"] as const;
export const RISK_LEVELS = ["low", "medium", "high", "critical"] as const;
export const ISSUE_STATUSES = ["open", "mitigating", "closed"] as const;

const PROJECT_CODE: FieldSpec = { key: "project_code", header: "Project code", type: "text", required: true, help: "Code of an existing project (see the Lists sheet), or one defined on the Projects sheet of this workbook." };

export const ENTRY_SHEETS: readonly SheetSpec[] = [
  {
    entity: "projects", sheet: "Projects", noun: "project", financeOnly: true, matchedBy: "Project code",
    description: "One row per project: the master record — lab, people, funder, approved budget and dates.",
    fields: [
      { key: "code", header: "Project code", type: "text", required: true, help: "Short unique code, e.g. AIM-2026-01. Used to match rows on every other sheet." },
      { key: "name", header: "Project name", type: "text", required: true, help: "Full project title." },
      { key: "lab_code", header: "Lab code", type: "text", required: true, help: "Code of the lab that owns the project (see the Lists sheet)." },
      { key: "pi_email", header: "PI email", type: "text", help: "E-mail of the Principal Investigator (must be a PMIS user with the PI role)." },
      { key: "lead_email", header: "Project lead email", type: "text", help: "E-mail of the project manager (must be a PMIS user with the Project Lead role). They can then enter milestones, risks and team for this project." },
      { key: "funder", header: "Funder", type: "text", help: "Funding organisation." },
      { key: "project_type", header: "Project type", type: "text", help: "e.g. Research, Service, Capacity building." },
      { key: "status", header: "Status", type: "enum", options: PROJECT_STATUSES, help: "Defaults to Active when left blank on a new project." },
      { key: "currency", header: "Currency", type: "text", help: "Three-letter code, e.g. NPR or USD. Defaults to NPR." },
      { key: "total_budget", header: "Total budget", type: "number", required: true, min: 0, help: "Approved total budget in the project currency (plain number, no symbols)." },
      { key: "start_date", header: "Start date", type: "date", help: "Date as YYYY-MM-DD." },
      { key: "end_date", header: "End date", type: "date", help: "Date as YYYY-MM-DD. Must not be before the start date." },
      { key: "description", header: "Description", type: "text", help: "Short summary of the project." },
    ],
  },
  {
    entity: "financials", sheet: "Financials", noun: "monthly financial record", financeOnly: false, matchedBy: "Project code + Month",
    description: "One row per project per month. Budget, Actual, Committed and Forecast are separate facts — never add them together.",
    fields: [
      PROJECT_CODE,
      { key: "month", header: "Month", type: "month", required: true, help: "Month as YYYY-MM (e.g. 2026-07), or any date in that month." },
      { key: "budget", header: "Budget", type: "number", financeOnly: true, help: "Phased budget for the month. Finance & Operations only." },
      { key: "actual", header: "Actual expenditure", type: "number", financeOnly: true, help: "Actual spend booked in the month. Finance & Operations only." },
      { key: "committed", header: "Committed", type: "number", financeOnly: true, help: "Open commitments (ordered, not yet paid). Finance & Operations only." },
      { key: "forecast", header: "Forecast", type: "number", help: "Forecast spend for the month. Entered by the Project Lead or by Finance & Operations." },
    ],
  },
  {
    entity: "milestones", sheet: "Milestones", noun: "milestone", financeOnly: false, matchedBy: "Project code + Milestone",
    description: "Milestones and deliverables with their due dates and progress.",
    fields: [
      PROJECT_CODE,
      { key: "name", header: "Milestone", type: "text", required: true, help: "Name of the milestone or deliverable (unique within the project)." },
      { key: "due_date", header: "Due date", type: "date", help: "Date as YYYY-MM-DD." },
      { key: "completion_date", header: "Completion date", type: "date", help: "Date actually completed (YYYY-MM-DD); leave blank until done." },
      { key: "status", header: "Status", type: "enum", options: MILESTONE_STATUSES, help: "Defaults to Not started." },
      { key: "is_deliverable", header: "Deliverable", type: "boolean", help: "Yes if this is a contractual deliverable to the funder, otherwise No." },
      { key: "description", header: "Description", type: "text", help: "Optional notes." },
    ],
  },
  {
    entity: "risks", sheet: "Risks", noun: "risk", financeOnly: false, matchedBy: "Project code + Issue",
    description: "Risks and issues, their level, owner and status.",
    fields: [
      PROJECT_CODE,
      { key: "issue", header: "Issue", type: "text", required: true, help: "Short statement of the risk or issue (unique within the project)." },
      { key: "risk_level", header: "Risk level", type: "enum", options: RISK_LEVELS, help: "Defaults to Medium." },
      { key: "owner", header: "Owner", type: "text", help: "Person responsible for handling it." },
      { key: "due_date", header: "Due date", type: "date", help: "Target date to resolve (YYYY-MM-DD)." },
      { key: "status", header: "Status", type: "enum", options: ISSUE_STATUSES, help: "Defaults to Open." },
    ],
  },
  {
    entity: "team", sheet: "Team", noun: "team member", financeOnly: false, matchedBy: "Project code + Person name",
    description: "People working on the project and their time allocation.",
    fields: [
      PROJECT_CODE,
      { key: "person_name", header: "Person name", type: "text", required: true, help: "Full name (unique within the project)." },
      { key: "role_title", header: "Role", type: "text", help: "Role on the project, e.g. Research Engineer." },
      { key: "allocation_pct", header: "Allocation %", type: "number", min: 0, max: 100, help: "Share of the person's time on this project, 0–100." },
      { key: "start_date", header: "Start date", type: "date", help: "Date as YYYY-MM-DD." },
      { key: "end_date", header: "End date", type: "date", help: "Date as YYYY-MM-DD. Must not be before the start date." },
      { key: "monthly_cost", header: "Monthly cost", type: "number", min: 0, financeOnly: true, help: "Monthly cost of the person to the project. Confidential: Finance & Operations only." },
    ],
  },
];

/** Roles that may enter data at all. */
export function canEnterData(role: Role): boolean {
  return role === "admin" || role === "project_lead";
}

/** May this role enter this entity (some field of it)? */
export function canEnterEntity(role: Role, entity: EntryEntity): boolean {
  if (role === "admin") return true;
  if (role !== "project_lead") return false;
  return !sheetFor(entity).financeOnly;
}

export function sheetFor(entity: EntryEntity): SheetSpec {
  const s = ENTRY_SHEETS.find((x) => x.entity === entity);
  if (!s) throw new Error(`Unknown entry entity: ${entity}`);
  return s;
}

/** The sheets — and within them the fields — a role may enter. */
export function entrySheetsFor(role: Role): SheetSpec[] {
  if (!canEnterData(role)) return [];
  return ENTRY_SHEETS
    .filter((s) => canEnterEntity(role, s.entity))
    .map((s) => ({ ...s, fields: s.fields.filter((f) => role === "admin" || !f.financeOnly) }));
}

/** 'in_progress' → 'In progress' */
export function enumLabel(value: string): string {
  const t = value.replace(/_/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

const normKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

/** Normalise a column heading for matching: case, spaces and the "*" required marker are ignored. */
export function normalizeHeader(h: string): string {
  return normKey(h);
}

export type EntryErrorCode = "MISSING_REQUIRED" | "INVALID_NUMBER" | "INVALID_DATE" | "INVALID_VALUE" | "OUT_OF_RANGE" | "INVALID_RANGE";

export interface FieldError {
  field: string; // column heading
  code: EntryErrorCode;
  message: string;
}

export type ParsedValue = string | number | boolean | null;

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const pad = (n: number) => String(n).padStart(2, "0");

function validYmd(y: number, m: number, d: number): string | null {
  if (y < 1990 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** Parse a date cell (Excel date, Excel serial number or 'YYYY-MM-DD' text) to an ISO date. */
export function parseDateValue(raw: unknown): string | null {
  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) return null;
    return validYmd(raw.getUTCFullYear(), raw.getUTCMonth() + 1, raw.getUTCDate());
  }
  if (typeof raw === "number") {
    // Excel serial date (days since 1899-12-30); only plausible modern dates.
    if (!Number.isFinite(raw) || raw < 32874 || raw > 73415) return null;
    const dt = new Date(Math.round((raw - 25569) * 86400000));
    return validYmd(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
  }
  const s = String(raw).trim();
  const iso = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T ].*)?$/.exec(s);
  if (iso) return validYmd(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  return null;
}

/** Parse a month cell ('YYYY-MM', 'Jul 2026', or any date in the month) to the first day of that month. */
export function parseMonthValue(raw: unknown): string | null {
  if (typeof raw === "string") {
    const s = raw.trim();
    const ym = /^(\d{4})[-/.](\d{1,2})$/.exec(s);
    if (ym) return validYmd(Number(ym[1]), Number(ym[2]), 1);
    const named = /^([A-Za-z]{3,9})[\s-]+(\d{4})$/.exec(s);
    if (named) {
      const m = MONTHS.indexOf(named[1].slice(0, 3).toLowerCase());
      return m === -1 ? null : validYmd(Number(named[2]), m + 1, 1);
    }
  }
  const d = parseDateValue(raw);
  return d ? `${d.slice(0, 7)}-01` : null;
}

export function parseNumberValue(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  const s = String(raw).trim().replace(/[,\s]/g, "").replace(/%$/, "");
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  return Number(s);
}

export function parseBooleanValue(raw: unknown): boolean | null {
  if (typeof raw === "boolean") return raw;
  const s = normKey(String(raw));
  if (["yes", "y", "true", "1", "on"].includes(s)) return true;
  if (["no", "n", "false", "0", "off"].includes(s)) return false;
  return null;
}

export function isBlank(raw: unknown): boolean {
  return raw === null || raw === undefined || (typeof raw === "string" && raw.trim() === "");
}

/** Validate one value against its field definition. Blank → null (no error unless required). */
export function parseField(spec: FieldSpec, raw: unknown): { value: ParsedValue; error?: FieldError } {
  const fail = (code: EntryErrorCode, message: string) => ({ value: null, error: { field: spec.header, code, message } });
  if (isBlank(raw)) {
    return spec.required ? fail("MISSING_REQUIRED", `${spec.header} is required.`) : { value: null };
  }
  switch (spec.type) {
    case "text": {
      const s = String(raw).trim();
      if (s.length > 2000) return fail("INVALID_VALUE", `${spec.header} is too long (maximum 2000 characters).`);
      return { value: s };
    }
    case "number": {
      const n = parseNumberValue(raw);
      if (n === null) return fail("INVALID_NUMBER", `${spec.header} must be a number (found “${String(raw)}”).`);
      if ((spec.min !== undefined && n < spec.min) || (spec.max !== undefined && n > spec.max)) {
        const range = spec.min !== undefined && spec.max !== undefined ? `between ${spec.min} and ${spec.max}` : spec.min !== undefined ? `${spec.min} or more` : `${spec.max} or less`;
        return fail("OUT_OF_RANGE", `${spec.header} must be ${range} (found ${n}).`);
      }
      return { value: n };
    }
    case "date": {
      const d = parseDateValue(raw);
      return d ? { value: d } : fail("INVALID_DATE", `${spec.header} must be a date such as 2026-07-15 (found “${String(raw)}”).`);
    }
    case "month": {
      const m = parseMonthValue(raw);
      return m ? { value: m } : fail("INVALID_DATE", `${spec.header} must be a month such as 2026-07 (found “${String(raw)}”).`);
    }
    case "boolean": {
      const b = parseBooleanValue(raw);
      return b === null ? fail("INVALID_VALUE", `${spec.header} must be Yes or No (found “${String(raw)}”).`) : { value: b };
    }
    case "enum": {
      const wanted = normKey(String(raw));
      const hit = (spec.options ?? []).find((o) => normKey(o) === wanted);
      return hit ? { value: hit } : fail("INVALID_VALUE", `${spec.header} must be one of: ${(spec.options ?? []).map(enumLabel).join(", ")} (found “${String(raw)}”).`);
    }
  }
}

/**
 * Validate one record (a template row or a submitted form) against a sheet.
 * `raw` is keyed by field key. Returns every problem found, not just the first.
 */
export function parseRecord(sheet: SheetSpec, raw: Record<string, unknown>): { values: Record<string, ParsedValue>; errors: FieldError[] } {
  const values: Record<string, ParsedValue> = {};
  const errors: FieldError[] = [];
  for (const f of sheet.fields) {
    const r = parseField(f, raw[f.key]);
    values[f.key] = r.value;
    if (r.error) errors.push(r.error);
  }
  const start = values.start_date, end = values.end_date;
  if (typeof start === "string" && typeof end === "string" && end < start) {
    errors.push({ field: "End date", code: "INVALID_RANGE", message: `End date (${end}) is before the start date (${start}).` });
  }
  if (sheet.entity === "projects" && typeof values.currency === "string") {
    const c = values.currency.toUpperCase();
    if (!/^[A-Z]{3}$/.test(c)) errors.push({ field: "Currency", code: "INVALID_VALUE", message: `Currency must be a three-letter code such as NPR (found “${values.currency}”).` });
    else values.currency = c;
  }
  return { values, errors };
}
