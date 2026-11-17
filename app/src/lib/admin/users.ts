import "server-only";
import type { Role } from "@naamii/core";
import type { Queryable } from "../db";

/**
 * User management — Finance & Operations (the admin role) only. Every
 * statement runs as the signed-in user, so Row Level Security refuses anyone
 * else; the database also guards the last administrator and writes each change
 * to the audit log.
 *
 * Authentication: PMIS stores no passwords. A user is identified by their
 * e-mail address and signs in through Microsoft Entra ID; what they may see
 * and enter comes from the role, lab and projects recorded here.
 */

export const ROLES: Role[] = ["ed", "pi", "project_lead", "admin"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export class UserError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = "UserError";
  }
}

export interface UserInput {
  id: string | null;
  name: string;
  email: string;
  role: Role;
  /** The lab a PI leads, or a Project Lead's home lab. */
  labId: string | null;
  active: boolean;
  /** Projects a Project Lead may see and enter data for. */
  projectIds: string[];
}

/** Validate a submitted user form. Returns every problem found. */
export function parseUserInput(raw: { id?: unknown; name?: unknown; email?: unknown; role?: unknown; labId?: unknown; active?: unknown; projectIds?: unknown[] }): { input: UserInput | null; errors: string[] } {
  const errors: string[] = [];
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const id = str(raw.id), name = str(raw.name), email = str(raw.email).toLowerCase(), role = str(raw.role) as Role, labId = str(raw.labId);
  if (id && !UUID.test(id)) errors.push("The form was incomplete. Reload the page and try again.");
  if (!name) errors.push("Name is required.");
  else if (name.length > 200) errors.push("Name is too long.");
  if (!email) errors.push("E-mail is required.");
  else if (!EMAIL.test(email) || email.length > 254) errors.push(`“${email}” is not a valid e-mail address.`);
  if (!ROLES.includes(role)) errors.push("Choose a role.");
  if (labId && !UUID.test(labId)) errors.push("Choose a lab from the list.");
  if (role === "pi" && !labId) errors.push("A Principal Investigator must be given a lab.");
  const projectIds = [...new Set((raw.projectIds ?? []).map(str).filter(Boolean))];
  if (projectIds.some((p) => !UUID.test(p))) errors.push("Choose projects from the list.");
  if (errors.length) return { input: null, errors };
  return {
    errors,
    input: {
      id: id || null, name, email, role,
      // Org-wide roles are not tied to a lab; only a Project Lead is tied to projects.
      labId: role === "pi" || role === "project_lead" ? labId || null : null,
      active: raw.active === true || raw.active === "on" || raw.active === "true",
      projectIds: role === "project_lead" ? projectIds : [],
    },
  };
}

function friendly(err: unknown): UserError {
  if (err instanceof UserError) return err;
  const e = err as { code?: string; message?: string; constraint?: string };
  if (e.code === "42501") return new UserError("NOT_PERMITTED", "Only Finance & Operations can manage users.");
  if (e.code === "23505") return new UserError("DUPLICATE", "A user with this e-mail address already exists.");
  if (e.constraint === "users_no_self_demotion") return new UserError("SELF", "You cannot remove your own administrator access. Ask another administrator to do it.");
  if (e.constraint === "users_last_admin") return new UserError("LAST_ADMIN", "At least one active Finance & Operations administrator must remain.");
  if (e.code === "23503") return new UserError("INVALID_REFERENCE", "The chosen lab or project no longer exists.");
  return new UserError("DATABASE_ERROR", `The user could not be saved: ${e.message ?? "unknown error"}`);
}

/** Create or update a user together with their lab and project authority. */
export async function saveUser(q: Queryable, input: UserInput): Promise<{ id: string; created: boolean }> {
  try {
    let id = input.id;
    const created = !id;
    if (id) {
      const { rowCount } = await q.query(
        "UPDATE users SET name = $2, email = $3, role = $4, lab_id = $5, active = $6 WHERE id = $1",
        [id, input.name, input.email, input.role, input.labId, input.active]);
      if (!rowCount) throw new UserError("NOT_PERMITTED", "This user no longer exists, or only Finance & Operations can manage users.");
    } else {
      const { rows } = await q.query<{ id: string }>(
        "INSERT INTO users (name, email, role, lab_id, active) VALUES ($1, $2, $3, $4, $5) RETURNING id",
        [input.name, input.email, input.role, input.labId, input.active]);
      id = rows[0].id;
    }

    // PI → the lab they lead (drives which projects they see).
    // (Labs that name this person as their PI under Manage Labs are kept while they remain a PI.)
    await q.query(
      "DELETE FROM pi_lab WHERE user_id = $1 AND ($2::uuid IS NULL OR (lab_id <> $2 AND lab_id NOT IN (SELECT id FROM labs WHERE pi_user_id = $1)))",
      [id, input.role === "pi" ? input.labId : null]);
    if (input.role !== "pi") await q.query("UPDATE labs SET pi_user_id = NULL WHERE pi_user_id = $1", [id]);
    if (input.role === "pi" && input.labId) {
      await q.query("INSERT INTO pi_lab (user_id, lab_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [id, input.labId]);
      await q.query("UPDATE labs SET pi_user_id = $1 WHERE id = $2 AND pi_user_id IS NULL", [id, input.labId]);
    }

    // Project Lead → the projects they may see and enter data for.
    await q.query("DELETE FROM project_assignments WHERE user_id = $1 AND NOT (project_id = ANY($2::uuid[]))", [id, input.projectIds]);
    for (const projectId of input.projectIds) {
      await q.query("INSERT INTO project_assignments (user_id, project_id, role_in_project) VALUES ($1, $2, 'assigned') ON CONFLICT DO NOTHING", [id, projectId]);
    }
    // A project names its lead on the project record too; clear it where this person is no longer assigned.
    await q.query("UPDATE projects SET project_lead_id = NULL WHERE project_lead_id = $1 AND NOT (id = ANY($2::uuid[]))", [id, input.projectIds]);
    return { id, created };
  } catch (err) {
    throw friendly(err);
  }
}

export interface UserDetail { id: string; name: string; email: string; role: Role; labId: string | null; active: boolean; entraBound: boolean; projectIds: string[]; createdAt: Date; updatedAt: Date }

/** One user with their authority (admin only — RLS hides inactive users and assignments from others). */
export async function loadUser(q: Queryable, id: string): Promise<UserDetail | null> {
  if (!UUID.test(id)) return null;
  const { rows } = await q.query<{ id: string; name: string; email: string; role: Role; lab_id: string | null; active: boolean; entra_bound: boolean; created_at: Date; updated_at: Date; project_ids: string[] }>(
    `SELECT u.id, u.name, u.email::text, u.role, u.lab_id, u.active, (u.entra_object_id IS NOT NULL) AS entra_bound, u.created_at, u.updated_at,
            ARRAY(SELECT pa.project_id FROM project_assignments pa WHERE pa.user_id = u.id
                  UNION SELECT p.id FROM projects p WHERE p.project_lead_id = u.id) AS project_ids
     FROM users u WHERE u.id = $1`, [id]);
  const r = rows[0];
  return r ? { id: r.id, name: r.name, email: r.email, role: r.role, labId: r.lab_id, active: r.active, entraBound: r.entra_bound, projectIds: r.project_ids, createdAt: r.created_at, updatedAt: r.updated_at } : null;
}

export interface UserFormOptions {
  labs: { id: string; code: string; name: string; active: boolean }[];
  projects: { id: string; code: string; name: string; labName: string }[];
}

export async function loadUserFormOptions(q: Queryable): Promise<UserFormOptions> {
  const labs = await q.query<{ id: string; code: string; name: string; active: boolean }>("SELECT id, code, name, active FROM labs ORDER BY name");
  const projects = await q.query<{ id: string; code: string; name: string; lab_name: string }>(
    "SELECT p.id, p.code, p.name, l.name AS lab_name FROM projects p JOIN labs l ON l.id = p.lab_id ORDER BY l.name, p.name");
  return { labs: labs.rows, projects: projects.rows.map((p) => ({ id: p.id, code: p.code, name: p.name, labName: p.lab_name })) };
}

export interface UserChange { at: Date; actorName: string | null; action: string; entity: string; summary: string }

/** Recent changes to users and their authority, from the audit log. */
export async function loadUserChanges(q: Queryable, limit = 15): Promise<UserChange[]> {
  const { rows } = await q.query<{ at: Date; actor_name: string | null; action: string; entity: string; before: Record<string, unknown> | null; after: Record<string, unknown> | null; subject: string | null; project: string | null }>(
    `SELECT a.at, actor.name AS actor_name, a.action, a.entity, a.before, a.after,
            subject.name AS subject, p.code AS project
     FROM audit_log a
     LEFT JOIN users actor ON actor.id = a.actor_user_id
     LEFT JOIN users subject ON subject.id::text = a.entity_id
     LEFT JOIN projects p ON p.id::text = COALESCE(a.after->>'project_id', a.before->>'project_id')
     WHERE a.entity IN ('users', 'project_assignments', 'pi_lab') AND a.actor_user_id IS NOT NULL
     ORDER BY a.at DESC, a.id DESC LIMIT $1`, [limit]);
  return rows.map((r) => {
    const who = r.subject ?? String(r.after?.name ?? r.before?.name ?? "a user");
    let summary: string;
    if (r.entity === "users") {
      if (r.action === "INSERT") summary = `Added ${who} as ${String(r.after?.role)}`;
      else if (r.action === "DELETE") summary = `Removed ${who}`;
      else {
        const changed = ["name", "email", "role", "lab_id", "active"].filter((k) => JSON.stringify(r.before?.[k]) !== JSON.stringify(r.after?.[k]));
        summary = changed.length
          ? `Changed ${who}: ${changed.map((k) => (k === "lab_id" ? "lab" : k === "active" ? (r.after?.active ? "reactivated" : "deactivated") : `${k} → ${String(r.after?.[k])}`)).join(", ")}`
          : `Saved ${who} (no change)`;
      }
    } else if (r.entity === "project_assignments") {
      summary = `${r.action === "DELETE" ? "Removed" : "Assigned"} ${who} ${r.action === "DELETE" ? "from" : "to"} project ${r.project ?? ""}`.trim();
    } else {
      summary = `${r.action === "DELETE" ? "Removed" : "Set"} lab leadership for ${who}`;
    }
    return { at: r.at, actorName: r.actor_name, action: r.action, entity: r.entity, summary };
  });
}
