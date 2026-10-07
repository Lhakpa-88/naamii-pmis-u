import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/current-user";
import { withUser } from "@/lib/db";
import { loadLabs, loadMonthlyTrend, loadProjects } from "@/lib/data/portfolio";
import { trendWindow } from "@/lib/data/window";
import { PortfolioOverview } from "@/components/portfolio-overview";
import { PageHeader } from "@/components/ui/page-header";

export default async function LabPage({ params }: PageProps<"/labs/[labId]">) {
  const { labId } = await params;
  const user = await requireUser();
  const today = new Date();
  const win = trendWindow(today);

  const data = await withUser(user.id, async (q) => {
    const labs = await loadLabs(q);
    const lab = labs.find((l) => l.id === labId);
    if (!lab) return null; // not visible to this user, or does not exist
    return { lab, labs: [lab], projects: await loadProjects(q, today, { labId }), trend: await loadMonthlyTrend(q, { from: win.from, to: win.to, labId }) };
  });
  if (!data) notFound();

  const orgWide = user.role === "ed" || user.role === "admin";
  return (
    <>
      <PageHeader
        title={data.lab.name}
        subtitle={`${data.lab.code} · Principal Investigator: ${data.lab.piName ?? "—"}`}
        crumbs={orgWide ? [{ label: "NAAMII", href: "/" }, { label: "Labs", href: "/labs" }, { label: data.lab.name }] : [{ label: "NAAMII" }, { label: "My Lab", href: "/" }, { label: data.lab.name }]}
      />
      <PortfolioOverview projects={data.projects} labs={data.labs} trend={data.trend} currentPeriod={win.currentPeriod} scope="lab" />
    </>
  );
}
