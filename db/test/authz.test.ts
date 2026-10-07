/**
 * Critical authorization tests — run against a real PostgreSQL with the
 * migrations and demo seed applied (npm run db:start && npm run db:reset).
 * They connect as the application role (pmis_app) exactly as the web app does,
 * so they prove the Row Level Security policies, not the UI.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { loadEnv, appUrl } from "../scripts/lib.mjs";

loadEnv();

const U = {
  ed: "20000000-0000-4000-8000-000000000001",
  piAIM: "20000000-0000-4000-8000-000000000002",
  piCSL: "20000000-0000-4000-8000-000000000003",
  leadAlpha: "20000000-0000-4000-8000-000000000005",
  leadGamma: "20000000-0000-4000-8000-000000000006",
  admin: "20000000-0000-4000-8000-000000000007",
};
const P = {
  alpha: "30000000-0000-4000-8000-000000000001", // DEMO-AIM
  beta: "30000000-0000-4000-8000-000000000002",  // DEMO-AIM
  gamma: "30000000-0000-4000-8000-000000000003", // DEMO-CSL
};
const LAB = { aim: "10000000-0000-4000-8000-000000000001", csl: "10000000-0000-4000-8000-000000000002" };

let pool: pg.Pool;
beforeAll(() => { pool = new pg.Pool({ connectionString: appUrl(), max: 4 }); });
afterAll(async () => { await pool.end(); });

/** Run a query the way the app does: inside a transaction carrying app.user_id. */
async function as<T extends pg.QueryResultRow = pg.QueryResultRow>(userId: string | null, sql: string, params: unknown[] = []): Promise<T[]> {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    if (userId) await c.query("SELECT set_config('app.user_id', $1, true)", [userId]);
    const r = await c.query<T>(sql, params);
    await c.query("COMMIT");
    return r.rows;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
const codes = async (userId: string | null) => (await as<{ code: string }>(userId, "SELECT code FROM projects ORDER BY code")).map((r) => r.code);
const count = async (userId: string | null, sql: string, params: unknown[] = []) => Number((await as<{ n: string }>(userId, `SELECT count(*)::text AS n FROM (${sql}) s`, params))[0].n);

describe("default deny", () => {
  it("returns nothing when no user is set on the session", async () => {
    expect(await codes(null)).toEqual([]);
    expect(await count(null, "SELECT 1 FROM project_financials")).toBe(0);
    expect(await count(null, "SELECT 1 FROM users")).toBe(0);
  });
});

describe("Test 1 — Executive Director sees all NAAMII projects", () => {
  it("lists every project across every lab", async () => {
    const c = await codes(U.ed);
    expect(c).toHaveLength(6);
    expect(await count(U.ed, "SELECT 1 FROM labs")).toBe(3);
  });
  it("sees compensation (Admin + ED only)", async () => {
    expect(await count(U.ed, "SELECT 1 FROM project_team_members_v WHERE compensation_visible")).toBe(12);
  });
});

describe("Test 2 — PI of Lab A sees Lab A projects only", () => {
  it("AI & Mathematics PI sees only DEMO-AIM projects and only their lab", async () => {
    expect(await codes(U.piAIM)).toEqual(["DEMO-AIM-2024-001", "DEMO-AIM-2025-002"]);
    expect((await as<{ code: string }>(U.piAIM, "SELECT code FROM labs")).map((r) => r.code)).toEqual(["DEMO-AIM"]);
  });
  it("child facts follow the project: financials, milestones and risks of other labs are invisible", async () => {
    expect(await count(U.piAIM, "SELECT 1 FROM project_financials WHERE project_id = $1", [P.gamma])).toBe(0);
    expect(await count(U.piAIM, "SELECT 1 FROM project_milestones WHERE project_id = $1", [P.gamma])).toBe(0);
    expect(await count(U.piAIM, "SELECT 1 FROM project_risks WHERE project_id = $1", [P.gamma])).toBe(0);
    expect(await count(U.piAIM, "SELECT 1 FROM project_financials WHERE project_id = $1", [P.alpha])).toBeGreaterThan(0);
  });
  it("does not see compensation even on their own projects", async () => {
    const rows = await as<{ monthly_cost: number | null; compensation_visible: boolean }>(U.piAIM, "SELECT monthly_cost, compensation_visible FROM project_team_members_v");
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.monthly_cost === null && r.compensation_visible === false)).toBe(true);
    expect(await count(U.piAIM, "SELECT 1 FROM project_team_compensation")).toBe(0);
  });
});

describe("Test 3 — PI of Lab A requesting a Lab B project by id gets nothing", () => {
  it("direct lookup by primary key returns zero rows (the app renders 404)", async () => {
    expect(await count(U.piAIM, "SELECT 1 FROM projects WHERE id = $1", [P.gamma])).toBe(0);
    expect(await count(U.piAIM, "SELECT 1 FROM projects_v WHERE id = $1", [P.gamma])).toBe(0);
    expect(await count(U.piAIM, "SELECT 1 FROM labs WHERE id = $1", [LAB.csl])).toBe(0);
  });
});

describe("Test 4 — Project Lead sees only their project", () => {
  it("Lead of Project Alpha sees Alpha alone", async () => {
    expect(await codes(U.leadAlpha)).toEqual(["DEMO-AIM-2024-001"]);
    expect(await codes(U.leadGamma)).toEqual(["DEMO-CSL-2025-003"]);
  });
});

describe("Test 5 — Project Lead requesting another project by id gets nothing", () => {
  it("Lead of Alpha cannot read Beta (same lab) or Gamma (other lab)", async () => {
    expect(await count(U.leadAlpha, "SELECT 1 FROM projects WHERE id = $1", [P.beta])).toBe(0);
    expect(await count(U.leadAlpha, "SELECT 1 FROM projects WHERE id = $1", [P.gamma])).toBe(0);
    expect(await count(U.leadAlpha, "SELECT 1 FROM project_financials WHERE project_id = $1", [P.beta])).toBe(0);
  });
});

describe("Test 6 — Admin sees all data and the administration tables", () => {
  it("reads every project, mapping, import run and the audit log", async () => {
    expect(await codes(U.admin)).toHaveLength(6);
    expect(await count(U.admin, "SELECT 1 FROM column_mappings")).toBeGreaterThan(0);
    expect(await count(U.admin, "SELECT 1 FROM import_runs")).toBe(1);
    expect(await count(U.admin, "SELECT 1 FROM users")).toBe(11);
  });
  it("administration tables are hidden from every other role", async () => {
    for (const u of [U.ed, U.piAIM, U.leadAlpha]) {
      expect(await count(u, "SELECT 1 FROM column_mappings")).toBe(0);
      expect(await count(u, "SELECT 1 FROM import_runs")).toBe(0);
      expect(await count(u, "SELECT 1 FROM audit_log")).toBe(0);
    }
  });
  it("only Admin may change user roles or assignments", async () => {
    await expect(as(U.piAIM, "UPDATE users SET role = 'ed' WHERE id = $1 RETURNING id", [U.piAIM])).resolves.toEqual([]); // 0 rows updated
    await expect(as(U.ed, "INSERT INTO project_assignments(user_id, project_id) VALUES ($1, $2)", [U.ed, P.alpha])).rejects.toThrow(/row-level security/);
  });
});

describe("Test 7 — changing a user's role changes access with no code change", () => {
  it("promoting the CSL PI to Executive Director widens their view; reverting narrows it again", async () => {
    expect(await codes(U.piCSL)).toEqual(["DEMO-CSL-2025-003", "DEMO-CSL-2026-004"]);
    try {
      const updated = await as<{ id: string }>(U.admin, "UPDATE users SET role = 'ed' WHERE id = $1 RETURNING id", [U.piCSL]);
      expect(updated).toHaveLength(1);
      expect(await codes(U.piCSL)).toHaveLength(6);
      // the change is audited with the acting admin
      expect(await count(U.admin, "SELECT 1 FROM audit_log WHERE entity = 'users' AND entity_id = $1 AND actor_user_id = $2", [U.piCSL, U.admin])).toBeGreaterThan(0);
    } finally {
      await as(U.admin, "UPDATE users SET role = 'pi' WHERE id = $1", [U.piCSL]);
    }
    expect(await codes(U.piCSL)).toEqual(["DEMO-CSL-2025-003", "DEMO-CSL-2026-004"]);
  });
  it("assigning a second project to a Lead makes it visible immediately", async () => {
    try {
      await as(U.admin, "INSERT INTO project_assignments(user_id, project_id) VALUES ($1, $2)", [U.leadAlpha, P.beta]);
      expect(await codes(U.leadAlpha)).toEqual(["DEMO-AIM-2024-001", "DEMO-AIM-2025-002"]);
    } finally {
      await as(U.admin, "DELETE FROM project_assignments WHERE user_id = $1 AND project_id = $2", [U.leadAlpha, P.beta]);
    }
    expect(await codes(U.leadAlpha)).toEqual(["DEMO-AIM-2024-001"]);
  });
  it("deactivating a user removes all access", async () => {
    try {
      await as(U.admin, "UPDATE users SET active = false WHERE id = $1", [U.leadGamma]);
      expect(await codes(U.leadGamma)).toEqual([]);
      expect(await as(null, "SELECT id FROM app.resolve_user($1)", ["lead.gamma.demo@naamii-demo.test"])).toEqual([]);
    } finally {
      await as(U.admin, "UPDATE users SET active = true WHERE id = $1", [U.leadGamma]);
    }
    expect(await codes(U.leadGamma)).toEqual(["DEMO-CSL-2025-003"]);
  });
});

describe("Data freshness is available to every role without exposing import details", () => {
  it("returns the last successful sync for a Project Lead", async () => {
    const [row] = await as<{ last_successful_sync: Date | null }>(U.leadAlpha, "SELECT last_successful_sync FROM app.data_freshness()");
    expect(row.last_successful_sync).not.toBeNull();
  });
});
