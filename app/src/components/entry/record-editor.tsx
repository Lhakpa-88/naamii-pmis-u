import { enumLabel, type FieldSpec, type SheetSpec } from "@naamii/core";
import { deleteRecordAction, saveRecordAction } from "@/lib/entry/actions";
import type { EntryRow } from "@/lib/entry/write";
import { ConfirmButton } from "./confirm-button";

/**
 * Form rendering generated from the shared field definitions (@naamii/core),
 * so the forms ask for exactly what the Excel template asks for.
 */

export type FieldOptions = Record<string, { value: string; label: string }[]>;

const INPUT = "w-full rounded-md border border-cool-300 bg-white px-2.5 py-1.5 text-[13px] text-ink placeholder:text-cool focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink";

function toInput(f: FieldSpec, v: unknown): string {
  if (v === null || v === undefined) return "";
  if (f.type === "boolean") return v ? "Yes" : "No";
  if (f.type === "date") return String(v).slice(0, 10);
  if (f.type === "month") return String(v).slice(0, 7);
  return String(v);
}

export function FieldInput({ field, value, options, labelled, multiline, idPrefix }: { field: FieldSpec; value?: unknown; options?: FieldOptions; labelled?: boolean; multiline?: boolean; idPrefix: string }) {
  const id = `${idPrefix}-${field.key}`;
  const common = { id, name: field.key, required: field.required, "aria-label": labelled ? undefined : field.header, className: INPUT };
  const v = toInput(field, value);
  const picks = options?.[field.key];
  if (field.type === "enum" || field.type === "boolean" || picks) {
    const opts = picks ?? (field.type === "boolean" ? ["Yes", "No"] : field.options ?? []).map((o) => ({ value: o, label: field.type === "boolean" ? o : enumLabel(o) }));
    const showBlank = !v || (!field.required && !!picks);
    return (
      <select {...common} defaultValue={v}>
        {showBlank ? <option value="">{field.required ? "Choose…" : "—"}</option> : null}
        {v && !opts.some((o) => o.value === v) ? <option value={v}>{v}</option> : null}
        {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    );
  }
  if (field.type === "number") return <input {...common} type="number" step="any" min={field.min} max={field.max} defaultValue={v} inputMode="decimal" className={`${INPUT} tnum text-right`} />;
  if (field.type === "date") return <input {...common} type="date" defaultValue={v} />;
  if (field.type === "month") return <input {...common} type="month" defaultValue={v} />;
  if (multiline && field.key === "description") return <textarea {...common} rows={3} defaultValue={v} maxLength={2000} />;
  return <input {...common} type="text" defaultValue={v} maxLength={field.key === "currency" ? 3 : 500} />;
}

const WIDTH: Record<FieldSpec["type"], string> = { text: "minmax(170px, 1fr)", number: "132px", date: "150px", month: "150px", enum: "140px", boolean: "96px" };
const PRIMARY = "rounded-md bg-ink px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-ink-700";
const SECONDARY = "rounded-md border border-cool-300 bg-white px-3 py-1.5 text-[12.5px] font-medium text-ink hover:bg-cool-100";

/**
 * A table-like editor: one form per existing record (Save / Delete) and one
 * empty form at the bottom to add a record. The project comes from the page.
 */
export function RecordEditor({ sheet, rows, projectId, returnTo, emptyText, canDelete = true }: { sheet: SheetSpec; rows: EntryRow[]; projectId: string; returnTo: string; emptyText: string; canDelete?: boolean }) {
  const fields = sheet.fields.filter((f) => f.key !== "project_code");
  const template = `${fields.map((f) => WIDTH[f.type]).join(" ")} 150px`;
  const minWidth = fields.reduce((n, f) => n + (f.type === "text" ? 170 : parseInt(WIDTH[f.type], 10)), 150) + fields.length * 8 + 40;
  const hidden = (id?: string) => (
    <>
      <input type="hidden" name="entity" value={sheet.entity} />
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="returnTo" value={returnTo} />
      {id ? <input type="hidden" name="id" value={id} /> : null}
    </>
  );
  return (
    <div className="overflow-x-auto">
      <div style={{ minWidth }}>
        <div className="grid gap-2 bg-cool-100 px-5 py-2 text-[11.5px] font-semibold uppercase tracking-wide text-grey" style={{ gridTemplateColumns: template }}>
          {fields.map((f) => <span key={f.key} className={f.type === "number" ? "text-right" : ""} title={f.help}>{f.header}{f.required ? " *" : ""}</span>)}
          <span />
        </div>
        {rows.length === 0 ? <p className="border-t border-cool-200 px-5 py-3 text-[13px] text-grey">{emptyText}</p> : null}
        {rows.map((r) => (
          <form key={r.id} action={saveRecordAction} className="grid items-center gap-2 border-t border-cool-200 px-5 py-2" style={{ gridTemplateColumns: template }}>
            {hidden(r.id)}
            {fields.map((f) => <FieldInput key={f.key} field={f} value={r[f.key]} idPrefix={r.id} />)}
            <span className="flex justify-end gap-1.5">
              <button type="submit" className={SECONDARY}>Save</button>
              {canDelete ? <ConfirmButton action={deleteRecordAction} message={`Delete this ${sheet.noun}? This cannot be undone.`} className="rounded-md px-2 py-1.5 text-[12.5px] font-medium text-critical hover:bg-critical/5">Delete</ConfirmButton> : null}
            </span>
          </form>
        ))}
        <form action={saveRecordAction} className="grid items-center gap-2 border-t border-cool-300 bg-cool-100/60 px-5 py-3" style={{ gridTemplateColumns: template }}>
          {hidden()}
          {fields.map((f) => <FieldInput key={f.key} field={f} idPrefix={`new-${sheet.entity}`} />)}
          <span className="flex justify-end"><button type="submit" className={PRIMARY}>Add {sheet.noun === "monthly financial record" ? "month" : sheet.noun}</button></span>
        </form>
      </div>
    </div>
  );
}

/** The project master record as a labelled form (Finance & Operations only). */
export function ProjectForm({ sheet, row, options, returnTo }: { sheet: SheetSpec; row?: EntryRow; options: FieldOptions; returnTo: string }) {
  return (
    <form action={saveRecordAction} className="px-5 py-4">
      <input type="hidden" name="entity" value="projects" />
      <input type="hidden" name="returnTo" value={returnTo} />
      {row ? <input type="hidden" name="id" value={row.id} /> : null}
      <div className="grid gap-x-5 gap-y-3.5 md:grid-cols-2 xl:grid-cols-3">
        {sheet.fields.map((f) => (
          <div key={f.key} className={f.key === "description" || f.key === "name" ? "md:col-span-2 xl:col-span-3" : ""}>
            <label htmlFor={`project-${f.key}`} className="mb-1 block text-[12.5px] font-medium text-ink">{f.header}{f.required ? <span className="text-critical"> *</span> : null}</label>
            <FieldInput field={f} value={row?.[f.key]} options={options} labelled multiline idPrefix="project" />
            <p className="mt-1 text-[11.5px] leading-snug text-grey">{f.help}</p>
          </div>
        ))}
      </div>
      <div className="mt-5 flex items-center gap-3">
        <button type="submit" className="rounded-md bg-ink px-4 py-2 text-[13px] font-semibold text-white hover:bg-ink-700">{row ? "Save project details" : "Create project"}</button>
        <span className="text-[12px] text-grey">* required</span>
      </div>
    </form>
  );
}

/** Result banner driven by the ?ok= / ?err= query the save actions redirect with. */
export function EntryNotice({ ok, err, inCard }: { ok?: string; err?: string; inCard?: boolean }) {
  if (!ok && !err) return null;
  return (
    <p role={err ? "alert" : "status"} className={`${inCard ? "mx-5 mt-4" : "mb-4"} rounded-md border px-3.5 py-2.5 text-[13px] font-medium ${err ? "border-critical/30 bg-critical/5 text-critical" : "border-good/30 bg-good/10 text-good"}`}>
      {err ?? ok}
    </p>
  );
}
