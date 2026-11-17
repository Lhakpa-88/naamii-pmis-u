import "server-only";
import ExcelJS from "exceljs";
import { ROLE_LABEL, entrySheetsFor, enumLabel, type CurrentUser, type FieldSpec, type SheetSpec } from "@naamii/core";
import type { Queryable } from "../db";
import { loadEntryOptions, loadEntryRows } from "./write";

/**
 * Build the Excel data-entry template for the signed-in user's role.
 * Sheets and columns come from the shared definition in @naamii/core, so the
 * template can never drift from what the importer accepts.
 * With `withData` the user's current records are filled in, so the workbook
 * can be edited in Excel and imported again.
 */

const INK = "FF454D59", COOL = "FFF4F5F7", RED = "FFDB0505", RULE = "FFD2D5DB";
const MAX_ROWS = 2000;

function formatHint(f: FieldSpec): string {
  switch (f.type) {
    case "text": return "Text";
    case "number": return f.min !== undefined && f.max !== undefined ? `Number ${f.min}–${f.max}` : f.min !== undefined ? `Number, ${f.min} or more` : "Number";
    case "date": return "Date (YYYY-MM-DD)";
    case "month": return "Month (YYYY-MM)";
    case "boolean": return "Yes / No";
    case "enum": return (f.options ?? []).map(enumLabel).join(" / ");
  }
}

function colLetter(n: number): string {
  let s = "";
  for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

function cellFor(f: FieldSpec, v: unknown): ExcelJS.CellValue {
  if (v === null || v === undefined) return null;
  if (f.type === "date") return new Date(`${String(v).slice(0, 10)}T00:00:00Z`);
  if (f.type === "boolean") return v ? "Yes" : "No";
  if (f.type === "enum") return enumLabel(String(v));
  if (f.type === "number") return Number(v);
  return String(v);
}

export async function buildTemplate(q: Queryable, user: CurrentUser, withData: boolean): Promise<Buffer> {
  const sheets = entrySheetsFor(user.role);
  const options = await loadEntryOptions(q);
  const admin = user.role === "admin";

  const wb = new ExcelJS.Workbook();
  wb.creator = "NAAMII PMIS";
  wb.created = new Date();

  // ---- Instructions -------------------------------------------------------
  const info = wb.addWorksheet("Instructions", { properties: { tabColor: { argb: RED } } });
  info.columns = [{ width: 22 }, { width: 26 }, { width: 12 }, { width: 34 }, { width: 90 }];
  const line = (text: string, style: Partial<ExcelJS.Font> = {}) => {
    const r = info.addRow([text]);
    info.mergeCells(r.number, 1, r.number, 5);
    r.getCell(1).font = { name: "Helvetica Neue", size: 11, color: { argb: INK }, ...style };
    r.getCell(1).alignment = { wrapText: true, vertical: "top" };
    return r;
  };
  line("NAAMII PMIS — data entry template", { size: 16, bold: true });
  line(`Prepared for: ${user.name} (${ROLE_LABEL[user.role]}) · generated ${new Date().toISOString().slice(0, 10)}`, { color: { argb: "FF737370" } });
  info.addRow([]);
  line("How to use this workbook", { bold: true, size: 12 });
  const steps = [
    "1. Fill in the sheets you need. Each sheet is one kind of record; each row is one record. Leave sheets you do not need empty.",
    "2. Do not rename the sheets or the column headings in row 1. Columns marked * are required.",
    "3. Type dates as YYYY-MM-DD (for example 2026-07-15) and months as YYYY-MM. Type amounts as plain numbers — no currency symbols or words such as “lakh”.",
    "4. In PMIS open Data Entry → Import from Excel, choose this file and press “Check file”. Nothing is saved until the check passes and you press “Import”.",
    "5. If the check reports problems, correct the listed rows in this workbook and upload it again. A file is imported completely or not at all.",
    "6. Importing the same file twice is safe: a row that matches an existing record (see “Matched by” below) updates it instead of creating a duplicate. A blank cell leaves the existing value unchanged.",
  ];
  for (const s of steps) line(s).height = 30;
  info.addRow([]);
  line(admin
    ? "Your role (Finance & Operations) can enter every sheet. Project Leads receive a shorter template: the monthly Forecast, Milestones, Risks and Team for their own projects."
    : "Your role (Project Lead) can enter the monthly Forecast, Milestones, Risks and Team for the projects assigned to you (listed on the Lists sheet). Budgets, actual expenditure, commitments and staff costs are entered by Finance & Operations.").height = 30;
  info.addRow([]);
  const head = info.addRow(["Sheet", "Column", "Required", "Format / allowed values", "What to enter"]);
  head.eachCell((c) => { c.font = { name: "Helvetica Neue", bold: true, color: { argb: "FFFFFFFF" } }; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: INK } }; });
  for (const s of sheets) {
    const d = info.addRow([s.sheet, `Matched by: ${s.matchedBy}`, "", "", s.description]);
    d.eachCell((c) => { c.font = { name: "Helvetica Neue", bold: true, color: { argb: INK } }; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COOL } }; c.alignment = { wrapText: true, vertical: "top" }; });
    for (const f of s.fields) {
      const r = info.addRow(["", f.header, f.required ? "Yes" : "", formatHint(f), f.help]);
      r.eachCell((c) => { c.font = { name: "Helvetica Neue", color: { argb: INK } }; c.alignment = { wrapText: true, vertical: "top" }; });
    }
  }

  // ---- Lists (reference values for drop-downs) ------------------------------
  const lists = wb.addWorksheet("Lists");
  const listCols: { title: string; sub: string; values: [string, string][] }[] = [
    { title: "Project code", sub: "Project name", values: options.projects.map((p) => [p.code, p.name]) },
  ];
  if (admin) {
    listCols.push(
      { title: "Lab code", sub: "Lab name", values: options.labs.map((l) => [l.code, l.name]) },
      { title: "PI email", sub: "PI name", values: options.pis.map((p) => [p.email, p.name]) },
      { title: "Project lead email", sub: "Project lead name", values: options.leads.map((p) => [p.email, p.name]) });
  }
  const listRange: Record<string, string> = {};
  listCols.forEach((lc, i) => {
    const c = i * 3 + 1;
    lists.getColumn(c).width = 34; lists.getColumn(c + 1).width = 44; lists.getColumn(c + 2).width = 3;
    for (const [j, t] of [lc.title, lc.sub].entries()) {
      const h = lists.getCell(1, c + j);
      h.value = t; h.font = { name: "Helvetica Neue", bold: true, color: { argb: "FFFFFFFF" } }; h.fill = { type: "pattern", pattern: "solid", fgColor: { argb: INK } };
    }
    lc.values.forEach(([a, b], r) => { lists.getCell(r + 2, c).value = a; lists.getCell(r + 2, c + 1).value = b; });
    if (lc.values.length) listRange[lc.title] = `Lists!$${colLetter(c)}$2:$${colLetter(c)}$${lc.values.length + 1}`;
  });
  lists.views = [{ state: "frozen", ySplit: 1 }];

  // ---- One data sheet per entity -------------------------------------------
  for (const s of sheets) await addDataSheet(wb, q, s, listRange, withData);

  wb.views = [{ x: 0, y: 0, width: 20000, height: 12000, firstSheet: 0, activeTab: 0, visibility: "visible" }];
  return Buffer.from(await wb.xlsx.writeBuffer());
}

async function addDataSheet(wb: ExcelJS.Workbook, q: Queryable, s: SheetSpec, listRange: Record<string, string>, withData: boolean) {
  const ws = wb.addWorksheet(s.sheet, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = s.fields.map((f) => ({ width: f.type === "text" ? (["description", "name", "issue"].includes(f.key) ? 44 : 26) : 18 }));
  const header = ws.getRow(1);
  header.height = 22;
  s.fields.forEach((f, i) => {
    const c = header.getCell(i + 1);
    c.value = f.required ? `${f.header} *` : f.header;
    c.font = { name: "Helvetica Neue", bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: INK } };
    c.alignment = { vertical: "middle" };
    c.border = { bottom: { style: "thin", color: { argb: RULE } } };
    c.note = `${f.required ? "Required. " : "Optional. "}${formatHint(f)}. ${f.help}`;

    // Drop-downs and input checks for the data rows.
    const col = colLetter(i + 1);
    const range = `${col}2:${col}${MAX_ROWS}`;
    const listed = f.type === "text" ? listRange[f.header] : undefined;
    const dv = ws as unknown as { dataValidations: { add(range: string, v: ExcelJS.DataValidation): void } };
    if (f.type === "enum") dv.dataValidations.add(range, { type: "list", allowBlank: true, formulae: [`"${(f.options ?? []).map(enumLabel).join(",")}"`], showErrorMessage: true, errorTitle: f.header, error: "Choose a value from the list." });
    else if (f.type === "boolean") dv.dataValidations.add(range, { type: "list", allowBlank: true, formulae: ['"Yes,No"'], showErrorMessage: true, errorTitle: f.header, error: "Choose Yes or No." });
    else if (f.type === "number") dv.dataValidations.add(range, { type: "decimal", operator: "between", allowBlank: true, formulae: [f.min ?? -1e15, f.max ?? 1e15], showErrorMessage: true, errorTitle: f.header, error: `Enter a number${f.min !== undefined ? ` of ${f.min} or more` : ""}${f.max !== undefined ? ` up to ${f.max}` : ""}.` });
    // New project codes may be typed on the Projects sheet, so the list only warns.
    else if (listed) dv.dataValidations.add(range, { type: "list", allowBlank: true, formulae: [`=${listed}`], showErrorMessage: true, errorStyle: "warning", errorTitle: f.header, error: "This value is not on the Lists sheet. Keep it only if it is defined elsewhere in this workbook." });

    if (f.type === "date") ws.getColumn(i + 1).numFmt = "yyyy-mm-dd";
    else if (f.type === "month") ws.getColumn(i + 1).numFmt = "@";
    else if (f.type === "number") ws.getColumn(i + 1).numFmt = "#,##0.00";
  });

  if (withData) {
    const rows = await loadEntryRows(q, s.entity);
    for (const r of rows) ws.addRow(s.fields.map((f) => cellFor(f, r[f.key])));
  }
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: s.fields.length } };
}
