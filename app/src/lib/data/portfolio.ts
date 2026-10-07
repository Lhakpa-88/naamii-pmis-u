import "server-only";
import {
  aggregateTotals, daysRemaining, groupBy, isAtRisk, monthStart, projectAlerts, projectHealth,
  sumBy, utilizationPct,
  type Alert, type FinancialTotals, type Milestone, type MonthlyFinancial, type ProjectHealth,
  type ProjectStatus, type ProjectSummary, type Risk,
} from "@naamii/core";
import type { Queryable } from "../db";

/**
 * DATA ACCESS LAYER — reads facts under the caller's Row Level Security and
 * hands them to @naamii/core for every derived figure. No business rules here.
 */

export interface ProjectRow {
  summary: ProjectSummary;
  totals: FinancialTotals;
  utilization: number | null;
  daysRemaining: number | null;
  health: ProjectHealth;
  atRisk: boolean;
  alerts: Alert[];
  overdueMilestones: number;
}

export interface LabRow {
  id: string;
  code: string;
  name: string;
  piName: string | null;
}

export interface LabAggregate extends LabRow {
  projects: number;
  activeProjects: number;
  budget: number;
  actual: number;
  committed: number;
  utilization: number | null;
  atRisk: number;
}

export interface Freshness {
  lastSuccessfulSync: string | null; // ISO timestamp
  lastRunStatus: string | null;
  lastRunAt: string | null;
}

interface ProjectQueryRow {
  id: string; code: string; name: string; status: ProjectStatus; project_type: string | null; funder: string | null;
  currency: string; total_budget: number; start_date: string | null; end_date: string | null;
  lab_id: string; lab_code: string; lab_name: string; pi_id: string | null; pi_name: string | null;
  project_lead_id: string | null; project_lead_name: string | null;
  actual: number; committed: number; forecast: number; forecast_to_date: number;
}

interface MilestoneRow { id: string; project_id: string; name: string; due_date: string | null; completion_date: string | null; status: Milestone["status"]; is_deliverable: boolean }
interface RiskRow { id: string; project_id: string; issue: string; risk_level: Risk["riskLevel"]; owner: string | null; due_date: string | null; status: Risk["status"] }

const PROJECT_SQL = `
  SELECT p.id, p.code, p.name, p.status, p.project_type, p.funder, p.currency, p.total_budget,
         p.start_date, p.end_date, p.lab_id, p.lab_code, p.lab_name, p.pi_id, p.pi_name,
         p.project_lead_id, p.project_lead_name,
         COALESCE(f.actual, 0)   AS actual,
         COALESCE(f.committed, 0) AS committed,
         COALESCE(f.forecast, 0) AS forecast,
         COALESCE(f.forecast_to_date, 0) AS forecast_to_date
  FROM projects_v p
  LEFT JOIN LATERAL (
    SELECT sum(actual_expenditure) AS actual,
           sum(committed_amount)   AS committed,
           sum(forecast)           AS forecast,
           sum(forecast) FILTER (WHERE financial_period <= $1::date) AS forecast_to_date
    FROM project_financials pf WHERE pf.project_id = p.id
  ) f ON true`;

function toSummary(r: ProjectQueryRow): ProjectSummary {
  return {
    id: r.id, code: r.code, name: r.name, status: r.status, projectType: r.project_type, funder: r.funder,
    currency: r.currency, totalBudget: r.total_budget, startDate: r.start_date, endDate: r.end_date,
    labId: r.lab_id, labCode: r.lab_code, labName: r.lab_name, piId: r.pi_id, piName: r.pi_name,
    projectLeadId: r.project_lead_id, projectLeadName: r.project_lead_name,
  };
}

function toMilestone(m: MilestoneRow): Milestone {
  return { id: m.id, name: m.name, dueDate: m.due_date, completionDate: m.completion_date, status: m.status, isDeliverable: m.is_deliverable };
}
function toRisk(r: RiskRow): Risk {
  return { id: r.id, issue: r.issue, riskLevel: r.risk_level, owner: r.owner, dueDate: r.due_date, status: r.status };
}

/** All projects the caller may see (RLS), with totals, health and alerts computed centrally. */
export async function loadProjects(q: Queryable, today: Date, filter: { labId?: string; projectId?: string } = {}): Promise<ProjectRow[]> {
  const asOf = monthStart(today);
  const where: string[] = [];
  const params: unknown[] = [asOf];
  if (filter.labId) { params.push(filter.labId); where.push(`p.lab_id = $${params.length}`); }
  if (filter.projectId) { params.push(filter.projectId); where.push(`p.id = $${params.length}`); }
  const sql = `${PROJECT_SQL} ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY p.lab_name, p.name`;
  const { rows } = await q.query<ProjectQueryRow>(sql, params);
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  // Sequential on purpose: one transaction-bound client cannot run queries concurrently.
  const ms = await q.query<MilestoneRow>(`SELECT id, project_id, name, due_date, completion_date, status, is_deliverable FROM project_milestones WHERE project_id = ANY($1::uuid[]) ORDER BY due_date NULLS LAST`, [ids]);
  const rs = await q.query<RiskRow>(`SELECT id, project_id, issue, risk_level, owner, due_date, status FROM project_risks WHERE project_id = ANY($1::uuid[])`, [ids]);
  const msBy = groupBy(ms.rows, (m) => m.project_id);
  const rsBy = groupBy(rs.rows, (r) => r.project_id);

  return rows.map((r) => {
    const summary = toSummary(r);
    const totals: FinancialTotals = { budget: r.total_budget, actual: r.actual, committed: r.committed, forecast: r.forecast, forecastToDate: r.forecast_to_date };
    const milestones = (msBy.get(r.id) ?? []).map(toMilestone);
    const risks = (rsBy.get(r.id) ?? []).map(toRisk);
    const input = { status: summary.status, startDate: summary.startDate, endDate: summary.endDate, totals, milestones, risks };
    const health = projectHealth(input, today);
    const alerts = projectAlerts(input, today);
    return {
      summary, totals,
      utilization: utilizationPct(totals.actual, totals.budget),
      daysRemaining: daysRemaining(summary.endDate, today),
      health, atRisk: isAtRisk(health), alerts,
      overdueMilestones: alerts.find((a) => a.code === "MILESTONES_OVERDUE") ? milestones.filter((m) => m.dueDate && m.dueDate < asOf && m.status !== "completed" && m.status !== "cancelled").length : 0,
    };
  });
}

export async function loadLabs(q: Queryable): Promise<LabRow[]> {
  const { rows } = await q.query<{ id: string; code: string; name: string; pi_name: string | null }>(
    `SELECT l.id, l.code, l.name, u.name AS pi_name FROM labs l LEFT JOIN users u ON u.id = l.pi_user_id WHERE l.active ORDER BY l.name`
  );
  return rows.map((r) => ({ id: r.id, code: r.code, name: r.name, piName: r.pi_name }));
}

/** Roll projects up to labs (presentation grouping; sums come from core helpers). */
export function aggregateByLab(labs: LabRow[], projects: ProjectRow[]): LabAggregate[] {
  const byLab = groupBy(projects, (p) => p.summary.labId);
  return labs.map((lab) => {
    const ps = byLab.get(lab.id) ?? [];
    const budget = sumBy(ps, (p) => p.totals.budget);
    const actual = sumBy(ps, (p) => p.totals.actual);
    return {
      ...lab,
      projects: ps.length,
      activeProjects: ps.filter((p) => p.summary.status === "active").length,
      budget, actual,
      committed: sumBy(ps, (p) => p.totals.committed),
      utilization: utilizationPct(actual, budget),
      atRisk: ps.filter((p) => p.atRisk).length,
    };
  });
}

export interface TrendPoint { period: string; budget: number; actual: number; committed: number; forecast: number }

/** Monthly budget / actual / forecast across the caller's visible projects. */
export async function loadMonthlyTrend(q: Queryable, opts: { from: string; to: string; labId?: string; projectId?: string }): Promise<TrendPoint[]> {
  const params: unknown[] = [opts.from, opts.to];
  const where = ["f.financial_period BETWEEN $1::date AND $2::date"];
  if (opts.labId) { params.push(opts.labId); where.push(`p.lab_id = $${params.length}`); }
  if (opts.projectId) { params.push(opts.projectId); where.push(`p.id = $${params.length}`); }
  const { rows } = await q.query<{ period: string; budget: number; actual: number; committed: number; forecast: number }>(
    `SELECT f.financial_period AS period, sum(f.budget) AS budget, sum(f.actual_expenditure) AS actual,
            sum(f.committed_amount) AS committed, sum(f.forecast) AS forecast
     FROM project_financials f JOIN projects p ON p.id = f.project_id
     WHERE ${where.join(" AND ")} GROUP BY 1 ORDER BY 1`, params);
  return rows;
}

export async function loadFreshness(q: Queryable): Promise<Freshness> {
  const { rows } = await q.query<{ last_successful_sync: Date | null; last_run_status: string | null; last_run_at: Date | null }>("SELECT * FROM app.data_freshness()");
  const r = rows[0];
  return {
    lastSuccessfulSync: r?.last_successful_sync ? new Date(r.last_successful_sync).toISOString() : null,
    lastRunStatus: r?.last_run_status ?? null,
    lastRunAt: r?.last_run_at ? new Date(r.last_run_at).toISOString() : null,
  };
}

/** Full detail for one project (null when it does not exist OR is not visible — deliberately indistinguishable). */
export async function loadProjectDetail(q: Queryable, projectId: string, today: Date) {
  const [row] = await loadProjects(q, today, { projectId });
  if (!row) return null;
  const fin = await q.query<{ period: string; fiscal_year: string | null; budget: number; actual: number; committed: number; forecast: number }>(
    `SELECT financial_period AS period, fiscal_year, budget, actual_expenditure AS actual, committed_amount AS committed, forecast
     FROM project_financials WHERE project_id = $1 ORDER BY financial_period`, [projectId]);
  const ms = await q.query<MilestoneRow>(`SELECT id, project_id, name, due_date, completion_date, status, is_deliverable FROM project_milestones WHERE project_id = $1 ORDER BY due_date NULLS LAST, name`, [projectId]);
  const rs = await q.query<RiskRow>(`SELECT id, project_id, issue, risk_level, owner, due_date, status FROM project_risks WHERE project_id = $1 ORDER BY status, risk_level DESC`, [projectId]);
  const team = await q.query<{ id: string; person_name: string; role_title: string | null; allocation_pct: number | null; monthly_cost: number | null; compensation_currency: string | null; compensation_visible: boolean }>(
    `SELECT id, person_name, role_title, allocation_pct, monthly_cost, compensation_currency, compensation_visible FROM project_team_members_v WHERE project_id = $1 ORDER BY person_name`, [projectId]);
  const monthly: MonthlyFinancial[] = fin.rows.map((f) => ({ period: f.period, fiscalYear: f.fiscal_year, budget: f.budget, actual: f.actual, committed: f.committed, forecast: f.forecast }));
  // Re-derive totals from the monthly rows so the detail page and the portfolio agree by construction.
  const totals = aggregateTotals(monthly, row.summary.totalBudget, monthStart(today));
  return {
    ...row,
    totals,
    monthly,
    milestones: ms.rows.map(toMilestone),
    risks: rs.rows.map(toRisk),
    team: team.rows.map((t) => ({ id: t.id, personName: t.person_name, roleTitle: t.role_title, allocationPct: t.allocation_pct, monthlyCost: t.monthly_cost, currency: t.compensation_currency, compensationVisible: t.compensation_visible })),
  };
}

export type ProjectDetail = NonNullable<Awaited<ReturnType<typeof loadProjectDetail>>>;
