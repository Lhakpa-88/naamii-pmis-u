import { sheetFor } from "@naamii/core";
import { requireRole } from "@/lib/auth/current-user";
import { withUser } from "@/lib/db";
import { loadEntryOptions } from "@/lib/entry/write";
import { EntryNotice, ProjectForm } from "@/components/entry/record-editor";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

export const metadata = { title: "New project" };

export default async function NewProjectPage({ searchParams }: PageProps<"/data-entry/projects/new">) {
  const user = await requireRole("admin");
  const { ok, err } = (await searchParams) as { ok?: string; err?: string };
  const options = await withUser(user.id, (q) => loadEntryOptions(q));
  return (
    <>
      <PageHeader title="New project" subtitle="Create the project record. Financials, milestones, risks and team are entered on the next screen." crumbs={[{ label: "NAAMII", href: "/" }, { label: "Data entry", href: "/data-entry" }, { label: "New project" }]} />
      <EntryNotice ok={ok} err={err} />
      <Card>
        <CardHeader title="Project details" subtitle="Finance & Operations only" />
        <ProjectForm
          sheet={sheetFor("projects")}
          returnTo="/data-entry/projects/new"
          options={{
            lab_code: options.labs.map((l) => ({ value: l.code, label: `${l.code} — ${l.name}` })),
            pi_email: options.pis.map((p) => ({ value: p.email, label: p.name })),
            lead_email: options.leads.map((p) => ({ value: p.email, label: p.name })),
          }}
        />
      </Card>
    </>
  );
}
