"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "../auth/current-user";
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

  let message: string;
  try {
    const result = await withUser(admin.id, (q) => saveUser(q, input!));
    message = result.created
      ? `${input!.name} was added. They can sign in with ${input!.email}.`
      : `${input!.name} was updated${input!.active ? "" : " and can no longer sign in"}.`;
  } catch (err) {
    if (!(err instanceof UserError)) throw err;
    fail(err.message);
  }
  revalidatePath("/", "layout");
  redirect(`/admin/users?ok=${encodeURIComponent(message!)}`);
}
