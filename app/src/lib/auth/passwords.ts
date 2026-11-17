import "server-only";
import type { Queryable } from "../db";

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72; // bcrypt uses at most 72 bytes
export const PASSWORD_RULE = `At least ${PASSWORD_MIN} characters, with at least one letter and one number.`;

/** Why a proposed password is not acceptable, or null when it is. */
export function passwordProblem(password: string): string | null {
  if (password.length < PASSWORD_MIN) return `The password must be at least ${PASSWORD_MIN} characters long.`;
  if (Buffer.byteLength(password, "utf8") > PASSWORD_MAX) return `The password must be at most ${PASSWORD_MAX} characters long.`;
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return "The password must contain at least one letter and one number.";
  return null;
}

/** Administrator sets or resets a user's password; the user must then choose their own at next sign-in. */
export async function adminSetPassword(q: Queryable, userId: string, password: string): Promise<void> {
  await q.query("SELECT app.admin_set_password($1, $2)", [userId, password]);
}

export interface PasswordStatus { hasPassword: boolean; mustChange: boolean; locked: boolean; lastLoginAt: Date | null }

/** Password state per user id, for the Users & Roles page (empty for non-administrators). */
export async function loadPasswordStatus(q: Queryable): Promise<Map<string, PasswordStatus>> {
  const { rows } = await q.query<{ user_id: string; has_password: boolean; must_change: boolean; locked: boolean; last_login_at: Date | null }>(
    "SELECT user_id, has_password, must_change, locked, last_login_at FROM app.password_status()");
  return new Map(rows.map((r) => [r.user_id, { hasPassword: r.has_password, mustChange: r.must_change, locked: r.locked, lastLoginAt: r.last_login_at }]));
}
