/**
 * Data-entry integration tests — the real template, importer and form writer
 * against a real PostgreSQL with the demo seed, connecting as the application
 * role exactly as the web app does (so Row Level Security is what is tested).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import pg from "pg";
import type { CurrentUser, EntryEntity, ParsedValue } from "@naamii/core";
import { loadEnv, adminUrl } from "../../db/scripts/lib.mjs";

loadEnv();
process.env.DATABASE_URL ??= "postgres://pmis_app@127.0.0.1:5433/naamii_pmis";
process.env.SESSION_SECRET ??= "test-only";

const { runImport } = await import("@/lib/entry/import");
const { buildTemplate } = await import("@/lib/entry/template");
const { EntryError, deleteRecord, loadRefData, writeRecord } = await import("@/lib/entry/write");
const { withUser } = await import("@/lib/db");

const admin: CurrentUser = { id: "20000000-0000-4000-8000-000000000007", email: "admin.demo@naamii-demo.test", name: "Demo Finance & Operations", role: "admin", labId: null };
const leadAlpha: CurrentUser = { id: "20000000-0000-4000-8000-000000000005", email: "lead.alpha.demo@naamii-demo.test", name: "Demo Lead — Project Alpha", role: "project_lead", labId: null };
const pi: CurrentUser = { id: "20000000-0000-4000-8000-000000000002", email: "pi.aim.demo@naamii-demo.test", name: "Dr. Demo Pradhan (PI)", role: "pi", labId: null };
const ALPHA = "30000000-0000-4000-8000-000000000001";
const GAMMA = "30000000-0000-4000-8000-000000000003";
const TEST_CODE = "TEST-ENTRY-001";

let owner: pg.Client;
let alphaCode = "", gammaCode = "";
const scalar = async (sql: string, params: unknown[] = []) => (await owner.query(sql, params)).rows[0]?.n;

async function cleanup() {
  await owner.query("DELETE FROM projects WHERE code LIKE 'TEST-ENTRY-%'");
  await owner.query("DELETE FROM project_milestones WHERE name LIKE 'TEST-ENTRY %'");
  await owner.query("DELETE FROM project_risks WHERE issue LIKE 'TEST-ENTRY %'");
  await owner.query("DELETE FROM project_team_members WHERE person_name LIKE 'TEST-ENTRY %'");
  await owner.query("DELETE FROM project_financials WHERE financial_period >= '2031-01-01'");
  await owner.query("DELETE FROM import_runs WHERE triggered_by = 'manual_upload' AND notes LIKE 'Excel upload by Demo %'");
}
beforeAll(async () => {
  owner = new pg.Client({ connectionString: adminUrl() });
  await owner.connect();
  await cleanup();
  alphaCode = (await owner.query("SELECT code FROM projects WHERE id = $1", [ALPHA])).rows[0].code;
  gammaCode = (await owner.query("SELECT code FROM projects WHERE id = $1", [GAMMA])).rows[0].code;
});
afterAll(async () => {
  await cleanup();
  await owner.end();
  await (globalThis as { __pmisPool?: pg.Pool }).__pmisPool?.end();
});

const asArrayBuffer = (b: Buffer) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;

/** Build a workbook from { sheet: [header row, ...data rows] }. */
async function workbook(sheets: Record<string, unknown[][]>): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  for (const [name, rows] of Object.entries(sheets)) wb.addWorksheet(name).addRows(rows);
  return asArrayBuffer(Buffer.from(await wb.xlsx.writeBuffer()));
}
async function open(file: Buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(asArrayBuffer(file));
  return wb;
}

describe("Excel template", () => {
  it("gives Finance & Operations every sheet and the Project Lead only theirs", async () => {
    const forAdmin = await withUser(admin.id, (q) => buildTemplate(q, admin, false));
    const forLead = await withUser(leadAlpha.id, (q) => buildTemplate(q, leadAlpha, false));
    expect((await open(forAdmin)).worksheets.map((w) => w.name)).toEqual(["Instructions", "Lists", "Projects", "Financials", "Milestones", "Risks", "Team"]);
    const lead = await open(forLead);
    expect(lead.worksheets.map((w) => w.name)).toEqual(["Instructions", "Lists", "Financials", "Milestones", "Risks", "Team"]);
    expect((lead.getWorksheet("Financials")!.getRow(1).values as unknown[]).filter(Boolean).map(String)).toEqual(["Project code *", "Month *", "Forecast"]);
  });

  it("round-trips: the template filled with current data imports cleanly, as updates only", async () => {
    const file = await withUser(admin.id, (q) => buildTemplate(q, admin, true));
    const out = await runImport(admin, "roundtrip.xlsx", asArrayBuffer(file), true);
    expect(out.issues).toEqual([]);
    expect(out.ok).toBe(true);
    expect(out.sheets.map((s) => s.sheet)).toEqual(["Projects", "Financials", "Milestones", "Risks", "Team"]);
    for (const s of out.sheets) {
      expect(s.rows).toBeGreaterThan(0);
      expect(s.inserted).toBe(0);
      expect(s.updated).toBe(s.rows);
    }
  });

  it("never puts staff costs, or other projects, in a Project Lead's export", async () => {
    const file = await withUser(leadAlpha.id, (q) => buildTemplate(q, leadAlpha, true));
    const team = (await open(file)).getWorksheet("Team")!;
    const headers = (team.getRow(1).values as unknown[]).filter(Boolean).map(String);
    expect(headers.join("|")).not.toMatch(/cost/i);
    expect(team.rowCount).toBeGreaterThan(1);
    const codes = new Set<string>();
    team.eachRow((r, n) => { if (n > 1) codes.add(String(r.getCell(1).value)); });
    expect([...codes]).toEqual([alphaCode]);
  });
});

describe("Excel import — Finance & Operations", () => {
  const good = () => workbook({
    Projects: [
      ["Project code *", "Project name *", "Lab code *", "PI email", "Project lead email", "Total budget *", "Start date", "End date", "Status"],
      [TEST_CODE, "TEST-ENTRY imported project", "DEMO-AIM", "pi.aim.demo@naamii-demo.test", "lead.alpha.demo@naamii-demo.test", "1,200,000", new Date(Date.UTC(2026, 0, 1)), "2026-12-31", "Planned"],
    ],
    Financials: [
      ["Project code", "Month", "Budget", "Actual expenditure", "Committed", "Forecast"],
      [TEST_CODE, "2026-01", 100000, 80000, 5000, 100000],
      [TEST_CODE, "Feb 2026", 100000, null, null, 110000],
    ],
    Milestones: [["Project code", "Milestone", "Due date", "Status", "Deliverable"], [TEST_CODE, "TEST-ENTRY kickoff", "2026-02-15", "In progress", "Yes"]],
    Risks: [["Project code", "Issue", "Risk level"], [TEST_CODE, "TEST-ENTRY supplier delay", "High"]],
    Team: [["Project code", "Person name", "Role", "Allocation %", "Monthly cost"], [TEST_CODE, "Test Person", "Engineer", 50, 90000]],
  });

  it("rejects the whole file and saves nothing when any row is invalid", async () => {
    const before = await scalar("SELECT count(*)::int AS n FROM project_milestones");
    const file = await workbook({
      Milestones: [
        ["Project code", "Milestone", "Due date", "Status"],
        [alphaCode, "TEST-ENTRY valid row", "2026-03-01", "Not started"],
        [alphaCode, "TEST-ENTRY bad date", "31/12/2026", "Not started"],
        [alphaCode, null, "2026-03-01", "Done"],
        ["NO-SUCH-PROJECT", "TEST-ENTRY orphan", null, null],
        [alphaCode, "TEST-ENTRY valid row", null, null],
      ],
    });
    const out = await runImport(admin, "bad.xlsx", file, false);
    expect(out.ok).toBe(false);
    expect(out.issues.map((i) => `${i.row}:${i.code}`).sort()).toEqual(["3:INVALID_DATE", "4:INVALID_VALUE", "4:MISSING_REQUIRED", "5:UNKNOWN_PROJECT", "6:DUPLICATE_ROW"]);
    expect(await scalar("SELECT count(*)::int AS n FROM project_milestones")).toBe(before);
    // the rejected upload and its problems are on record for Data Quality
    expect(await scalar("SELECT count(*)::int AS n FROM import_errors WHERE source_file = 'bad.xlsx'")).toBe(5);
  });

  it("a check saves nothing; an import saves every sheet; a re-import updates instead of duplicating", async () => {
    const check = await runImport(admin, "good.xlsx", await good(), true);
    expect(check.issues).toEqual([]);
    expect(await scalar("SELECT count(*)::int AS n FROM projects WHERE code = $1", [TEST_CODE])).toBe(0);

    const first = await runImport(admin, "good.xlsx", await good(), false);
    expect(first.issues).toEqual([]);
    expect(first.sheets.map((s) => [s.sheet, s.inserted, s.updated])).toEqual([["Projects", 1, 0], ["Financials", 2, 0], ["Milestones", 1, 0], ["Risks", 1, 0], ["Team", 1, 0]]);

    const p = (await owner.query("SELECT id, status::text, total_budget::float8 AS total_budget, start_date::text, project_lead_id, source_file FROM projects WHERE code = $1", [TEST_CODE])).rows[0];
    expect(p).toMatchObject({ status: "planned", total_budget: 1200000, start_date: "2026-01-01", project_lead_id: leadAlpha.id, source_file: "good.xlsx" });
    expect(await scalar("SELECT count(*)::int AS n FROM project_assignments WHERE project_id = $1 AND user_id = $2", [p.id, leadAlpha.id])).toBe(1);
    const feb = (await owner.query("SELECT actual_expenditure::float8 AS a, forecast::float8 AS f FROM project_financials WHERE project_id = $1 AND financial_period = '2026-02-01'", [p.id])).rows[0];
    expect(feb).toEqual({ a: 0, f: 110000 });
    expect(await scalar("SELECT c.monthly_cost::float8 AS n FROM project_team_compensation c JOIN project_team_members m ON m.id = c.team_member_id WHERE m.project_id = $1", [p.id])).toBe(90000);

    // Re-import with one changed and one blank cell: updates in place; the blank leaves the stored value.
    const again = await runImport(admin, "good-v2.xlsx", await workbook({
      Financials: [["Project code", "Month", "Budget", "Actual expenditure"], [TEST_CODE, "2026-01", null, 95000]],
    }), false);
    expect(again.sheets).toEqual([{ sheet: "Financials", rows: 1, inserted: 0, updated: 1, errors: 0 }]);
    const jan = (await owner.query("SELECT budget::float8 AS b, actual_expenditure::float8 AS a FROM project_financials WHERE project_id = $1 AND financial_period = '2026-01-01'", [p.id])).rows[0];
    expect(jan).toEqual({ b: 100000, a: 95000 });
    expect(await scalar("SELECT count(*)::int AS n FROM audit_log WHERE entity = 'project_financials' AND actor_user_id = $1 AND action = 'UPDATE'", [admin.id])).toBeGreaterThan(0);
  });
});

describe("Excel import — Project Lead", () => {
  it("imports milestones and risks for their own project", async () => {
    const out = await runImport(leadAlpha, "lead.xlsx", await workbook({
      Milestones: [["Project code", "Milestone", "Due date"], [alphaCode, "TEST-ENTRY lead milestone", "2026-09-30"]],
      Risks: [["Project code", "Issue", "Risk level", "Status"], [alphaCode, "TEST-ENTRY lead risk", "Low", "Mitigating"]],
    }), false);
    expect(out.issues).toEqual([]);
    expect(await scalar("SELECT count(*)::int AS n FROM project_milestones WHERE name = 'TEST-ENTRY lead milestone' AND project_id = $1", [ALPHA])).toBe(1);
  });

  it("imports the forecast for their own project and nothing else financial", async () => {
    const before = (await owner.query("SELECT budget::float8 AS b, actual_expenditure::float8 AS a, committed_amount::float8 AS c FROM project_financials WHERE project_id = $1 AND financial_period = '2026-01-01'", [ALPHA])).rows[0];
    const out = await runImport(leadAlpha, "lead-forecast.xlsx", await workbook({
      Financials: [["Project code", "Month", "Budget", "Actual expenditure", "Forecast"], [alphaCode, "2026-01", 1, 2, 7654321], [alphaCode, "2031-03", 5, 6, 4321]],
    }), false);
    expect(out.issues).toEqual([]);
    expect(out.sheets).toEqual([{ sheet: "Financials", rows: 2, inserted: 1, updated: 1, errors: 0 }]);
    expect(out.warnings.join(" ")).toMatch(/Budget, Actual expenditure/);
    const after = (await owner.query("SELECT budget::float8 AS b, actual_expenditure::float8 AS a, committed_amount::float8 AS c, forecast::float8 AS f FROM project_financials WHERE project_id = $1 AND financial_period = '2026-01-01'", [ALPHA])).rows[0];
    expect(after).toEqual({ ...before, f: 7654321 });
    const added = (await owner.query("SELECT budget::float8 AS b, actual_expenditure::float8 AS a, forecast::float8 AS f FROM project_financials WHERE project_id = $1 AND financial_period = '2031-03-01'", [ALPHA])).rows[0];
    expect(added).toEqual({ b: 0, a: 0, f: 4321 });
  });

  it("cannot import into another project, nor the Projects sheet", async () => {
    const out = await runImport(leadAlpha, "lead-bad.xlsx", await workbook({
      Milestones: [["Project code", "Milestone"], [gammaCode, "TEST-ENTRY not mine"]],
      Financials: [["Project code", "Month", "Forecast"], [gammaCode, "2026-01", 1]],
      Projects: [["Project code", "Project name", "Lab code", "Total budget"], ["TEST-ENTRY-999", "x", "DEMO-AIM", 1]],
    }), false);
    expect(out.ok).toBe(false);
    expect(out.issues.map((i) => `${i.sheet}:${i.code}`).sort()).toEqual(["Financials:UNKNOWN_PROJECT", "Milestones:UNKNOWN_PROJECT", "Projects:NOT_PERMITTED"]);
    expect(await scalar("SELECT count(*)::int AS n FROM project_milestones WHERE name = 'TEST-ENTRY not mine'")).toBe(0);
  });

  it("has a Monthly cost column ignored, with a warning", async () => {
    const out = await runImport(leadAlpha, "lead-cost.xlsx", await workbook({
      Team: [["Project code", "Person name", "Monthly cost"], [alphaCode, "TEST-ENTRY Person", 5]],
    }), true);
    expect(out.ok).toBe(true);
    expect(out.warnings.join(" ")).toMatch(/Monthly cost/);
  });
});

describe("form entry (the database decides, not the screen)", () => {
  const save = (user: CurrentUser, entity: EntryEntity, values: Record<string, ParsedValue>, projectId: string, id?: string) =>
    withUser(user.id, async (q) => writeRecord(q, entity, values, { mode: "form", id, projectId, ref: await loadRefData(q), prov: { sourceFile: "test form" } }));

  it("lets a Project Lead add, edit and delete a milestone on their project", async () => {
    const added = await save(leadAlpha, "milestones", { name: "TEST-ENTRY form milestone", due_date: "2026-10-01", completion_date: null, status: "not_started", is_deliverable: false, description: null }, ALPHA);
    expect(added.action).toBe("inserted");
    await save(leadAlpha, "milestones", { name: "TEST-ENTRY form milestone (renamed)", due_date: null, completion_date: "2026-10-02", status: "completed", is_deliverable: true, description: null }, ALPHA, added.id);
    const m = (await owner.query("SELECT name, due_date, status::text, is_deliverable FROM project_milestones WHERE id = $1", [added.id])).rows[0];
    expect(m).toEqual({ name: "TEST-ENTRY form milestone (renamed)", due_date: null, status: "completed", is_deliverable: true });
    await expect(save(leadAlpha, "milestones", { name: "TEST-ENTRY form milestone (renamed)", status: "not_started" }, ALPHA)).rejects.toMatchObject({ code: "DUPLICATE" });
    await withUser(leadAlpha.id, (q) => deleteRecord(q, "milestones", added.id, ALPHA));
    expect(await scalar("SELECT count(*)::int AS n FROM project_milestones WHERE id = $1", [added.id])).toBe(0);
  });

  it("lets a Project Lead set the forecast, but not budget, actual or committed, and not delete or move a month", async () => {
    const row = (await owner.query("SELECT id, budget::float8 AS b, actual_expenditure::float8 AS a FROM project_financials WHERE project_id = $1 AND financial_period = '2026-02-01'", [ALPHA])).rows[0];
    await save(leadAlpha, "financials", { month: "2026-02-01", forecast: 123456 }, ALPHA, row.id);
    const read = async () => (await owner.query("SELECT budget::float8 AS b, actual_expenditure::float8 AS a, forecast::float8 AS f FROM project_financials WHERE id = $1", [row.id])).rows[0];
    expect(await read()).toEqual({ b: row.b, a: row.a, f: 123456 });
    await expect(save(leadAlpha, "financials", { month: "2026-02-01", budget: row.b + 1 }, ALPHA, row.id)).rejects.toMatchObject({ code: "NOT_PERMITTED" });
    await expect(save(leadAlpha, "financials", { month: "2026-02-01", committed: 9 }, ALPHA, row.id)).rejects.toMatchObject({ code: "NOT_PERMITTED" });
    await expect(save(leadAlpha, "financials", { month: "2031-02-01", forecast: 1 }, ALPHA, row.id)).rejects.toMatchObject({ code: "NOT_PERMITTED" });
    await expect(withUser(leadAlpha.id, (q) => deleteRecord(q, "financials", row.id, ALPHA))).rejects.toMatchObject({ code: "NOT_PERMITTED" });
    await expect(save(pi, "financials", { month: "2026-02-01", forecast: 5 }, ALPHA, row.id)).rejects.toMatchObject({ code: "NOT_PERMITTED" });
    expect(await read()).toEqual({ b: row.b, a: row.a, f: 123456 });
  });

  it("refuses a Project Lead on another project, on actuals and on staff costs", async () => {
    await expect(save(leadAlpha, "milestones", { name: "TEST-ENTRY intruder", status: "not_started" }, GAMMA)).rejects.toBeInstanceOf(EntryError);
    await expect(save(leadAlpha, "financials", { month: "2031-01-01", actual: 1 }, ALPHA)).rejects.toMatchObject({ code: "NOT_PERMITTED" });
    await expect(save(leadAlpha, "team", { person_name: "TEST-ENTRY Paid Person", monthly_cost: 10 }, ALPHA)).rejects.toMatchObject({ code: "NOT_PERMITTED" });
    expect(await scalar("SELECT count(*)::int AS n FROM project_team_members WHERE person_name = 'TEST-ENTRY Paid Person'")).toBe(0);
    expect(await scalar("SELECT count(*)::int AS n FROM project_milestones WHERE name = 'TEST-ENTRY intruder'")).toBe(0);
  });

  it("keeps PIs read-only even for their own lab's project", async () => {
    await expect(save(pi, "milestones", { name: "TEST-ENTRY pi", status: "not_started" }, ALPHA)).rejects.toMatchObject({ code: "NOT_PERMITTED" });
    await expect(save(pi, "risks", { issue: "TEST-ENTRY pi risk" }, ALPHA)).rejects.toMatchObject({ code: "NOT_PERMITTED" });
  });

  it("lets Finance & Operations enter monthly financials", async () => {
    const r = await save(admin, "financials", { month: "2031-01-01", budget: 10, actual: 4, committed: null, forecast: null }, ALPHA);
    expect(r.action).toBe("inserted");
    await withUser(admin.id, (q) => deleteRecord(q, "financials", r.id, ALPHA));
  });
});
