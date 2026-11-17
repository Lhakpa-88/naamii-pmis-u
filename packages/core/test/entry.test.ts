import { describe, expect, it } from "vitest";
import {
  canEnterData, canEnterEntity, entrySheetsFor, parseDateValue, parseField, parseMonthValue,
  parseNumberValue, parseRecord, sheetFor,
} from "../src/index.js";

describe("who may enter what", () => {
  it("lets Finance & Operations enter every sheet", () => {
    expect(entrySheetsFor("admin").map((s) => s.entity)).toEqual(["projects", "financials", "milestones", "risks", "team"]);
  });

  it("limits the Project Lead to the forecast, milestones, risks and team — without budgets, actuals or compensation", () => {
    const sheets = entrySheetsFor("project_lead");
    expect(sheets.map((s) => s.entity)).toEqual(["financials", "milestones", "risks", "team"]);
    expect(sheets.find((s) => s.entity === "financials")!.fields.map((f) => f.key)).toEqual(["project_code", "month", "forecast"]);
    expect(sheets.find((s) => s.entity === "team")!.fields.map((f) => f.key)).not.toContain("monthly_cost");
    expect(canEnterEntity("project_lead", "financials")).toBe(true);
    expect(canEnterEntity("project_lead", "projects")).toBe(false);
  });

  it("keeps the Executive Director and PIs read-only", () => {
    expect(canEnterData("ed")).toBe(false);
    expect(canEnterData("pi")).toBe(false);
    expect(entrySheetsFor("pi")).toEqual([]);
  });
});

describe("value parsing", () => {
  it("reads dates from Excel dates, serial numbers and ISO text", () => {
    expect(parseDateValue(new Date(Date.UTC(2026, 6, 15)))).toBe("2026-07-15");
    expect(parseDateValue(46218)).toBe("2026-07-15");
    expect(parseDateValue("2026-07-15")).toBe("2026-07-15");
    expect(parseDateValue("2026-02-30")).toBeNull();
    expect(parseDateValue("15/07/2026")).toBeNull(); // ambiguous day/month order is rejected, not guessed
  });

  it("reads months as the first day of the month", () => {
    expect(parseMonthValue("2026-07")).toBe("2026-07-01");
    expect(parseMonthValue("Jul 2026")).toBe("2026-07-01");
    expect(parseMonthValue(new Date(Date.UTC(2026, 6, 20)))).toBe("2026-07-01");
    expect(parseMonthValue("sometime")).toBeNull();
  });

  it("reads numbers with thousands separators and rejects text", () => {
    expect(parseNumberValue("1,25,000.50")).toBe(125000.5);
    expect(parseNumberValue(42)).toBe(42);
    expect(parseNumberValue("12 lakh")).toBeNull();
  });

  it("matches enum values by label or key, ignoring case", () => {
    const status = sheetFor("milestones").fields.find((f) => f.key === "status")!;
    expect(parseField(status, "In progress").value).toBe("in_progress");
    expect(parseField(status, "IN_PROGRESS").value).toBe("in_progress");
    expect(parseField(status, "done").error?.code).toBe("INVALID_VALUE");
  });
});

describe("record validation", () => {
  it("accepts a complete milestone row", () => {
    const r = parseRecord(sheetFor("milestones"), { project_code: "P-1", name: "Report", due_date: "2026-09-30", status: "Not started", is_deliverable: "Yes" });
    expect(r.errors).toEqual([]);
    expect(r.values).toMatchObject({ project_code: "P-1", name: "Report", due_date: "2026-09-30", status: "not_started", is_deliverable: true, completion_date: null });
  });

  it("reports every problem in a row, not just the first", () => {
    const r = parseRecord(sheetFor("projects"), { code: "", name: "X", lab_code: "L", total_budget: "abc", start_date: "2026-05-01", end_date: "2026-01-01", currency: "rupees" });
    expect(r.errors.map((e) => e.code).sort()).toEqual(["INVALID_NUMBER", "INVALID_RANGE", "INVALID_VALUE", "MISSING_REQUIRED"]);
  });

  it("enforces ranges", () => {
    const r = parseRecord(sheetFor("team"), { project_code: "P-1", person_name: "A", allocation_pct: 140 });
    expect(r.errors[0].code).toBe("OUT_OF_RANGE");
  });
});
