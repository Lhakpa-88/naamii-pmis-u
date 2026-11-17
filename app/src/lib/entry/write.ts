import "server-only";
import type { EntryEntity, ParsedValue } from "@naamii/core";
import { sheetFor } from "@naamii/core";
import type { Queryable } from "../db";

/**
 * DATA ACCESS LAYER — writes. The single place where entered data (from a form
 * or an imported workbook) reaches the database. Every statement runs as the
 * signed-in user, so Row Level Security decides whether it is allowed; this
 * module only translates validated values into rows and database refusals
 * into messages a person can act on.
 */

export class EntryError extends Error {
  constructor(public code: string, message: string, public field: string | null = null) {
    super(message);
    this.name = "EntryError";
  }
}

export interface Provenance {
  sourceFile: string;
  sourceSheet?: string | null;
  sourceRow?: number | null;
  importRunId?: string | null;
}

/** "import": a blank cell leaves the stored value untouched. "form": a blank field clears it. */
export type WriteMode = "import" | "form";

export interface RefData {
  labs: Map<string, string>;                                   // lab code → id
  users: Map<string, { id: string; role: string }>;            // e-mail → user
  projects: Map<string, { id: string; currency: string }>;     // project code → project
  fiscalYears: Map<string, string>;
}

const lc = (s: string) => s.trim().toLowerCase();

/** Reference values the caller is entitled to see (RLS applies to projects). */
export async function loadRefData(q: Queryable): Promise<RefData> {
  const labs = await q.query<{ id: string; code: string }>("SELECT id, code FROM labs WHERE active");
  const users = await q.query<{ id: string; email: string; role: string }>("SELECT id, email, role FROM users WHERE active");
  const projects = await q.query<{ id: string; code: string; currency: string }>("SELECT id, code, currency FROM projects");
  return {
    labs: new Map(labs.rows.map((r) => [lc(r.code), r.id])),
    users: new Map(users.rows.map((r) => [lc(r.email), { id: r.id, role: r.role }])),
    projects: new Map(projects.rows.map((r) => [lc(r.code), { id: r.id, currency: r.currency }])),
    fiscalYears: new Map(),
  };
}

type Cols = Record<string, unknown>;

/** Columns that are NOT NULL with a default: a blank never overwrites them. */
const KEEP_WHEN_BLANK: Record<EntryEntity, string[]> = {
  projects: ["code", "name", "lab_id", "status", "currency", "total_budget"],
  financials: ["budget", "actual_expenditure", "committed_amount", "forecast"],
  milestones: ["name", "status", "is_deliverable"],
  risks: ["issue", "risk_level", "status"],
  team: ["person_name"],
};

const TABLE: Record<EntryEntity, string> = {
  projects: "projects",
  financials: "project_financials",
  milestones: "project_milestones",
  risks: "project_risks",
  team: "project_team_members",
};

function provCols(p: Provenance): Cols {
  return {
    source_file: p.sourceFile,
    source_sheet: p.sourceSheet ?? null,
    source_row: p.sourceRow ?? null,
    imported_at: new Date(),
    import_status: "success",
    import_run_id: p.importRunId ?? null,
  };
}

/** Drop the values that must not be written: `undefined` always; blanks per mode. */
function writable(entity: EntryEntity, cols: Record<string, ParsedValue | undefined>, mode: WriteMode): Cols {
  const out: Cols = {};
  for (const [k, v] of Object.entries(cols)) {
    if (v === undefined) continue;
    if (v === null && (mode === "import" || KEEP_WHEN_BLANK[entity].includes(k))) continue;
    out[k] = v;
  }
  return out;
}

function friendly(err: unknown, entity: EntryEntity): EntryError {
  if (err instanceof EntryError) return err;
  const e = err as { code?: string; message?: string; constraint?: string };
  const noun = sheetFor(entity).noun;
  switch (e.code) {
    case "42501":
      return new EntryError("NOT_PERMITTED", `Your role is not permitted to enter this ${noun}.`);
    case "23505":
      return new EntryError("DUPLICATE", `A ${noun} with the same ${sheetFor(entity).matchedBy.replace("Project code + ", "").toLowerCase()} already exists.`);
    case "23514":
      return new EntryError("INVALID_VALUE", `The ${noun} breaks a data rule (${e.constraint ?? "check"}), for example an end date before the start date or a negative amount.`);
    case "23503":
      return new EntryError("INVALID_REFERENCE", `The ${noun} refers to a record that does not exist.`);
    case "22001":
      return new EntryError("INVALID_VALUE", `A value in the ${noun} is too long.`);
    default:
      return new EntryError("DATABASE_ERROR", `The ${noun} could not be saved: ${e.message ?? "unknown error"}`);
  }
}

async function insertRow(q: Queryable, table: string, cols: Cols): Promise<string> {
  const names = Object.keys(cols);
  const { rows } = await q.query<{ id: string }>(
    `INSERT INTO ${table} (${names.join(", ")}) VALUES (${names.map((_, i) => `$${i + 1}`).join(", ")}) RETURNING id`,
    names.map((n) => cols[n]));
  return rows[0].id;
}

async function updateRow(q: Queryable, table: string, id: string, cols: Cols): Promise<void> {
  const names = Object.keys(cols);
  if (names.length === 0) return;
  const { rowCount } = await q.query(
    `UPDATE ${table} SET ${names.map((n, i) => `${n} = $${i + 2}`).join(", ")} WHERE id = $1`,
    [id, ...names.map((n) => cols[n])]);
  if (!rowCount) throw new EntryError("NOT_PERMITTED", "This record no longer exists, or your role is not permitted to change it.");
}

/** Insert, or update the row with the same natural key. Returns whether a new row was created. */
async function upsertRow(q: Queryable, table: string, key: Cols, cols: Cols): Promise<{ id: string; inserted: boolean }> {
  const keyNames = Object.keys(key), colNames = Object.keys(cols);
  const all = [...keyNames, ...colNames];
  const set = (colNames.length ? colNames : keyNames).map((n) => `${n} = EXCLUDED.${n}`).join(", ");
  const { rows } = await q.query<{ id: string; inserted: boolean }>(
    `INSERT INTO ${table} (${all.join(", ")}) VALUES (${all.map((_, i) => `$${i + 1}`).join(", ")})
     ON CONFLICT (${keyNames.join(", ")}) DO UPDATE SET ${set}
     RETURNING id, (xmax = 0) AS inserted`,
    all.map((n) => (n in key ? key[n] : cols[n])));
  return rows[0];
}

function resolveProject(ref: RefData, code: ParsedValue | undefined): { id: string; currency: string } {
  const hit = typeof code === "string" ? ref.projects.get(lc(code)) : undefined;
  if (!hit) throw new EntryError("UNKNOWN_PROJECT", `Project code “${String(code)}” was not found, or it is not one of your projects.`, "Project code");
  return hit;
}

function resolveUser(ref: RefData, email: ParsedValue | undefined, role: "pi" | "project_lead", field: string): string | null | undefined {
  if (email === undefined) return undefined;
  if (email === null) return null;
  const hit = ref.users.get(lc(String(email)));
  if (!hit) throw new EntryError("UNKNOWN_USER", `${field} “${String(email)}” is not an active PMIS user. Add the person under Users & Roles first.`, field);
  if (hit.role !== role) throw new EntryError("WRONG_ROLE", `${field} “${String(email)}” does not have the ${role === "pi" ? "Principal Investigator" : "Project Lead"} role.`, field);
  return hit.id;
}

export interface WriteOptions {
  mode: WriteMode;
  prov: Provenance;
  ref: RefData;
  /** Form mode: the row being edited (omit to create). */
  id?: string | null;
  /** Form mode: the project the row belongs to (import resolves it from the project code). */
  projectId?: string | null;
}

export type WriteResult = { id: string; action: "inserted" | "updated" };

/**
 * Write one validated record. `values` is keyed by the field keys of the
 * entity's sheet definition in @naamii/core; `undefined` means "not supplied".
 */
export async function writeRecord(q: Queryable, entity: EntryEntity, values: Record<string, ParsedValue | undefined>, opts: WriteOptions): Promise<WriteResult> {
  try {
    return await write(q, entity, values, opts);
  } catch (err) {
    throw friendly(err, entity);
  }
}

async function write(q: Queryable, entity: EntryEntity, v: Record<string, ParsedValue | undefined>, opts: WriteOptions): Promise<WriteResult> {
  const { mode, ref } = opts;
  const table = TABLE[entity];
  const prov = provCols(opts.prov);

  if (entity === "projects") {
    let labId: string | undefined;
    if (typeof v.lab_code === "string") {
      labId = ref.labs.get(lc(v.lab_code));
      if (!labId) throw new EntryError("UNKNOWN_LAB", `Lab code “${v.lab_code}” was not found.`, "Lab code");
    }
    const leadId = resolveUser(ref, v.lead_email, "project_lead", "Project lead email");
    const cols = writable("projects", {
      name: v.name, funder: v.funder, project_type: v.project_type, status: v.status, currency: v.currency,
      total_budget: v.total_budget, start_date: v.start_date, end_date: v.end_date, description: v.description,
    }, mode);
    if (labId) cols.lab_id = labId;
    const piId = resolveUser(ref, v.pi_email, "pi", "PI email");
    if (piId !== undefined && !(piId === null && mode === "import")) cols.pi_id = piId;
    const leadSupplied = leadId !== undefined && !(leadId === null && mode === "import");
    if (leadSupplied) cols.project_lead_id = leadId;

    let result: WriteResult;
    if (mode === "form" && opts.id) {
      await updateRow(q, table, opts.id, { code: v.code, ...cols, ...prov });
      result = { id: opts.id, action: "updated" };
    } else if (mode === "form") {
      if (!labId) throw new EntryError("MISSING_REQUIRED", "Lab code is required.", "Lab code");
      result = { id: await insertRow(q, table, { code: v.code, ...cols, ...prov }), action: "inserted" };
    } else {
      if (!labId && !ref.projects.has(lc(String(v.code)))) throw new EntryError("MISSING_REQUIRED", "Lab code is required for a new project.", "Lab code");
      const r = await upsertRow(q, table, { code: v.code }, { ...cols, ...prov });
      result = { id: r.id, action: r.inserted ? "inserted" : "updated" };
    }
    if (leadSupplied) {
      // The named lead is the one person assigned as lead; a replaced lead loses access.
      await q.query("DELETE FROM project_assignments WHERE project_id = $1 AND role_in_project = 'lead' AND ($2::uuid IS NULL OR user_id <> $2::uuid)", [result.id, leadId]);
      if (leadId) await q.query("INSERT INTO project_assignments (user_id, project_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [leadId, result.id]);
    }
    const cur = typeof v.currency === "string" ? v.currency : ref.projects.get(lc(String(v.code)))?.currency ?? "NPR";
    ref.projects.set(lc(String(v.code)), { id: result.id, currency: cur });
    return result;
  }

  const project = opts.projectId
    ? { id: opts.projectId, currency: [...ref.projects.values()].find((p) => p.id === opts.projectId)?.currency ?? "NPR" }
    : resolveProject(ref, v.project_code);

  let key: Cols, cols: Cols;
  switch (entity) {
    case "financials": {
      const period = String(v.month);
      let fy = ref.fiscalYears.get(period);
      if (!fy) {
        fy = (await q.query<{ fy: string }>("SELECT app.fiscal_year_label($1::date) AS fy", [period])).rows[0].fy;
        ref.fiscalYears.set(period, fy);
      }
      key = { project_id: project.id, financial_period: period };
      cols = { ...writable(entity, { budget: v.budget, actual_expenditure: v.actual, committed_amount: v.committed, forecast: v.forecast }, mode), fiscal_year: fy, currency: project.currency };
      break;
    }
    case "milestones":
      key = { project_id: project.id, name: v.name };
      cols = writable(entity, { description: v.description, due_date: v.due_date, completion_date: v.completion_date, status: v.status, is_deliverable: v.is_deliverable }, mode);
      break;
    case "risks":
      key = { project_id: project.id, issue: v.issue };
      cols = writable(entity, { risk_level: v.risk_level, owner: v.owner, due_date: v.due_date, status: v.status }, mode);
      break;
    case "team":
      key = { project_id: project.id, person_name: v.person_name };
      cols = writable(entity, { role_title: v.role_title, allocation_pct: v.allocation_pct, start_date: v.start_date, end_date: v.end_date }, mode);
      break;
  }

  let result: WriteResult;
  if (mode === "form" && opts.id) {
    const { project_id: _p, ...rest } = key;
    void _p;
    // Scope the update to the project named in the form so an id from another project cannot be edited.
    const owner = await q.query("SELECT 1 FROM " + table + " WHERE id = $1 AND project_id = $2", [opts.id, project.id]);
    if (!owner.rowCount) throw new EntryError("NOT_PERMITTED", "This record no longer exists, or it does not belong to this project.");
    await updateRow(q, table, opts.id, { ...rest, ...cols, ...prov });
    result = { id: opts.id, action: "updated" };
  } else if (mode === "form") {
    result = { id: await insertRow(q, table, { ...key, ...cols, ...prov }), action: "inserted" };
  } else {
    const r = await upsertRow(q, table, key, { ...cols, ...prov });
    result = { id: r.id, action: r.inserted ? "inserted" : "updated" };
  }

  if (entity === "team" && v.monthly_cost !== undefined) {
    if (typeof v.monthly_cost === "number") {
      await q.query(
        `INSERT INTO project_team_compensation (team_member_id, monthly_cost, currency) VALUES ($1, $2, $3)
         ON CONFLICT (team_member_id) DO UPDATE SET monthly_cost = EXCLUDED.monthly_cost, currency = EXCLUDED.currency`,
        [result.id, v.monthly_cost, project.currency]);
    } else if (mode === "form") {
      await q.query("DELETE FROM project_team_compensation WHERE team_member_id = $1", [result.id]);
    }
  }
  return result;
}

/** Delete one project-level record (never a project itself). */
export async function deleteRecord(q: Queryable, entity: Exclude<EntryEntity, "projects">, id: string, projectId: string): Promise<void> {
  try {
    const { rowCount } = await q.query(`DELETE FROM ${TABLE[entity]} WHERE id = $1 AND project_id = $2`, [id, projectId]);
    if (!rowCount) throw new EntryError("NOT_PERMITTED", "This record no longer exists, or your role is not permitted to delete it.");
  } catch (err) {
    throw friendly(err, entity);
  }
}

export type EntryRow = Record<string, ParsedValue> & { id: string };

const READ_SQL: Record<EntryEntity, string> = {
  projects: `SELECT p.id, p.id AS project_id, p.code, p.name, l.code AS lab_code, pi.email::text AS pi_email, ld.email::text AS lead_email,
                    p.funder, p.project_type, p.status::text, p.currency::text, p.total_budget, p.start_date, p.end_date, p.description
             FROM projects p JOIN labs l ON l.id = p.lab_id
             LEFT JOIN users pi ON pi.id = p.pi_id LEFT JOIN users ld ON ld.id = p.project_lead_id
             WHERE ($1::uuid IS NULL OR p.id = $1) ORDER BY p.code`,
  financials: `SELECT f.id, f.project_id, p.code AS project_code, to_char(f.financial_period, 'YYYY-MM') AS month,
                      f.budget, f.actual_expenditure AS actual, f.committed_amount AS committed, f.forecast
               FROM project_financials f JOIN projects p ON p.id = f.project_id
               WHERE ($1::uuid IS NULL OR p.id = $1) ORDER BY p.code, f.financial_period`,
  milestones: `SELECT m.id, m.project_id, p.code AS project_code, m.name, m.due_date, m.completion_date, m.status::text, m.is_deliverable, m.description
               FROM project_milestones m JOIN projects p ON p.id = m.project_id
               WHERE ($1::uuid IS NULL OR p.id = $1) ORDER BY p.code, m.due_date NULLS LAST, m.name`,
  risks: `SELECT r.id, r.project_id, p.code AS project_code, r.issue, r.risk_level::text, r.owner, r.due_date, r.status::text
          FROM project_risks r JOIN projects p ON p.id = r.project_id
          WHERE ($1::uuid IS NULL OR p.id = $1) ORDER BY p.code, r.status, r.issue`,
  team: `SELECT m.id, m.project_id, p.code AS project_code, m.person_name, m.role_title, m.allocation_pct, m.start_date, m.end_date, c.monthly_cost
         FROM project_team_members m JOIN projects p ON p.id = m.project_id
         LEFT JOIN project_team_compensation c ON c.team_member_id = m.id
         WHERE ($1::uuid IS NULL OR p.id = $1) ORDER BY p.code, m.person_name`,
};

/** Current records, keyed by the same field keys the template and forms use (RLS applies). */
export async function loadEntryRows(q: Queryable, entity: EntryEntity, projectId: string | null = null): Promise<EntryRow[]> {
  const { rows } = await q.query<EntryRow>(READ_SQL[entity], [projectId]);
  return rows;
}

export interface EntryOptions {
  labs: { code: string; name: string }[];
  pis: { email: string; name: string }[];
  leads: { email: string; name: string }[];
  projects: { id: string; code: string; name: string; labName: string }[];
}

/** Pick-list values for forms and the template's Lists sheet (RLS applies). */
export async function loadEntryOptions(q: Queryable): Promise<EntryOptions> {
  const labs = await q.query<{ code: string; name: string }>("SELECT code, name FROM labs WHERE active ORDER BY code");
  const people = await q.query<{ email: string; name: string; role: string }>("SELECT email::text, name, role::text FROM users WHERE active AND role IN ('pi', 'project_lead') ORDER BY name");
  const projects = await q.query<{ id: string; code: string; name: string; lab_name: string }>("SELECT p.id, p.code, p.name, l.name AS lab_name FROM projects p JOIN labs l ON l.id = p.lab_id ORDER BY p.code");
  return {
    labs: labs.rows,
    pis: people.rows.filter((p) => p.role === "pi"),
    leads: people.rows.filter((p) => p.role === "project_lead"),
    projects: projects.rows.map((p) => ({ id: p.id, code: p.code, name: p.name, labName: p.lab_name })),
  };
}
