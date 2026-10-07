import Link from "next/link";
import { groupBy, sumBy, utilizationPct } from "@naamii/core";
import { formatMoney, formatPct, labelFor } from "@/lib/format";
import { aggregateByLab, type LabRow, type ProjectRow, type TrendPoint } from "@/lib/data/portfolio";
import { BudgetVsActualBars } from "./charts/budget-vs-actual-bars";
import { MonthlyTrend } from "./charts/monthly-trend";
import { SingleMeasureBars } from "./charts/single-measure-bars";
import { PortfolioTable, type PortfolioRowDto } from "./portfolio-table";
import { HealthBadge } from "./ui/badges";
import { Card, CardBody, CardHeader } from "./ui/card";
import { KpiCard } from "./ui/kpi-card";
import { EmptyState } from "./ui/page-header";

export function toTableRows(projects: ProjectRow[]): PortfolioRowDto[] {
  return projects.map((p) => ({
    id: p.summary.id, code: p.summary.code, name: p.summary.name, labId: p.summary.labId, labName: p.summary.labName,
    piName: p.summary.piName, leadName: p.summary.projectLeadName, funder: p.summary.funder, currency: p.summary.currency,
    budget: p.totals.budget, actual: p.totals.actual, utilization: p.utilization, startDate: p.summary.startDate,
    endDate: p.summary.endDate, status: p.summary.status, health: p.health.overall, atRisk: p.atRisk,
  }));
}

/**
 * The portfolio view used by the Executive Overview (whole organisation) and
 * by a lab page (one lab). What it shows is decided entirely by the rows the
 * database returned for this user — never by a flag in the UI.
 */
export function PortfolioOverview({ projects, labs, trend, currentPeriod, scope }: {
  projects: ProjectRow[]; labs: LabRow[]; trend: TrendPoint[]; currentPeriod: string; scope: "organisation" | "lab";
}) {
  if (projects.length === 0) {
    return <EmptyState title="No projects to show" body="No projects are visible for your role yet. If you expected to see some, ask Finance & Operations to check your project or lab assignment." />;
  }

  const active = projects.filter((p) => p.summary.status === "active");
  const budget = sumBy(projects, (p) => p.totals.budget);
  const actual = sumBy(projects, (p) => p.totals.actual);
  const committed = sumBy(projects, (p) => p.totals.committed);
  const util = utilizationPct(actual, budget);
  const atRisk = projects.filter((p) => p.atRisk);
  const currency = projects[0].summary.currency;
  const mixedCurrency = projects.some((p) => p.summary.currency !== currency);

  const labAgg = aggregateByLab(labs, projects).filter((l) => l.projects > 0);
  const byLabData = labAgg.map((l) => ({ name: l.name.replace(/^DEMO · /, ""), budget: l.budget, actual: l.actual }));
  const byProjectData = projects.map((p) => ({ name: p.summary.name.replace(/^Project /, "").split(" — ")[0], budget: p.totals.budget, actual: p.totals.actual }));
  const statusCounts = Array.from(groupBy(projects, (p) => p.summary.status).entries()).map(([s, ps]) => ({ name: labelFor(s), value: ps.length }));
  const trendData = trend.map((t) => ({ period: t.period, budget: t.budget, forecast: t.forecast, actual: t.period <= currentPeriod ? t.actual : null }));

  return (
    <div className="flex flex-col gap-5">
      {/* KPI row — portfolio health in one glance */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <KpiCard label="Active projects" value={String(active.length)} sub={`${projects.length} in total${scope === "organisation" ? ` · ${labAgg.length} labs` : ""}`} />
        <KpiCard label={scope === "organisation" ? "Portfolio budget" : "Lab budget"} value={formatMoney(budget, currency, { compact: true })} sub={mixedCurrency ? "Mixed currencies — see table" : "Approved budgets"} />
        <KpiCard label="Total expenditure" value={formatMoney(actual, currency, { compact: true })} sub={`Committed ${formatMoney(committed, currency, { compact: true, withCode: false })}`} />
        <KpiCard label="Overall utilisation" value={formatPct(util)} sub="Actual ÷ approved budget" emphasis={util !== null && util >= 100 ? "critical" : util !== null && util >= 85 ? "warning" : undefined} />
        <KpiCard label="Projects at risk" value={String(atRisk.length)} sub={atRisk.length ? atRisk.map((p) => p.summary.name.split(" — ")[0]).join(", ") : "None flagged"} emphasis={atRisk.length ? "critical" : undefined} />
      </div>

      {/* Portfolio overview charts */}
      <div className="grid gap-5 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader title={scope === "organisation" ? "Budget vs actual by lab" : "Budget vs actual by project"} subtitle={`${currency}, cumulative to date`} />
          <CardBody><BudgetVsActualBars data={scope === "organisation" ? byLabData : byProjectData} currency={currency} /></CardBody>
        </Card>
        <div className="flex flex-col gap-5 lg:col-span-2">
          {scope === "organisation" ? (
            <Card>
              <CardHeader title="Projects by lab" />
              <CardBody><SingleMeasureBars data={labAgg.map((l) => ({ name: l.name.replace(/^DEMO · /, ""), value: l.projects }))} /></CardBody>
            </Card>
          ) : null}
          <Card>
            <CardHeader title="Project status" />
            <CardBody><SingleMeasureBars data={statusCounts} /></CardBody>
          </Card>
        </div>
      </div>

      {/* Financial overview */}
      <div className="grid gap-5 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader title="Monthly budget vs actual" subtitle="Actual to the last closed month; forecast shown dashed beyond it" />
          <CardBody><MonthlyTrend data={trendData} currency={currency} currentPeriod={currentPeriod} /></CardBody>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Projects requiring attention" subtitle="Generated from the health rules — not hand-maintained" />
          <CardBody className="flex flex-col gap-3">
            {atRisk.length === 0 ? <p className="text-[13px] text-grey">No project currently meets an at-risk rule.</p> : atRisk.map((p) => (
              <div key={p.summary.id} className="rounded-md border border-cool-200 p-3">
                <div className="flex items-center justify-between gap-2">
                  <Link href={`/projects/${p.summary.id}`} className="text-[13.5px] font-semibold text-ink hover:underline">{p.summary.name.split(" — ")[0]}</Link>
                  <HealthBadge health={p.health.overall} />
                </div>
                <p className="mt-0.5 text-[12px] text-grey">{p.summary.labName.replace(/^DEMO · /, "")} · {formatPct(p.utilization)} utilised</p>
                <ul className="mt-1.5 flex flex-col gap-0.5 text-[12.5px] text-ink">
                  {p.alerts.slice(0, 3).map((a) => <li key={a.code} className="flex gap-1.5"><span aria-hidden className={a.severity === "critical" ? "text-critical" : a.severity === "warning" ? "text-warning" : "text-grey"}>•</span>{a.message}</li>)}
                </ul>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>

      {/* Lab roll-up (organisation only) */}
      {scope === "organisation" && labAgg.length > 0 ? (
        <Card>
          <CardHeader title="Labs" subtitle="Click a lab to drill down" />
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="bg-cool-100 text-[11.5px] uppercase tracking-wide text-grey">
                <tr>
                  <th className="px-5 py-2 text-left font-semibold">Lab</th>
                  <th className="px-3 py-2 text-left font-semibold">Principal Investigator</th>
                  <th className="px-3 py-2 text-right font-semibold">Projects</th>
                  <th className="px-3 py-2 text-right font-semibold">Budget</th>
                  <th className="px-3 py-2 text-right font-semibold">Actual</th>
                  <th className="px-3 py-2 text-right font-semibold">Utilisation</th>
                  <th className="px-3 py-2 text-right font-semibold">At risk</th>
                </tr>
              </thead>
              <tbody>
                {labAgg.map((l) => (
                  <tr key={l.id} className="border-t border-cool-200 hover:bg-cool-100/60">
                    <td className="px-5 py-2.5"><Link href={`/labs/${l.id}`} className="font-medium text-ink hover:underline">{l.name}</Link><div className="text-[11.5px] text-grey">{l.code}</div></td>
                    <td className="px-3 py-2.5">{l.piName ?? "—"}</td>
                    <td className="tnum px-3 py-2.5 text-right">{l.activeProjects} active / {l.projects}</td>
                    <td className="tnum px-3 py-2.5 text-right">{formatMoney(l.budget, currency, { compact: true })}</td>
                    <td className="tnum px-3 py-2.5 text-right">{formatMoney(l.actual, currency, { compact: true })}</td>
                    <td className="tnum px-3 py-2.5 text-right">{formatPct(l.utilization)}</td>
                    <td className={`tnum px-3 py-2.5 text-right font-semibold ${l.atRisk ? "text-critical" : "text-grey"}`}>{l.atRisk}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {/* Project portfolio table */}
      <Card>
        <CardHeader title={scope === "organisation" ? "Project portfolio" : "Projects"} subtitle="Sort any column; filters only offer what you are entitled to see" />
        <PortfolioTable rows={toTableRows(projects)} showLab={scope === "organisation"} />
      </Card>
    </div>
  );
}
