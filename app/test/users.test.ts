/**
 * User-management integration tests — the real save code against a real
 * PostgreSQL with the demo seed, connecting as the application role, so the
 * database's own rules (Row Level Security + admin guards) are what is tested.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { loadEnv, adminUrl } from "../../db/scripts/lib.mjs";

loadEnv();
process.env.DATABASE_URL ??= "postgres://pmis_app@127.0.0.1:5433/naamii_pmis";
process.env.SESSION_SECRET ??= "test-only";

const { parseUserInput, saveUser, loadUser, loadUserChanges } = await import("@/lib/admin/users");
const { withUser } = await import("@/lib/db");

const ADMIN = "20000000-0000-4000-8000-000000000007";
const ED = "20000000-0000-4000-8000-000000000001";
const LEAD_ALPHA = "20000000-0000-4000-8000-000000000005";
const LAB_CSL = "10000000-0000-4000-8000-000000000002";
const ALPHA = "30000000-0000-4000-8000-000000000001"; // AI & Mathematics Lab
const GAMMA = "30000000-0000-4000-8000-000000000003"; // Computational Science Lab

let owner: pg.Client;
const cleanup = async () => {
  await owner.query("UPDATE labs SET pi_user_id = NULL WHERE pi_user_id IN (SELECT id FROM users WHERE email LIKE 'test-um-%')");
  await owner.query("DELETE FROM users WHERE email LIKE 'test-um-%'");
};
beforeAll(async () => { owner = new pg.Client({ connectionString: adminUrl() }); await owner.connect(); await cleanup(); });
afterAll(async () => { await cleanup(); await owner.end(); await (globalThis as { __pmisPool?: pg.Pool }).__pmisPool?.end(); });

const input = (over: Record<string, unknown>) => {
  const r = parseUserInput({ name: "Test Person", email: "test-um-1@naamii-demo.test", role: "project_lead", active: "on", projectIds: [], ...over });
  if (!r.input) throw new Error(r.errors.join(" "));
  return r.input;
};
const visibleProjects = (userId: string) => withUser(userId, async (q) => (await q.query<{ id: string }>("SELECT id FROM projects ORDER BY code")).rows.map((r) => r.id));
const demoSignIn = async (id: string) => (await owner.query("SELECT 1 FROM app.demo_accounts() WHERE id = $1", [id])).rowCount === 1;

describe("form validation", () => {
  it("requires a name, a valid e-mail and a role, and a lab for a PI", () => {
    expect(parseUserInput({ name: "", email: "not-an-email", role: "boss" }).errors).toHaveLength(3);
    expect(parseUserInput({ name: "A", email: "a@naamii.org.np", role: "pi" }).errors).toEqual(["A Principal Investigator must be given a lab."]);
  });

  it("ties labs and projects only to the roles they apply to", () => {
    expect(input({ role: "ed", labId: LAB_CSL, projectIds: [ALPHA] })).toMatchObject({ labId: null, projectIds: [] });
    expect(input({ role: "pi", labId: LAB_CSL, projectIds: [ALPHA] })).toMatchObject({ labId: LAB_CSL, projectIds: [] });
  });
});

describe("Finance & Operations manages users", () => {
  it("adds a Project Lead who then sees exactly the assigned project, and can sign in", async () => {
    const { id, created } = await withUser(ADMIN, (q) => saveUser(q, input({ projectIds: [GAMMA] })));
    expect(created).toBe(true);
    expect(await visibleProjects(id)).toEqual([GAMMA]);
    expect(await demoSignIn(id)).toBe(true);

    // Re-assign: Alpha instead of Gamma.
    await withUser(ADMIN, (q) => saveUser(q, input({ id, projectIds: [ALPHA] })));
    expect(await visibleProjects(id)).toEqual([ALPHA]);

    // Change of role: becomes PI of the Computational Science Lab → sees that lab's projects instead.
    await withUser(ADMIN, (q) => saveUser(q, input({ id, role: "pi", labId: LAB_CSL })));
    const seen = await visibleProjects(id);
    expect(seen).toContain(GAMMA);
    expect(seen).not.toContain(ALPHA);
    expect((await withUser(ADMIN, (q) => loadUser(q, id)))).toMatchObject({ role: "pi", labId: LAB_CSL, projectIds: [] });

    // Deactivate: no data, no sign-in — but the account is kept.
    await withUser(ADMIN, (q) => saveUser(q, input({ id, role: "pi", labId: LAB_CSL, active: undefined })));
    expect(await visibleProjects(id)).toEqual([]);
    expect(await demoSignIn(id)).toBe(false);
    expect((await owner.query("SELECT active FROM users WHERE id = $1", [id])).rows[0].active).toBe(false);

    const changes = await withUser(ADMIN, (q) => loadUserChanges(q, 50));
    expect(changes.some((c) => c.summary.startsWith("Added Test Person") && c.actorName === "Demo Finance & Operations")).toBe(true);
    expect(changes.some((c) => c.summary.includes("deactivated"))).toBe(true);
  });

  it("refuses a second account with the same e-mail", async () => {
    await expect(withUser(ADMIN, (q) => saveUser(q, input({ email: "TEST-UM-1@naamii-demo.test" })))).rejects.toMatchObject({ code: "DUPLICATE" });
  });
});

describe("nobody else can manage users", () => {
  it.each([["Executive Director", ED], ["Project Lead", LEAD_ALPHA]])("%s cannot add a user or promote themself", async (_label, userId) => {
    await expect(withUser(userId, (q) => saveUser(q, input({ email: "test-um-2@naamii-demo.test", role: "admin" })))).rejects.toMatchObject({ code: "NOT_PERMITTED" });
    const self = (await owner.query("SELECT name, email::text, role::text FROM users WHERE id = $1", [userId])).rows[0];
    await expect(withUser(userId, (q) => saveUser(q, input({ id: userId, name: self.name, email: self.email, role: "admin" })))).rejects.toMatchObject({ code: "NOT_PERMITTED" });
    expect((await owner.query("SELECT role::text FROM users WHERE id = $1", [userId])).rows[0].role).toBe(self.role);
    expect((await owner.query("SELECT count(*)::int AS n FROM users WHERE email = 'test-um-2@naamii-demo.test'")).rows[0].n).toBe(0);
  });
});

describe("administrator safeguards", () => {
  const self = { id: ADMIN, name: "Demo Finance & Operations", email: "admin.demo@naamii-demo.test" };

  it("an administrator cannot demote or deactivate their own account", async () => {
    await expect(withUser(ADMIN, (q) => saveUser(q, input({ ...self, role: "ed" })))).rejects.toMatchObject({ code: "SELF" });
    await expect(withUser(ADMIN, (q) => saveUser(q, input({ ...self, role: "admin", active: undefined })))).rejects.toMatchObject({ code: "SELF" });
  });

  it("the last active administrator cannot be removed, but a second one can take over", async () => {
    const second = await withUser(ADMIN, (q) => saveUser(q, input({ email: "test-um-3@naamii-demo.test", name: "Second Admin", role: "admin" })));
    // The new administrator may now retire the first one …
    await withUser(second.id, (q) => saveUser(q, input({ ...self, role: "admin", active: undefined })));
    // … but then cannot be removed, being the only one left (even by the database owner).
    await expect(owner.query("UPDATE users SET active = false WHERE id = $1", [second.id])).rejects.toMatchObject({ constraint: "users_last_admin" });
    await owner.query("UPDATE users SET active = true WHERE id = $1", [ADMIN]);
  });
});
