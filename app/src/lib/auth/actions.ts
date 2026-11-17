"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { anonymousQuery, withUser } from "../db";
import { env } from "../env";
import { requireUser } from "./current-user";
import { passwordProblem } from "./passwords";
import { SESSION_COOKIE, createSessionValue, sessionCookieOptions } from "./session";

/** Sign in with user ID (e-mail) and password. */
export async function signInWithPassword(formData: FormData) {
  if (env.authMode !== "password") redirect("/login");
  const userId = String(formData.get("userId") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!userId || !password) redirect("/login?error=missing");

  // The database checks the password; it never says whether the user ID exists.
  const { rows } = await anonymousQuery<{ user_id: string | null; must_change: boolean; status: string }>(
    "SELECT user_id, must_change, status FROM app.password_login($1, $2)", [userId.slice(0, 254), password.slice(0, 200)]);
  const result = rows[0];
  if (!result?.user_id) redirect(`/login?error=${result?.status === "locked" ? "locked" : "invalid"}`);

  (await cookies()).set(SESSION_COOKIE, createSessionValue(result.user_id), sessionCookieOptions());
  redirect(result.must_change ? "/account/password" : "/");
}

/** Development sign-in: a user ID (Admin / PI / PM / ED, or an e-mail) and no password. Never available in production. */
export async function signInForDevelopment(formData: FormData) {
  if (env.authMode !== "dev") redirect("/login");
  const typed = String(formData.get("userId") ?? "").trim().slice(0, 254);
  if (!typed) redirect("/login?error=missing-id");
  const { rows } = await anonymousQuery<{ id: string | null }>("SELECT app.dev_login($1) AS id", [typed]);
  const id = rows[0]?.id;
  if (!id) redirect("/login?error=unknown-id");
  (await cookies()).set(SESSION_COOKIE, createSessionValue(id), sessionCookieOptions());
  redirect("/");
}

/** Demo Mode only: sign in as one of the fictional demo accounts. */
export async function signInAsDemo(formData: FormData) {
  if (env.authMode !== "demo") redirect("/login");
  const userId = String(formData.get("userId") ?? "");
  const { rowCount } = await anonymousQuery("SELECT 1 FROM app.demo_accounts() WHERE id = $1", [userId]);
  if (!rowCount) redirect("/login?error=unknown");
  (await cookies()).set(SESSION_COOKIE, createSessionValue(userId), sessionCookieOptions());
  redirect("/");
}

export async function signOut() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect(env.authMode === "entra" ? "/.auth/logout?post_logout_redirect_uri=/login" : "/login");
}

/** A signed-in user changes their own password (the current one is required). */
export async function changePasswordAction(formData: FormData) {
  const user = await requireUser();
  if (env.authMode !== "password") redirect("/");
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const fail = (message: string): never => redirect(`/account/password?err=${encodeURIComponent(message)}`);

  if (next !== confirm) fail("The two new passwords do not match.");
  const problem = passwordProblem(next);
  if (problem) fail(problem);
  if (next === current) fail("The new password must be different from the current one.");

  const ok = await withUser(user.id, async (q) =>
    (await q.query<{ ok: boolean }>("SELECT app.change_own_password($1, $2) AS ok", [current, next])).rows[0]?.ok);
  if (!ok) fail("The current password is not correct.");
  redirect("/?password=changed");
}
