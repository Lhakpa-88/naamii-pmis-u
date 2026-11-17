"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "../auth/current-user";
import { withUser } from "../db";
import { LabError, deleteLab, parseLabInput, saveLab } from "./labs";

/** Add or update a lab (Finance & Operations only; the database enforces the same rule). */
export async function saveLabAction(formData: FormData): Promise<void> {
  const admin = await requireRole("admin");
  const id = String(formData.get("id") ?? "");
  const formPath = id ? `/admin/labs/${id}` : "/admin/labs/new";
  const fail = (message: string): never => redirect(`${formPath}?err=${encodeURIComponent(message)}`);

  const { input, errors } = parseLabInput({
    id, code: formData.get("code"), name: formData.get("name"), piUserId: formData.get("piUserId"), active: formData.get("active"),
  });
  if (!input) fail(errors.join(" "));

  let message: string;
  try {
    const result = await withUser(admin.id, (q) => saveLab(q, input!));
    message = result.created
      ? `${input!.name} was added. It is now available wherever a lab is chosen.`
      : `${input!.name} was updated${input!.active ? "" : " and retired: it is no longer offered for new projects or users"}.`;
  } catch (err) {
    if (!(err instanceof LabError)) throw err;
    fail(err.message);
  }
  revalidatePath("/", "layout");
  redirect(`/admin/labs?ok=${encodeURIComponent(message!)}`);
}

/** Delete a lab that has no projects. */
export async function deleteLabAction(formData: FormData): Promise<void> {
  const admin = await requireRole("admin");
  const id = String(formData.get("id") ?? "");
  let message: string;
  try {
    const { name } = await withUser(admin.id, (q) => deleteLab(q, id));
    message = `${name} was deleted.`;
  } catch (err) {
    if (!(err instanceof LabError)) throw err;
    redirect(`/admin/labs?err=${encodeURIComponent(err.message)}`);
  }
  revalidatePath("/", "layout");
  redirect(`/admin/labs?ok=${encodeURIComponent(message!)}`);
}
