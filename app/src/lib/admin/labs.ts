import "server-only";
import type { Queryable } from "../db";

/**
 * Lab management — Finance & Operations (the admin role) only. Labs are data,
 * not code: every lab pick-list in PMIS (project forms, user forms, the Excel
 * template's Lists sheet) reads the `labs` table, so a lab added, renamed,
 * deactivated or deleted here changes those lists immediately.
 * Row Level Security refuses every other role; changes are audited.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class LabError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = "LabError";
  }
}

export interface LabInput {
  id: string | null;
  code: string;
  name: string;
  /** The Principal Investigator who leads the lab (optional). */
  piUserId: string | null;
  active: boolean;
}

export function parseLabInput(raw: { id?: unknown; code?: unknown; name?: unknown; piUserId?: unknown; active?: unknown }): { input: LabInput | null; errors: string[] } {
  const errors: string[] = [];
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const id = str(raw.id), code = str(raw.code).toUpperCase().replace(/\s+/g, "-"), name = str(raw.name).replace(/\s+/g, " "), piUserId = str(raw.piUserId);
  if (id && !UUID.test(id)) errors.push("The form was incomplete. Reload the page and try again.");
  if (!name) errors.push("Lab name is required.");
  else if (name.length > 200) errors.push("Lab name is too long.");
  if (!code) errors.push("Lab code is required.");
  else if (!/^[A-Z0-9][A-Z0-9-]{1,19}$/.test(code)) errors.push("Lab code must be 2–20 letters, digits or hyphens, for example AIM or CS-LAB.");
  if (piUserId && !UUID.test(piUserId)) errors.push("Choose a Principal Investigator from the list.");
  if (errors.length) return { input: null, errors };
  return { errors, input: { id: id || null, code, name, piUserId: piUserId || null, active: raw.active === true || raw.active === "on" || raw.active === "true" } };
}

function friendly(err: unknown): LabError {
  if (err instanceof LabError) return err;
  const e = err as { code?: string; message?: string; constraint?: string };
  if (e.code === "42501") return new LabError("NOT_PERMITTED", "Only Finance & Operations can manage labs.");
  if (e.code === "23505") return new LabError("DUPLICATE", "Another lab already uses this code.");
  if (e.code === "23503") return new LabError("IN_USE", "This lab is still referred to by other records.");
  return new LabError("DATABASE_ERROR", `The lab could not be saved: ${e.message ?? "unknown error"}`);
}

/** Create or update a lab. */
export async function saveLab(q: Queryable, input: LabInput): Promise<{ id: string; created: boolean }> {
  try {
    if (input.piUserId) {
      const pi = await q.query("SELECT 1 FROM users WHERE id = $1 AND role = 'pi' AND active", [input.piUserId]);
      if (!pi.rowCount) throw new LabError("WRONG_ROLE", "The lab’s PI must be an active user with the Principal Investigator role.");
    }
    let id = input.id;
    const created = !id;
    if (id) {
      const { rowCount } = await q.query("UPDATE labs SET code = $2, name = $3, pi_user_id = $4, active = $5 WHERE id = $1",
        [id, input.code, input.name, input.piUserId, input.active]);
      if (!rowCount) throw new LabError("NOT_PERMITTED", "This lab no longer exists, or only Finance & Operations can manage labs.");
    } else {
      const org = await q.query<{ id: string }>("SELECT id FROM organizations ORDER BY created_at LIMIT 1");
      if (!org.rowCount) throw new LabError("NO_ORGANIZATION", "No organisation record exists yet; run the database set-up first.");
      const { rows } = await q.query<{ id: string }>(
        "INSERT INTO labs (organization_id, code, name, pi_user_id, active) VALUES ($1, $2, $3, $4, $5) RETURNING id",
        [org.rows[0].id, input.code, input.name, input.piUserId, input.active]);
      id = rows[0].id;
    }
    // The named PI leads this lab (and so sees its projects); a replaced PI no longer does,
    // unless it is still their own home lab on their user record.
    await q.query("DELETE FROM pi_lab WHERE lab_id = $1 AND ($2::uuid IS NULL OR user_id <> $2)", [id, input.piUserId]);
    if (input.piUserId) await q.query("INSERT INTO pi_lab (user_id, lab_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [input.piUserId, id]);
    return { id, created };
  } catch (err) {
    throw friendly(err);
  }
}

/**
 * Delete a lab. Refused while the lab still has projects (move or close them
 * first, or deactivate the lab instead). People attached to the lab are kept;
 * only their link to this lab is cleared.
 */
export async function deleteLab(q: Queryable, id: string): Promise<{ name: string }> {
  try {
    if (!UUID.test(id)) throw new LabError("NOT_FOUND", "This lab no longer exists.");
    const lab = await q.query<{ name: string; projects: number }>(
      "SELECT l.name, (SELECT count(*) FROM projects p WHERE p.lab_id = l.id)::int AS projects FROM labs l WHERE l.id = $1", [id]);
    if (!lab.rowCount) throw new LabError("NOT_FOUND", "This lab no longer exists.");
    const { name, projects } = lab.rows[0];
    if (projects > 0) {
      throw new LabError("HAS_PROJECTS", `${name} still has ${projects} project${projects === 1 ? "" : "s"}. Move them to another lab first, or untick “Active” to retire the lab without deleting it.`);
    }
    await q.query("UPDATE users SET lab_id = NULL WHERE lab_id = $1", [id]);
    const { rowCount } = await q.query("DELETE FROM labs WHERE id = $1", [id]); // pi_lab rows go with it (cascade)
    if (!rowCount) throw new LabError("NOT_PERMITTED", "Only Finance & Operations can manage labs.");
    return { name };
  } catch (err) {
    throw friendly(err);
  }
}

export interface LabAdminRow { id: string; code: string; name: string; active: boolean; piUserId: string | null; piName: string | null; projects: number; people: number; updatedAt: Date }

/** Every lab, active or not, with what depends on it. */
export async function loadLabsAdmin(q: Queryable, id: string | null = null): Promise<LabAdminRow[]> {
  if (id && !UUID.test(id)) return [];
  const { rows } = await q.query<{ id: string; code: string; name: string; active: boolean; pi_user_id: string | null; pi_name: string | null; projects: number; people: number; updated_at: Date }>(
    `SELECT l.id, l.code, l.name, l.active, l.pi_user_id, u.name AS pi_name, l.updated_at,
            (SELECT count(*) FROM projects p WHERE p.lab_id = l.id)::int AS projects,
            (SELECT count(*) FROM users m WHERE m.lab_id = l.id)::int AS people
     FROM labs l LEFT JOIN users u ON u.id = l.pi_user_id
     WHERE ($1::uuid IS NULL OR l.id = $1) ORDER BY l.active DESC, l.name`, [id]);
  return rows.map((r) => ({ id: r.id, code: r.code, name: r.name, active: r.active, piUserId: r.pi_user_id, piName: r.pi_name, projects: r.projects, people: r.people, updatedAt: r.updated_at }));
}

export async function loadPiChoices(q: Queryable): Promise<{ id: string; name: string }[]> {
  const { rows } = await q.query<{ id: string; name: string }>("SELECT id, name FROM users WHERE role = 'pi' AND active ORDER BY name");
  return rows;
}
