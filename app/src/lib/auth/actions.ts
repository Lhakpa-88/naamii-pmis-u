"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { anonymousQuery } from "../db";
import { env } from "../env";
import { DEMO_COOKIE, createDemoSessionValue } from "./session";

/** Demo Mode only: sign in as one of the fictional demo accounts. */
export async function signInAsDemo(formData: FormData) {
  if (env.authMode !== "demo") redirect("/login");
  const userId = String(formData.get("userId") ?? "");
  const { rowCount } = await anonymousQuery("SELECT 1 FROM app.demo_accounts() WHERE id = $1", [userId]);
  if (!rowCount) redirect("/login?error=unknown");
  (await cookies()).set(DEMO_COOKIE, createDemoSessionValue(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: env.isProduction,
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  redirect("/");
}

export async function signOut() {
  (await cookies()).delete(DEMO_COOKIE);
  redirect(env.authMode === "entra" ? "/.auth/logout?post_logout_redirect_uri=/login" : "/login");
}
