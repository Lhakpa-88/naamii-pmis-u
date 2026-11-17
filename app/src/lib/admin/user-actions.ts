"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "../auth/current-user";
import { adminSetPassword, passwordProblem } from "../auth/passwords";
import { env } from "../env";
import { withUser } from "../db";
import { UserError, parseUserInput, saveUser } from "./users";

/** Add or update a user (Finance & Operations only; the database enforces the same rule). */
export async function saveUserAction(formData: FormData): Promise<void> {
  const admin = await requireRole("admin");
  const id = String(formData.get("id") ?? "");
  const formPath = id ? `/admin/users/${id}` : "/admin/users/new";
  const fail = (message: string): never => redirect(`${formPath}?err=${encodeURIComponent(message)}`);

  const { input, errors } = parseUserInput({
    id, name: formData.get("name"), email: formData.get("email"), role: formData.get("role"),
    labId: formData.get("labId"), active: formData.get("active"), projectIds: formData.getAll("projectIds"),
  });
  if (!input) fail(errors.join(" "));

  // Password sign-in: a new user needs a first password; on an existing user a value means "reset".
  const password = env.authMode === "password" ? String(formData.get("password") ?? "") : "";
  if (env.authMode === "password" && !id && !password) fail("Give the new user a first password.");
  if (password) {
    const problem = passwordProblem(password);
    if (problem) fail(problem);
  }

  let message: string;
  try {
    const result = await withUser(admin.id, async (q) => {
      const saved = await saveUser(q, input!);
      if (password) await adminSetPassword(q, saved.id, password);
      return saved;
    });
    message = result.created
      ? `${input!.name} was added. They can sign in with ${input!.email}${password ? " and the password you set" : ""}.`
      : `${input!.name} was updated${password ? " and the password was reset" : ""}${input!.active ? "" : "; they can no longer sign in"}.`;
  } catch (err) {
    if (!(err instanceof UserError)) throw err;
    fail(err.message);
  }
  revalidatePath("/", "layout");
  redirect(`/admin/users?ok=${encodeURIComponent(message!)}`);
}
