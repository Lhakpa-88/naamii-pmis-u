"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canEnterData, entrySheetsFor, parseRecord, type EntryEntity, type ParsedValue } from "@naamii/core";
import { requireUser } from "../auth/current-user";
import { withUser } from "../db";
import { runImport, type ImportOutcome } from "./import";
import { EntryError, deleteRecord, loadRefData, writeRecord } from "./write";

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ImportState = { outcome: ImportOutcome | null; error: string | null };

/** Excel upload: "check" validates only; "import" validates and saves (all rows or none). */
export async function importWorkbookAction(_prev: ImportState, formData: FormData): Promise<ImportState> {
  const user = await requireUser();
  if (!canEnterData(user.role)) return { outcome: null, error: "Your role cannot import data." };
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { outcome: null, error: "Choose an Excel file (.xlsx) first." };
  if (!/\.xlsx$/i.test(file.name)) return { outcome: null, error: "Only Excel workbooks (.xlsx) can be imported. Save the file as .xlsx and try again." };
  if (file.size > MAX_UPLOAD_BYTES) return { outcome: null, error: "The file is larger than 8 MB. Split it into smaller files." };

  const checkOnly = formData.get("mode") !== "import";
  const outcome = await runImport(user, file.name.slice(0, 200), await file.arrayBuffer(), checkOnly);
  if (outcome.ok && !checkOnly) revalidatePath("/", "layout");
  return { outcome, error: null };
}

/** Only same-site paths are accepted as a return target. */
function safeReturn(raw: FormDataEntryValue | null, fallback: string): string {
  const s = typeof raw === "string" ? raw : "";
  return /^\/(?!\/)[\w\-./]*$/.test(s) ? s : fallback;
}

function back(path: string, kind: "ok" | "err", message: string, section: string): never {
  redirect(`${path}?${kind}=${encodeURIComponent(message)}&at=${section}#${section}`);
}

/** Save one record from a form (create when no id is posted, otherwise update). */
export async function saveRecordAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const entity = String(formData.get("entity") ?? "") as EntryEntity;
  const returnTo = safeReturn(formData.get("returnTo"), "/data-entry");
  const sheet = entrySheetsFor(user.role).find((s) => s.entity === entity);
  if (!sheet) back(returnTo, "err", "Your role cannot enter this kind of record.", entity);

  const id = String(formData.get("id") ?? "");
  const projectId = String(formData.get("projectId") ?? "");
  if ((id && !UUID.test(id)) || (entity !== "projects" && !UUID.test(projectId))) back(returnTo, "err", "The form was incomplete. Reload the page and try again.", entity);

  const raw: Record<string, unknown> = {};
  for (const f of sheet.fields) raw[f.key] = formData.get(f.key);
  if (entity !== "projects") raw.project_code = "(this project)"; // the project comes from the page, not from a typed code
  const { values, errors } = parseRecord(sheet, raw);
  if (errors.length) back(returnTo, "err", errors.map((e) => e.message).join(" "), entity);

  let message: string, target = returnTo;
  try {
    const result = await withUser(user.id, async (q) => {
      const ref = await loadRefData(q);
      return writeRecord(q, entity, values as Record<string, ParsedValue>, {
        mode: "form", id: id || null, projectId: entity === "projects" ? null : projectId, ref,
        prov: { sourceFile: `Entered in PMIS by ${user.name}` },
      });
    });
    message = `${sheet.noun.charAt(0).toUpperCase()}${sheet.noun.slice(1)} ${result.action === "inserted" ? "added" : "saved"}.`;
    if (entity === "projects" && result.action === "inserted") target = `/projects/${result.id}/edit`;
  } catch (err) {
    if (!(err instanceof EntryError)) throw err;
    back(returnTo, "err", err.message, entity);
  }
  revalidatePath("/", "layout");
  back(target, "ok", message, entity);
}

/** Delete one milestone, risk, team member or monthly financial record. */
export async function deleteRecordAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const entity = String(formData.get("entity") ?? "") as EntryEntity;
  const returnTo = safeReturn(formData.get("returnTo"), "/data-entry");
  const sheet = entrySheetsFor(user.role).find((s) => s.entity === entity);
  const id = String(formData.get("id") ?? ""), projectId = String(formData.get("projectId") ?? "");
  if (!sheet || entity === "projects" || !UUID.test(id) || !UUID.test(projectId)) back(returnTo, "err", "This record cannot be deleted.", entity);
  try {
    await withUser(user.id, (q) => deleteRecord(q, entity, id, projectId));
  } catch (err) {
    if (!(err instanceof EntryError)) throw err;
    back(returnTo, "err", err.message, entity);
  }
  revalidatePath("/", "layout");
  back(returnTo, "ok", `${sheet.noun.charAt(0).toUpperCase()}${sheet.noun.slice(1)} deleted.`, entity);
}
