/**
 * Lab-management integration tests — the real save/delete code against a real
 * PostgreSQL with the demo seed, connecting as the application role.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { loadEnv, adminUrl } from "../../db/scripts/lib.mjs";

loadEnv();
process.env.DATABASE_URL ??= "postgres://pmis_app@127.0.0.1:5433/naamii_pmis";
process.env.SESSION_SECRET ??= "test-only";

const { parseLabInput, saveLab, deleteLab, loadLabsAdmin } = await import("@/lib/admin/labs");
const { loadEntryOptions, loadRefData, writeRecord } = await import("@/lib/entry/write");
const { loadUserFormOptions } = await import("@/lib/admin/users");
const { withUser } = await import("@/lib/db");

const ADMIN = "20000000-0000-4000-8000-000000000007";
const ED = "20000000-0000-4000-8000-000000000001";
const PI_AIM = "20000000-0000-4000-8000-000000000002";
const LEAD_ALPHA = "20000000-0000-4000-8000-000000000005";
const LAB_AIM = "10000000-0000-4000-8000-000000000001";

let owner: pg.Client;
const cleanup = async () => {
  await owner.query("DELETE FROM projects WHERE code LIKE 'TEST-LAB-%'");
  await owner.query("UPDATE users SET lab_id = NULL WHERE lab_id IN (SELECT id FROM labs WHERE code LIKE 'TEST-LAB%')");
  await owner.query("DELETE FROM labs WHERE code LIKE 'TEST-LAB%'");
};
beforeAll(async () => { owner = new pg.Client({ connectionString: adminUrl() }); await owner.connect(); await cleanup(); });
afterAll(async () => { await cleanup(); await owner.end(); await (globalThis as { __pmisPool?: pg.Pool }).__pmisPool?.end(); });

const input = (over: Record<string, unknown> = {}) => {
  const r = parseLabInput({ name: "Test Robotics Lab", code: "test-lab-1", active: "on", ...over });
  if (!r.input) throw new Error(r.errors.join(" "));
  return r.input;
};
const labCodesOffered = async () => (await withUser(ADMIN, (q) => loadEntryOptions(q))).labs.map((l) => l.code);
const visibleProjects = (userId: string) => withUser(userId, async (q) => (await q.query<{ code: string }>("SELECT code FROM projects ORDER BY code")).rows.map((r) => r.code));

describe("form validation", () => {
  it("requires a name and a well-formed code, and normalises the code", () => {
    expect(parseLabInput({ name: "", code: "" }).errors).toHaveLength(2);
    expect(parseLabInput({ name: "X", code: "a" }).errors).toHaveLength(1);
    expect(parseLabInput({ name: "X", code: "bad code!" }).errors).toHaveLength(1);
    expect(input({ code: " cs lab " }).code).toBe("CS-LAB");
  });
});

describe("Finance & Operations manages labs", () => {
  it("adds a lab that is at once offered in every lab list, renames it, retires it and deletes it", async () => {
    const before = await labCodesOffered();
    const { id, created } = await withUser(ADMIN, (q) => saveLab(q, input()));
    expect(created).toBe(true);
    expect(await labCodesOffered()).toEqual([...before, "TEST-LAB-1"].sort());
    expect((await withUser(ADMIN, (q) => loadUserFormOptions(q))).labs.some((l) => l.id === id && l.active)).toBe(true);

    // The new lab can take a project straight away, and the lab's PI then sees it.
    await withUser(ADMIN, (q) => saveLab(q, input({ id, piUserId: PI_AIM })));
    await withUser(ADMIN, async (q) => writeRecord(q, "projects", { code: "TEST-LAB-P1", name: "Project in a new lab", lab_code: "test-lab-1", total_budget: 1000 },
      { mode: "form", ref: await loadRefData(q), prov: { sourceFile: "test" } }));
    expect(await visibleProjects(PI_AIM)).toContain("TEST-LAB-P1");

    // Rename + new code: everything follows, because projects refer to the lab itself, not its name.
    await withUser(ADMIN, (q) => saveLab(q, input({ id, name: "Test Robotics & Automation Lab", code: "TEST-LAB-2", piUserId: PI_AIM })));
    expect((await owner.query("SELECT l.name FROM projects p JOIN labs l ON l.id = p.lab_id WHERE p.code = 'TEST-LAB-P1'")).rows[0].name).toBe("Test Robotics & Automation Lab");
    expect(await labCodesOffered()).toContain("TEST-LAB-2");
    expect(await labCodesOffered()).not.toContain("TEST-LAB-1");

    // A lab with projects cannot be deleted …
    await expect(withUser(ADMIN, (q) => deleteLab(q, id))).rejects.toMatchObject({ code: "HAS_PROJECTS" });
    // … but it can be retired: no longer offered, project kept.
    await withUser(ADMIN, (q) => saveLab(q, input({ id, name: "Test Robotics & Automation Lab", code: "TEST-LAB-2", active: undefined })));
    expect(await labCodesOffered()).toEqual(before);
    expect((await owner.query("SELECT count(*)::int AS n FROM projects WHERE code = 'TEST-LAB-P1'")).rows[0].n).toBe(1);
    expect((await withUser(ADMIN, (q) => loadLabsAdmin(q, id)))[0]).toMatchObject({ active: false, projects: 1, piUserId: null });
    expect(await visibleProjects(PI_AIM)).not.toContain("TEST-LAB-P1"); // the PI was unset with the save above

    // Once empty it can be deleted, and the deletion is audited.
    await owner.query("DELETE FROM projects WHERE code = 'TEST-LAB-P1'");
    expect(await withUser(ADMIN, (q) => deleteLab(q, id))).toEqual({ name: "Test Robotics & Automation Lab" });
    expect((await owner.query("SELECT count(*)::int AS n FROM labs WHERE id = $1", [id])).rows[0].n).toBe(0);
    expect((await owner.query("SELECT count(*)::int AS n FROM audit_log WHERE entity = 'labs' AND entity_id = $1 AND action = 'DELETE' AND actor_user_id = $2", [id, ADMIN])).rows[0].n).toBe(1);
  });

  it("refuses a duplicate code, a non-PI as lab PI, and deleting a seeded lab that has projects", async () => {
    await expect(withUser(ADMIN, (q) => saveLab(q, input({ code: "DEMO-AIM" })))).rejects.toMatchObject({ code: "DUPLICATE" });
    await expect(withUser(ADMIN, (q) => saveLab(q, input({ piUserId: LEAD_ALPHA })))).rejects.toMatchObject({ code: "WRONG_ROLE" });
    await expect(withUser(ADMIN, (q) => deleteLab(q, LAB_AIM))).rejects.toMatchObject({ code: "HAS_PROJECTS" });
    expect((await owner.query("SELECT count(*)::int AS n FROM labs WHERE code LIKE 'TEST-LAB%'")).rows[0].n).toBe(0);
  });

  it("deleting a lab keeps its people and only clears their link to it", async () => {
    const { id } = await withUser(ADMIN, (q) => saveLab(q, input({ code: "TEST-LAB-3" })));
    await owner.query("UPDATE users SET lab_id = $1 WHERE id = $2", [id, LEAD_ALPHA]);
    await withUser(ADMIN, (q) => deleteLab(q, id));
    const lead = (await owner.query("SELECT lab_id, active FROM users WHERE id = $1", [LEAD_ALPHA])).rows[0];
    expect(lead).toEqual({ lab_id: null, active: true });
    await owner.query("UPDATE users SET lab_id = $1 WHERE id = $2", [LAB_AIM, LEAD_ALPHA]);
  });
});

describe("nobody else can manage labs", () => {
  it.each([["Executive Director", ED], ["Principal Investigator", PI_AIM], ["Project Lead", LEAD_ALPHA]])("%s cannot add, rename or delete a lab", async (_label, userId) => {
    await expect(withUser(userId, (q) => saveLab(q, input({ code: "TEST-LAB-9" })))).rejects.toMatchObject({ code: "NOT_PERMITTED" });
    await expect(withUser(userId, (q) => saveLab(q, input({ id: LAB_AIM, name: "Hijacked", code: "DEMO-AIM" })))).rejects.toMatchObject({ code: "NOT_PERMITTED" });
    const { id } = await withUser(ADMIN, (q) => saveLab(q, input({ code: "TEST-LAB-8" })));
    await expect(withUser(userId, (q) => deleteLab(q, id))).rejects.toMatchObject({ code: expect.stringMatching(/NOT_PERMITTED|NOT_FOUND/) });
    expect((await owner.query("SELECT name FROM labs WHERE id = $1", [LAB_AIM])).rows[0].name).not.toBe("Hijacked");
    expect((await owner.query("SELECT count(*)::int AS n FROM labs WHERE id = $1", [id])).rows[0].n).toBe(1);
    await withUser(ADMIN, (q) => deleteLab(q, id));
  });
});
