import { requireUser } from "@/lib/auth/current-user";
import { withUser } from "@/lib/db";
import { loadProjects } from "@/lib/data/portfolio";
import { PortfolioTable } from "@/components/portfolio-table";
import { toTableRows } from "@/components/portfolio-overview";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

export const metadata = { title: "Projects" };

export default async function ProjectsPage() {
  const user = await requireUser();
  const today = new Date();
  const projects = await withUser(user.id, (q) => loadProjects(q, today));
  const orgWide = user.role === "ed" || user.role === "admin";
  return (
    <>
      <PageHeader title={orgWide ? "Projects" : "My Projects"} subtitle={`${projects.length} project${projects.length === 1 ? "" : "s"} visible to you`} crumbs={[{ label: "NAAMII", href: "/" }, { label: orgWide ? "Projects" : "My Projects" }]} />
      <Card>
        <CardHeader title="Project portfolio" subtitle="Sort any column; filters only offer what you are entitled to see" />
        <PortfolioTable rows={toTableRows(projects)} showLab={orgWide} />
      </Card>
    </>
  );
}
