import { notFound } from "next/navigation";
import { isMilestoneOverdue, remainingBudget, uncommittedBudget, forecastVariance, type Health } from "@naamii/core";
import { requireUser } from "@/lib/auth/current-user";
import { withUser } from "@/lib/db";
import { loadProjectDetail } from "@/lib/data/portfolio";
import { trendWindow } from "@/lib/data/window";
import { formatDate, formatDays, formatMoney, formatPct, labelFor } from "@/lib/format";
import { MonthlyTrend } from "@/components/charts/monthly-trend";
import { HealthBadge, RiskBadge, StatusBadge } from "@/components/ui/badges";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { KpiCard } from "@/components/ui/kpi-card";
import { PageHeader } from "@/components/ui/page-header";

export default async function ProjectPage({ params }: PageProps<"/projects/[projectId]">) {
  const { projectId } = await params;
  const user = await requireUser();
  const today = new Date();
  const win = trendWindow(today);

  // RLS: a project the user may not see simply does not come back → 404.
  const p = await withUser(user.id, (q) => loadProjectDetail(q, projectId, today));
  if (!p) notFound();

  const s = p.summary, t = p.totals, cur = s.currency;
  const remaining = remainingBudget(t.budget, t.actual);
  const uncommitted = uncommittedBudget(t.budget, t.actual, t.committed);
  const fcVar = forecastVariance(t.forecast, t.budget);
  const trend = p.monthly.filter((m) => m.period >= win.from && m.period <= win.to).map((m) => ({ period: m.period, budget: m.budget, forecast: m.forecast, actual: m.period <= win.currentPeriod ? m.actual : null }));
  const orgWide = user.role === "ed" || user.role === "admin";
  const crumbs = orgWide
    ? [{ label: "NAAMII", href: "/" }, { label: s.labName, href: `/labs/${s.labId}` }, { label: s.name.split(" — ")[0] }]
    : user.role === "pi"
      ? [{ label: "My Lab", href: "/" }, { label: s.name.split(" — ")[0] }]
      : [{ label: "My Projects", href: "/projects" }, { label: s.name.split(" — ")[0] }];

  const dims: { label: string; health: Health; note: string }[] = [
    { label: "Financial", health: p.health.financial, note: `${formatPct(p.utilization)} utilised` },
    { label: "Schedule", health: p.health.schedule, note: formatDays(p.daysRemaining) },
    { label: "Deliverables", health: p.health.deliverables, note: `${p.milestones.filter((m) => isMilestoneOverdue(m, today)).length} overdue of ${p.milestones.length}` },
    { label: "Risk", health: p.health.risk, note: `${p.risks.filter((r) => r.status !== "closed").length} open` },
  ];

  return (
    <>
      <PageHeader
        title={s.name}
        crumbs={crumbs}
        subtitle={
          <dl className="mt-1 flex flex-wrap gap-x-6 gap-y-1 text-[12.5px]">
            <div><dt className="inline text-grey">Code </dt><dd className="inline font-medium text-ink">{s.code}</dd></div>
            <div><dt className="inline text-grey">Funder </dt><dd className="inline text-ink">{s.funder ?? "—"}</dd></div>
            <div><dt className="inline text-grey">Project lead </dt><dd className="inline text-ink">{s.projectLeadName ?? "—"}</dd></div>
            <div><dt className="inline text-grey">PI </dt><dd className="inline text-ink">{s.piName ?? "—"}</dd></div>
            <div><dt className="inline text-grey">Period </dt><dd className="tnum inline text-ink">{formatDate(s.startDate)} – {formatDate(s.endDate)}</dd></div>
            <div><dt className="inline text-grey">Status </dt><dd className="inline"><StatusBadge status={s.status} /></dd></div>
          </dl>
        }
        actions={<HealthBadge health={p.health.overall} />}
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="Total budget" value={formatMoney(t.budget, cur, { compact: true })} sub={`Approved · ${cur}`} />
        <KpiCard label="Actual expenditure" value={formatMoney(t.actual, cur, { compact: true })} sub="To last closed month" />
        <KpiCard label="Committed" value={formatMoney(t.committed, cur, { compact: true })} sub="Open commitments" />
        <KpiCard label="Remaining" value={formatMoney(remaining, cur, { compact: true })} sub={`Uncommitted ${formatMoney(uncommitted, cur, { compact: true, withCode: false })}`} emphasis={remaining < 0 ? "critical" : undefined} />
        <KpiCard label="Utilisation" value={formatPct(p.utilization)} sub="Actual ÷ budget" health={p.health.financial} emphasis={p.utilization !== null && p.utilization >= 100 ? "critical" : p.utilization !== null && p.utilization >= 85 ? "warning" : undefined} />
        <KpiCard label="Days remaining" value={p.daysRemaining === null ? "—" : String(p.daysRemaining)} sub={formatDays(p.daysRemaining)} health={p.health.schedule} emphasis={p.daysRemaining !== null && p.daysRemaining < 0 ? "critical" : undefined} />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader title="Budget vs actual by month" subtitle={`${cur} · forecast variance at completion ${fcVar >= 0 ? "+" : "−"}${formatMoney(Math.abs(fcVar), cur, { compact: true, withCode: false })}`} />
          <CardBody><MonthlyTrend data={trend} currency={cur} currentPeriod={win.currentPeriod} /></CardBody>
        </Card>
        <div className="flex flex-col gap-5 lg:col-span-2">
          <Card>
            <CardHeader title="Project health" subtitle="Rule-based traffic lights" />
            <CardBody>
              <ul className="grid grid-cols-2 gap-3">
                {dims.map((d) => (
                  <li key={d.label} className="rounded-md border border-cool-200 p-3">
                    <p className="text-[12px] font-medium uppercase tracking-wide text-grey">{d.label}</p>
                    <div className="mt-1.5"><HealthBadge health={d.health} /></div>
                    <p className="mt-1 text-[12px] text-grey">{d.note}</p>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Alerts" subtitle="Generated from the data" />
            <CardBody>
              {p.alerts.length === 0 ? <p className="text-[13px] text-grey">No alerts — the project meets all rules.</p> : (
                <ul className="flex flex-col gap-2 text-[13px]">
                  {p.alerts.map((a) => (
                    <li key={a.code} className="flex gap-2">
                      <span aria-hidden className={`mt-0.5 ${a.severity === "critical" ? "text-critical" : a.severity === "warning" ? "text-warning" : "text-grey"}`}>{a.severity === "critical" ? "■" : a.severity === "warning" ? "▲" : "●"}</span>
                      <span className="text-ink">{a.message}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Milestones & deliverables" subtitle="Overdue items are highlighted" />
          <table className="w-full text-[13px]">
            <thead className="bg-cool-100 text-[11.5px] uppercase tracking-wide text-grey">
              <tr><th className="px-5 py-2 text-left font-semibold">Milestone</th><th className="px-3 py-2 text-left font-semibold">Due</th><th className="px-3 py-2 text-left font-semibold">Completed</th><th className="px-3 py-2 text-left font-semibold">Status</th></tr>
            </thead>
            <tbody>
              {p.milestones.map((m) => {
                const overdue = isMilestoneOverdue(m, today);
                return (
                  <tr key={m.id} className={`border-t border-cool-200 ${overdue ? "bg-[#fff6e5]" : ""}`}>
                    <td className="px-5 py-2"><span className="font-medium text-ink">{m.name}</span>{m.isDeliverable ? <span className="ml-2 rounded bg-cool-100 px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-grey">Deliverable</span> : null}</td>
                    <td className={`tnum whitespace-nowrap px-3 py-2 ${overdue ? "font-semibold text-critical" : ""}`}>{formatDate(m.dueDate)}</td>
                    <td className="tnum whitespace-nowrap px-3 py-2">{formatDate(m.completionDate)}</td>
                    <td className="px-3 py-2">{overdue ? <span className="font-semibold text-critical">Overdue</span> : labelFor(m.status)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader title="Risks & issues" />
            <table className="w-full text-[13px]">
              <thead className="bg-cool-100 text-[11.5px] uppercase tracking-wide text-grey">
                <tr><th className="px-5 py-2 text-left font-semibold">Issue</th><th className="px-3 py-2 text-left font-semibold">Level</th><th className="px-3 py-2 text-left font-semibold">Owner</th><th className="px-3 py-2 text-left font-semibold">Status</th></tr>
              </thead>
              <tbody>
                {p.risks.length === 0 ? <tr><td colSpan={4} className="px-5 py-4 text-grey">No risks recorded.</td></tr> : p.risks.map((r) => (
                  <tr key={r.id} className="border-t border-cool-200">
                    <td className="px-5 py-2 text-ink">{r.issue}</td>
                    <td className="px-3 py-2"><RiskBadge level={r.riskLevel} /></td>
                    <td className="px-3 py-2 text-grey">{r.owner ?? "—"}</td>
                    <td className="px-3 py-2">{labelFor(r.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <Card>
            <CardHeader title="Project team" subtitle={p.team.some((m) => m.compensationVisible) ? "Compensation visible to Admin and the Executive Director" : "Compensation is restricted for your role"} />
            <table className="w-full text-[13px]">
              <thead className="bg-cool-100 text-[11.5px] uppercase tracking-wide text-grey">
                <tr><th className="px-5 py-2 text-left font-semibold">Name</th><th className="px-3 py-2 text-left font-semibold">Role</th><th className="px-3 py-2 text-right font-semibold">Allocation</th><th className="px-3 py-2 text-right font-semibold">Monthly cost</th></tr>
              </thead>
              <tbody>
                {p.team.map((m) => (
                  <tr key={m.id} className="border-t border-cool-200">
                    <td className="px-5 py-2 text-ink">{m.personName}</td>
                    <td className="px-3 py-2 text-grey">{m.roleTitle ?? "—"}</td>
                    <td className="tnum px-3 py-2 text-right">{m.allocationPct === null ? "—" : `${m.allocationPct}%`}</td>
                    <td className="tnum px-3 py-2 text-right">{m.compensationVisible ? formatMoney(m.monthlyCost, m.currency ?? cur) : <span className="text-cool" title="Restricted">•••••</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      </div>

      <p className="mt-5 text-[11.5px] text-grey">Source: {p.summary.code} · figures derived from the project workbook as imported; this view does not alter source records.</p>
    </>
  );
}
