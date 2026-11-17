import Link from "next/link";
import { notFound } from "next/navigation";
import { entrySheetsFor, sheetFor, type EntryEntity } from "@naamii/core";
import { requireRole } from "@/lib/auth/current-user";
import { withUser } from "@/lib/db";
import { loadEntryOptions, loadEntryRows, type EntryRow } from "@/lib/entry/write";
import { EntryNotice, ProjectForm, RecordEditor } from "@/components/entry/record-editor";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

export const metadata = { title: "Enter project data" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const EMPTY: Record<Exclude<EntryEntity, "projects">, string> = {
  financials: "No monthly figures yet. Add the first month below.",
  milestones: "No milestones yet. Add the first one below.",
  risks: "No risks recorded. Add one below.",
  team: "No team members yet. Add the first one below.",
};

/** Headings of the fields of an entity that only Finance & Operations enters. */
const restricted = (entity: EntryEntity) => sheetFor(entity).fields.filter((f) => f.financeOnly).map((f) => f.header).join(", ");

export default async function ProjectEntryPage({ params, searchParams }: PageProps<"/projects/[projectId]/edit">) {
  const { projectId } = await params;
  const { ok, err, at } = (await searchParams) as { ok?: string; err?: string; at?: string };
  const user = await requireRole("admin", "project_lead");
  if (!UUID.test(projectId)) notFound();
  const sheets = entrySheetsFor(user.role);
  const returnTo = `/projects/${projectId}/edit`;

  // RLS: a project the user may not see does not come back → 404. For a Project
  // Lead, "can see" and "may enter data for" are the same set of projects.
  const data = await withUser(user.id, async (q) => {
    const [project] = await loadEntryRows(q, "projects", projectId);
    if (!project) return null;
    const rows = {} as Record<EntryEntity, EntryRow[]>;
    for (const s of sheets) if (s.entity !== "projects") rows[s.entity] = await loadEntryRows(q, s.entity, projectId);
    return { project, rows, options: user.role === "admin" ? await loadEntryOptions(q) : null };
  });
  if (!data) notFound();
  const { project, rows, options } = data;

  return (
    <>
      <PageHeader
        title={`Enter data — ${String(project.name)}`}
        subtitle={`${String(project.code)} · changes are saved one record at a time and recorded in the audit log`}
        crumbs={[{ label: "NAAMII", href: "/" }, { label: "Data entry", href: "/data-entry" }, { label: String(project.code) }]}
        actions={<Link href={`/projects/${projectId}`} className="rounded-md border border-cool-300 bg-white px-3.5 py-2 text-[13px] font-medium text-ink hover:bg-cool-100">View dashboard</Link>}
      />
      {sheets.some((s) => s.entity === at) ? null : <EntryNotice ok={ok} err={err} />}

      <nav aria-label="Sections" className="mb-4 flex flex-wrap gap-2 text-[12.5px]">
        {sheets.map((s) => <a key={s.entity} href={`#${s.entity}`} className="rounded-full border border-cool-300 bg-white px-3 py-1 font-medium text-ink hover:bg-cool-100">{s.entity === "projects" ? "Project details" : s.sheet}</a>)}
      </nav>

      <div className="flex flex-col gap-5">
        {sheets.map((s) => s.entity === "projects" ? (
          <Card key={s.entity}>
            <div id={s.entity} className="scroll-mt-4" />
            <CardHeader title="Project details" subtitle="Finance & Operations only" />
            {at === s.entity ? <EntryNotice ok={ok} err={err} inCard /> : null}
            <ProjectForm sheet={s} row={project} returnTo={returnTo} options={{
              lab_code: (options?.labs ?? []).map((l) => ({ value: l.code, label: `${l.code} — ${l.name}` })),
              pi_email: (options?.pis ?? []).map((p) => ({ value: p.email, label: p.name })),
              lead_email: (options?.leads ?? []).map((p) => ({ value: p.email, label: p.name })),
            }} />
          </Card>
        ) : (
          <Card key={s.entity}>
            <div id={s.entity} className="scroll-mt-4" />
            <CardHeader
              title={s.entity === "financials" ? "Monthly financials" : s.sheet}
              subtitle={`${s.description}${user.role !== "admin" && restricted(s.entity) ? ` ${restricted(s.entity)}: entered by Finance & Operations.` : ""}${s.entity === "financials" ? ` Amounts in ${String(project.currency)}.` : ""}`}
            />
            {at === s.entity ? <div className="pb-4"><EntryNotice ok={ok} err={err} inCard /></div> : null}
            <RecordEditor sheet={s} rows={rows[s.entity]} projectId={projectId} returnTo={returnTo} emptyText={EMPTY[s.entity]} canDelete={user.role === "admin" || s.entity !== "financials"} />
          </Card>
        ))}
      </div>
    </>
  );
}
