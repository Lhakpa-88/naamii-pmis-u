import { redirect } from "next/navigation";
import { overviewTitleFor } from "@naamii/core";
import { requireUser } from "@/lib/auth/current-user";
import { withUser } from "@/lib/db";
import { loadLabs, loadMonthlyTrend, loadProjects } from "@/lib/data/portfolio";
import { trendWindow } from "@/lib/data/window";
import { PortfolioOverview } from "@/components/portfolio-overview";
import { PageHeader } from "@/components/ui/page-header";

/**
 * Role-scoped landing page. The same component renders the Executive Overview
 * (ED/Admin), "My Lab" (PI) and "My Project" (Project Lead): the rows differ
 * because the database applied Row Level Security for this user.
 */
export default async function OverviewPage() {
  const user = await requireUser();
  const today = new Date();
  const win = trendWindow(today);

  const { projects, labs, trend } = await withUser(user.id, async (q) => ({
    projects: await loadProjects(q, today),
    labs: await loadLabs(q),
    trend: await loadMonthlyTrend(q, { from: win.from, to: win.to }),
  }));

  // A Project Lead with exactly one project lands straight on it.
  if (user.role === "project_lead" && projects.length === 1) redirect(`/projects/${projects[0].summary.id}`);

  const orgWide = user.role === "ed" || user.role === "admin";
  const labName = !orgWide && projects.length > 0 ? projects[0].summary.labName : null;
  const title = overviewTitleFor(user.role);

  return (
    <>
      <PageHeader
        title={user.role === "pi" && labName ? `${title} — ${labName}` : title}
        subtitle={orgWide ? "Organisation-wide portfolio: every lab and project." : user.role === "pi" ? "Projects in your lab only." : "Projects assigned to you only."}
        crumbs={[{ label: "NAAMII" }, { label: title }]}
      />
      <PortfolioOverview projects={projects} labs={labs} trend={trend} currentPeriod={win.currentPeriod} scope={orgWide ? "organisation" : "lab"} />
    </>
  );
}
