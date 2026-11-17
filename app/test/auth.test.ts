/**
 * Password sign-in tests — the database functions the sign-in page relies on,
 * called as the application role, plus the session cookie signing.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { loadEnv, adminUrl, appUrl } from "../../db/scripts/lib.mjs";

loadEnv();
process.env.DATABASE_URL ??= "postgres://pmis_app@127.0.0.1:5433/naamii_pmis";
process.env.SESSION_SECRET ??= "test-only";

const { passwordProblem, adminSetPassword, loadPasswordStatus } = await import("@/lib/auth/passwords");
const { createSessionValue, verifySessionValue } = await import("@/lib/auth/session");
const { parseUserInput, saveUser } = await import("@/lib/admin/users");
const { withUser } = await import("@/lib/db");

const ADMIN = "20000000-0000-4000-8000-000000000007";
const LEAD_ALPHA = "20000000-0000-4000-8000-000000000005";
const EMAIL = "test-auth-1@naamii-demo.test";
// Test-only values, created and deleted by this file.
const FIRST = "First-pass-123", OWN = "My-own-pass-456";

let owner: pg.Client, app: pg.Pool, userId: string;
const cleanup = () => owner.query("DELETE FROM users WHERE email LIKE 'test-auth-%'");
const login = async (email: string, password: string) =>
  (await app.query<{ user_id: string | null; must_change: boolean; status: string }>("SELECT user_id, must_change, status FROM app.password_login($1, $2)", [email, password])).rows[0];

beforeAll(async () => {
  owner = new pg.Client({ connectionString: adminUrl() });
  await owner.connect();
  app = new pg.Pool({ connectionString: appUrl(), max: 2 });
  await cleanup();
  const { input } = parseUserInput({ name: "Auth Test", email: EMAIL, role: "project_lead", active: "on" });
  userId = (await withUser(ADMIN, (q) => saveUser(q, input!))).id;
});
afterAll(async () => { await cleanup(); await owner.end(); await app.end(); await (globalThis as { __pmisPool?: pg.Pool }).__pmisPool?.end(); });

describe("password rules", () => {
  it("requires 8+ characters with a letter and a number", () => {
    expect(passwordProblem("short1")).toMatch(/at least 8/);
    expect(passwordProblem("onlyletters")).toMatch(/letter and one number/);
    expect(passwordProblem("12345678")).toMatch(/letter and one number/);
    expect(passwordProblem(FIRST)).toBeNull();
  });
});

describe("session cookie", () => {
  it("accepts its own value and rejects a tampered, foreign or expired one", () => {
    const value = createSessionValue(userId);
    expect(verifySessionValue(value)).toBe(userId);
    expect(verifySessionValue(value.replace(userId, ADMIN))).toBeNull();           // another user's id, same signature
    expect(verifySessionValue(value.slice(0, -2) + "xx")).toBeNull();
    expect(verifySessionValue(value, Date.now() + 9 * 3600_000)).toBeNull();        // 9 hours later
    expect(verifySessionValue(undefined)).toBeNull();
  });
});

describe("sign-in", () => {
  it("a user without a password cannot sign in", async () => {
    expect(await login(EMAIL, FIRST)).toMatchObject({ user_id: null, status: "invalid" });
  });

  it("the administrator sets a first password; the user signs in and must choose their own", async () => {
    await withUser(ADMIN, (q) => adminSetPassword(q, userId, FIRST));
    expect(await login(EMAIL, FIRST)).toEqual({ user_id: userId, must_change: true, status: "ok" });
    expect(await login(EMAIL.toUpperCase(), FIRST)).toMatchObject({ status: "ok" }); // user ID is not case-sensitive
    expect(await login(EMAIL, "Wrong-pass-999")).toMatchObject({ user_id: null, status: "invalid" });
    expect(await login("nobody@naamii-demo.test", FIRST)).toMatchObject({ user_id: null, status: "invalid" }); // same answer as a wrong password

    // The user replaces it — the current password is required.
    const change = (cur: string, next: string) => withUser(userId, async (q) => (await q.query<{ ok: boolean }>("SELECT app.change_own_password($1, $2) AS ok", [cur, next])).rows[0].ok);
    expect(await change("Wrong-pass-999", OWN)).toBe(false);
    expect(await change(FIRST, OWN)).toBe(true);
    expect(await login(EMAIL, FIRST)).toMatchObject({ status: "invalid" });
    expect(await login(EMAIL, OWN)).toEqual({ user_id: userId, must_change: false, status: "ok" });
  });

  it("stores only a hash, which the application role cannot read", async () => {
    const stored = (await owner.query("SELECT password_hash FROM user_credentials WHERE user_id = $1", [userId])).rows[0].password_hash as string;
    expect(stored).toMatch(/^\$2a\$10\$/);
    expect(stored).not.toContain(OWN);
    await expect(app.query("SELECT * FROM user_credentials")).rejects.toMatchObject({ code: "42501" });
    await expect(withUser(ADMIN, (q) => q.query("SELECT * FROM user_credentials"))).rejects.toMatchObject({ code: "42501" });
    await expect(app.query("SELECT app.store_password($1, 'Sneaky-pass-1', false)", [ADMIN])).rejects.toMatchObject({ code: "42501" });
  });

  it("only an administrator can set someone else's password", async () => {
    await expect(withUser(LEAD_ALPHA, (q) => adminSetPassword(q, userId, "Hijack-pass-1"))).rejects.toMatchObject({ code: "42501" });
    await expect(withUser(userId, (q) => adminSetPassword(q, ADMIN, "Hijack-pass-1"))).rejects.toMatchObject({ code: "42501" });
    await expect(app.query("SELECT app.admin_set_password($1, 'Hijack-pass-1')", [userId])).rejects.toMatchObject({ code: "42501" }); // not signed in at all
    expect(await login(EMAIL, OWN)).toMatchObject({ status: "ok" });
    expect((await withUser(LEAD_ALPHA, (q) => loadPasswordStatus(q))).size).toBe(0);
    expect((await withUser(ADMIN, (q) => loadPasswordStatus(q))).get(userId)).toMatchObject({ hasPassword: true, mustChange: false, locked: false });
  });

  it("locks the account after 5 wrong passwords, and an administrator reset unlocks it", async () => {
    for (let i = 0; i < 4; i++) expect(await login(EMAIL, "Wrong-pass-999")).toMatchObject({ status: "invalid" });
    expect(await login(EMAIL, "Wrong-pass-999")).toMatchObject({ status: "locked" });
    expect(await login(EMAIL, OWN)).toMatchObject({ user_id: null, status: "locked" }); // even the right password, while locked
    await withUser(ADMIN, (q) => adminSetPassword(q, userId, FIRST));
    expect(await login(EMAIL, FIRST)).toMatchObject({ user_id: userId, must_change: true, status: "ok" });
  });

  it("a deactivated user cannot sign in, and an existing session stops working", async () => {
    const session = async () => (await app.query("SELECT id FROM app.session_user($1)", [userId])).rowCount;
    expect(await session()).toBe(1);
    await owner.query("UPDATE users SET active = false WHERE id = $1", [userId]);
    expect(await login(EMAIL, FIRST)).toMatchObject({ user_id: null, status: "invalid" });
    expect(await session()).toBe(0);
  });

  it("records password changes in the audit log, never the password", async () => {
    const { rows } = await owner.query("SELECT actor_user_id, after::text AS after FROM audit_log WHERE entity = 'user_credentials' AND entity_id = $1 ORDER BY id", [userId]);
    expect(rows.map((r) => r.actor_user_id)).toEqual([ADMIN, userId, ADMIN]);
    expect(rows.map((r) => r.after).join(" ")).not.toMatch(/pass/i);
  });
});
