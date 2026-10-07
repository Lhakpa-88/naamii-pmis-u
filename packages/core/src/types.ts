/**
 * Domain types shared by the app, the ingestion functions and the tests.
 * These mirror the database schema (db/migrations) but are independent of
 * any UI or database library — the BUSINESS LOGIC layer speaks in these.
 */

export type Role = "ed" | "pi" | "project_lead" | "admin";

export type ProjectStatus = "planned" | "active" | "on_hold" | "completed" | "closed" | "cancelled";
export type MilestoneStatus = "not_started" | "in_progress" | "completed" | "cancelled";
export type RiskLevel = "low" | "medium" | "high" | "critical";
export type IssueStatus = "open" | "mitigating" | "closed";

/** Traffic-light health used across KPIs, tables and alerts. */
export type Health = "good" | "warning" | "critical" | "unknown";

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  labId: string | null;
}

export interface ProjectSummary {
  id: string;
  code: string;
  name: string;
  status: ProjectStatus;
  projectType: string | null;
  funder: string | null;
  currency: string;
  totalBudget: number;
  startDate: string | null; // ISO date
  endDate: string | null;   // ISO date
  labId: string;
  labCode: string;
  labName: string;
  piId: string | null;
  piName: string | null;
  projectLeadId: string | null;
  projectLeadName: string | null;
}

/** Stored facts for a project, aggregated to date. Never mix these four. */
export interface FinancialTotals {
  budget: number;      // approved / total budget
  actual: number;      // cumulative actual expenditure to date
  committed: number;   // open commitments not yet spent
  forecast: number;    // total forecast at completion (phased forecast summed over life)
  forecastToDate: number; // forecast for periods up to and including the current period
}

export interface MonthlyFinancial {
  period: string;      // ISO date, first day of month
  fiscalYear: string | null;
  budget: number;
  actual: number;
  committed: number;
  forecast: number;
}

export interface Milestone {
  id: string;
  name: string;
  dueDate: string | null;
  completionDate: string | null;
  status: MilestoneStatus;
  isDeliverable: boolean;
}

export interface Risk {
  id: string;
  issue: string;
  riskLevel: RiskLevel;
  owner: string | null;
  dueDate: string | null;
  status: IssueStatus;
}

export interface Alert {
  severity: "info" | "warning" | "critical";
  code: string;
  message: string;
}

export interface ProjectHealth {
  financial: Health;
  schedule: Health;
  deliverables: Health;
  risk: Health;
  overall: Health;
}
