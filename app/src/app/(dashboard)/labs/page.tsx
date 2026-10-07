import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/current-user";
import { withUser } from "@/lib/db";
import { aggregateByLab, loadLabs, loadProjects } from "@/lib/data/portfolio";
import { formatMoney, formatPct } from "@/lib/format";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/page-header";

export const metadata = { title: "Labs" };

export default async function LabsPage() {
  const user = await requireUser();
  if (user.role === "pi" || user.role === "project_lead") redirect("/");
  const today = new Date();
  const { labs, projects } = await withUser(user.id, async (q) => ({ labs: await loadLabs(q), projects: await loadProjects(q, today) }));
  const agg = aggregateByLab(labs, projects);

  return (
    <>
      <PageHeader title="Labs" subtitle="Each lab is led by a Principal Investigator; click through to its projects." crumbs={[{ label: "NAAMII", href: "/" }, { label: "Labs" }]} />
      {agg.length === 0 ? <EmptyState title="No labs visible" /> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {agg.map((l) => (
            <Card key={l.id}>
              <CardBody>
                <Link href={`/labs/${l.id}`} className="text-[15px] font-semibold text-ink hover:underline">{l.name}</Link>
                <p className="text-[12.5px] text-grey">{l.code} · PI: {l.piName ?? "—"}</p>
                <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
                  <dt className="text-grey">Projects</dt><dd className="tnum text-right">{l.activeProjects} active / {l.projects}</dd>
                  <dt className="text-grey">Budget</dt><dd className="tnum text-right">{formatMoney(l.budget, "NPR", { compact: true })}</dd>
                  <dt className="text-grey">Expenditure</dt><dd className="tnum text-right">{formatMoney(l.actual, "NPR", { compact: true })}</dd>
                  <dt className="text-grey">Utilisation</dt><dd className="tnum text-right">{formatPct(l.utilization)}</dd>
                  <dt className="text-grey">At risk</dt><dd className={`tnum text-right font-semibold ${l.atRisk ? "text-critical" : ""}`}>{l.atRisk}</dd>
                </dl>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
