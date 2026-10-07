import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import type { CurrentUser, Role } from "@naamii/core";
import { anonymousQuery } from "../db";
import { env } from "../env";
import { getIdentity } from "./session";

interface ResolvedRow { id: string; email: string; name: string; role: Role; lab_id: string | null; entra_object_id: string | null }

/**
 * Map the authenticated identity to a PMIS user (role, lab, projects live in
 * the database, so changing a user's role changes their access with no code
 * change). Cached per request so layouts and pages share one lookup.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const identity = await getIdentity();
  if (!identity) return null;

  let row: ResolvedRow | undefined;
  if (identity.source === "demo") {
    // Demo Mode: the cookie carries the (signed) demo user id. Only .test accounts qualify.
    const { rows } = await anonymousQuery<ResolvedRow>(
      "SELECT id, email, name, role, lab_id, NULL::text AS entra_object_id FROM app.demo_accounts() WHERE id = $1",
      [identity.subject]
    );
    row = rows[0];
  } else {
    const { rows } = await anonymousQuery<ResolvedRow>("SELECT * FROM app.resolve_user($1, $2)", [identity.email, identity.subject]);
    row = rows[0];
    if (row && !row.entra_object_id && identity.subject) {
      await anonymousQuery("SELECT app.bind_entra_identity($1, $2)", [row.id, identity.subject]);
    }
  }
  if (!row) return null;
  return { id: row.id, email: row.email, name: row.name, role: row.role, labId: row.lab_id };
});

/** For pages: redirect to sign-in when there is no mapped, active user. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(env.authMode === "demo" ? "/login" : "/login?reason=unmapped");
  return user;
}

export async function requireRole(...roles: Role[]): Promise<CurrentUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) redirect("/");
  return user;
}
