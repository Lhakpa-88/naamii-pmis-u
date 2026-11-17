import "server-only";
import { randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
import { ENTRY_SHEETS, canEnterData, entrySheetsFor, isBlank, normalizeHeader, parseRecord, type CurrentUser, type ParsedValue, type SheetSpec } from "@naamii/core";
import { withUser, type Queryable } from "../db";
import { EntryError, loadRefData, writeRecord } from "./write";

/**
 * Excel import. A workbook is validated row by row and written inside ONE
 * transaction as the signed-in user: either every row is accepted and saved,
 * or nothing is saved and every problem is reported with its sheet and row.
 */

export interface ImportIssue { sheet: string | null; row: number | null; field: string | null; code: string; message: string }
export interface SheetResult { sheet: string; rows: number; inserted: number; updated: number; errors: number }
export interface ImportOutcome {
  fileName: string;
  /** True when the file is valid (and, unless checkOnly, has been saved). */
  ok: boolean;
  checkOnly: boolean;
  sheets: SheetResult[];
  issues: ImportIssue[];
  issuesTotal: number;
  warnings: string[];
}

const MAX_ROWS_PER_SHEET = 5000;
const MAX_ISSUES_SHOWN = 200;

class Rollback extends Error {}

/** Flatten an Excel cell to a plain value (formula results, rich text and hyperlinks included). */
function cellValue(cell: ExcelJS.Cell): unknown {
  let v: unknown = cell.value;
  if (v && typeof v === "object" && !(v instanceof Date)) {
    const o = v as Record<string, unknown>;
    if ("result" in o) v = o.result;                                   // formula → its calculated value
    else if (Array.isArray(o.richText)) v = (o.richText as { text: string }[]).map((t) => t.text).join("");
    else if ("text" in o) v = o.text;                                  // hyperlink
    else if ("error" in o) v = String(o.error);
    else if ("formula" in o || "sharedFormula" in o) v = null;         // formula never calculated
    if (v && typeof v === "object" && !(v instanceof Date)) v = "error" in (v as object) ? String((v as { error: unknown }).error) : String(v);
  }
  return typeof v === "string" ? v.trim() : v ?? null;
}

interface ReadSheet { spec: SheetSpec; rows: { row: number; raw: Record<string, unknown> }[] }

export async function runImport(user: CurrentUser, fileName: string, data: ArrayBuffer, checkOnly: boolean): Promise<ImportOutcome> {
  const issues: ImportIssue[] = [];
  const warnings: string[] = [];
  const results: SheetResult[] = [];
  const outcome = (ok: boolean): ImportOutcome => ({ fileName, ok, checkOnly, sheets: results, issues: issues.slice(0, MAX_ISSUES_SHOWN), issuesTotal: issues.length, warnings });

  if (!canEnterData(user.role)) {
    issues.push({ sheet: null, row: null, field: null, code: "NOT_PERMITTED", message: "Your role cannot import data." });
    return outcome(false);
  }

  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(data);
  } catch {
    issues.push({ sheet: null, row: null, field: null, code: "UNKNOWN_STRUCTURE", message: "This file could not be read as an Excel workbook (.xlsx). Download the template and use it as the starting point." });
    return outcome(false);
  }

  // ---- Read: locate sheets and columns --------------------------------------
  const allowed = entrySheetsFor(user.role);
  const read: ReadSheet[] = [];
  const bySheetName = new Map(wb.worksheets.map((ws) => [normalizeHeader(ws.name), ws]));

  for (const full of ENTRY_SHEETS) {
    const ws = bySheetName.get(normalizeHeader(full.sheet));
    if (!ws) continue;
    const spec = allowed.find((s) => s.entity === full.entity);
    const headerRow = ws.getRow(1);
    const colByHeader = new Map<string, number>();
    headerRow.eachCell((cell, col) => {
      const h = cellValue(cell);
      if (!isBlank(h)) colByHeader.set(normalizeHeader(String(h)), col);
    });

    const dataRows: { row: number; raw: Record<string, unknown> }[] = [];
    const fields = (spec ?? full).fields;
    const last = Math.min(ws.rowCount, MAX_ROWS_PER_SHEET + 1);
    for (let r = 2; r <= last; r++) {
      const row = ws.getRow(r);
      const raw: Record<string, unknown> = {};
      let any = false;
      for (const f of fields) {
        const col = colByHeader.get(normalizeHeader(f.header));
        const v = col ? cellValue(row.getCell(col)) : null;
        raw[f.key] = v;
        if (!isBlank(v)) any = true;
      }
      if (any) dataRows.push({ row: r, raw });
    }
    if (dataRows.length === 0) continue; // an empty sheet is simply not used

    if (!spec) {
      issues.push({ sheet: full.sheet, row: null, field: null, code: "NOT_PERMITTED", message: `The ${full.sheet} sheet can only be imported by Finance & Operations. Remove its rows, or ask Finance & Operations to import it.` });
      results.push({ sheet: full.sheet, rows: dataRows.length, inserted: 0, updated: 0, errors: 1 });
      continue;
    }
    if (ws.rowCount > MAX_ROWS_PER_SHEET + 1) {
      issues.push({ sheet: spec.sheet, row: null, field: null, code: "TOO_MANY_ROWS", message: `The ${spec.sheet} sheet has more than ${MAX_ROWS_PER_SHEET} rows. Split it into several files.` });
    }
    const missing = spec.fields.filter((f) => f.required && !colByHeader.has(normalizeHeader(f.header)));
    if (missing.length) {
      issues.push({ sheet: spec.sheet, row: 1, field: missing.map((f) => f.header).join(", "), code: "UNKNOWN_STRUCTURE", message: `Required column${missing.length > 1 ? "s" : ""} missing from row 1: ${missing.map((f) => f.header).join(", ")}. Column headings must match the template.` });
      results.push({ sheet: spec.sheet, rows: dataRows.length, inserted: 0, updated: 0, errors: 1 });
      continue;
    }
    // Columns the importer will not use (unknown headings, or fields this role may not enter).
    const known = new Set(spec.fields.map((f) => normalizeHeader(f.header)));
    const ignored = [...colByHeader.entries()].filter(([h]) => !known.has(h)).map(([, col]) => String(cellValue(headerRow.getCell(col))));
    if (ignored.length) warnings.push(`${spec.sheet}: column${ignored.length > 1 ? "s" : ""} not imported — ${ignored.join(", ")}.`);
    read.push({ spec, rows: dataRows });
  }

  if (read.length === 0 && issues.length === 0) {
    issues.push({ sheet: null, row: null, field: null, code: "NO_DATA", message: `No rows were found. Fill in at least one of these sheets: ${allowed.map((s) => s.sheet).join(", ")}.` });
  }

  // ---- Validate + write in one transaction ----------------------------------
  const runId = randomUUID();
  let saved = false;
  if (read.length > 0) {
    try {
      await withUser(user.id, async (q) => {
        const ref = await loadRefData(q);
        for (const { spec, rows } of read) {
          const res: SheetResult = { sheet: spec.sheet, rows: rows.length, inserted: 0, updated: 0, errors: 0 };
          results.push(res);
          const seen = new Map<string, number>();
          for (const { row, raw } of rows) {
            const fail = (field: string | null, code: string, message: string) => { issues.push({ sheet: spec.sheet, row, field, code, message }); res.errors++; };
            const { values, errors } = parseRecord(spec, raw);
            if (errors.length) { for (const e of errors) fail(e.field, e.code, e.message); continue; }

            const keyFields = spec.entity === "projects" ? ["code"] : ["project_code", spec.fields[1].key];
            const dupKey = keyFields.map((k) => String(values[k]).toLowerCase()).join(" | ");
            const first = seen.get(dupKey);
            if (first) { fail(spec.matchedBy, "DUPLICATE_ROW", `Same ${spec.matchedBy} as row ${first}. Each record may appear only once per file.`); continue; }
            seen.set(dupKey, row);

            await q.query("SAVEPOINT entry_row");
            try {
              const r = await writeRecord(q, spec.entity, values as Record<string, ParsedValue>, {
                mode: "import", ref, prov: { sourceFile: fileName, sourceSheet: spec.sheet, sourceRow: row, importRunId: runId },
              });
              await q.query("RELEASE SAVEPOINT entry_row");
              if (r.action === "inserted") res.inserted++; else res.updated++;
            } catch (err) {
              await q.query("ROLLBACK TO SAVEPOINT entry_row");
              const e = err instanceof EntryError ? err : new EntryError("DATABASE_ERROR", (err as Error).message);
              fail(e.field, e.code, e.message);
            }
          }
        }
        if (issues.length > 0 || checkOnly) throw new Rollback();
      });
      saved = true;
    } catch (err) {
      if (!(err instanceof Rollback)) throw err;
      // Nothing was saved: the counts describe what WOULD happen.
    }
  }

  if (!checkOnly) await logRun(user, runId, fileName, saved, results, issues);
  return outcome(issues.length === 0);
}

/** Record the upload (and its problems) so Finance & Operations can see it under Data Imports / Data Quality. */
async function logRun(user: CurrentUser, runId: string, fileName: string, saved: boolean, results: SheetResult[], issues: ImportIssue[]) {
  const rows = results.reduce((n, r) => n + r.inserted + r.updated, 0);
  await withUser(user.id, async (q: Queryable) => {
    await q.query(
      `INSERT INTO import_runs (id, finished_at, triggered_by, triggered_by_user, status, files_total, files_changed, files_unchanged, files_failed, notes)
       VALUES ($1, now(), 'manual_upload', $2, $3, 1, $4, 0, $5, $6)`,
      [runId, user.id, saved ? "success" : "failed", saved ? 1 : 0, saved ? 0 : 1,
       saved ? `Excel upload by ${user.name}: ${rows} rows saved` : `Excel upload by ${user.name}: rejected, ${issues.length} problem${issues.length === 1 ? "" : "s"} — nothing saved`]);
    await q.query(
      "INSERT INTO import_files (import_run_id, source_file, status, rows_upserted, message) VALUES ($1, $2, $3, $4, $5)",
      [runId, fileName, saved ? "success" : "failed", saved ? rows : 0,
       results.map((r) => `${r.sheet}: ${r.rows} rows`).join("; ") || null]);
    for (const i of issues.slice(0, 500)) {
      await q.query(
        "INSERT INTO import_errors (import_run_id, source_file, source_sheet, source_row, field, error_code, message) VALUES ($1, $2, $3, $4, $5, $6, $7)",
        [runId, fileName, i.sheet, i.row, i.field, i.code, i.message]);
    }
  });
}
