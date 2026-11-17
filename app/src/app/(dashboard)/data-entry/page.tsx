import Link from "next/link";
import { ENTRY_SHEETS, canEnterEntity, entrySheetsFor } from "@naamii/core";
import { requireRole } from "@/lib/auth/current-user";
import { withUser } from "@/lib/db";
import { loadEntryOptions } from "@/lib/entry/write";
import { formatDateTime } from "@/lib/format";
import { ImportForm } from "@/components/entry/import-form";
import { EntryNotice } from "@/components/entry/record-editor";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

export const metadata = { title: "Data entry" };

const BTN = "inline-flex items-center rounded-md border border-cool-300 bg-white px-3.5 py-2 text-[13px] font-medium text-ink hover:bg-cool-100";

export default async function DataEntryPage({ searchParams }: PageProps<"/data-entry">) {
  const user = await requireRole("admin", "project_lead");
  const { ok, err } = (await searchParams) as { ok?: string; err?: string };
  const admin = user.role === "admin";
  const sheets = entrySheetsFor(user.role);

  const { options, uploads } = await withUser(user.id, async (q) => {
    const options = await loadEntryOptions(q);
    const { rows } = await q.query<{ id: string; started_at: Date; status: string; notes: string | null; source_file: string | null; by_name: string | null; errors: number }>(
      `SELECT r.id, r.started_at, r.status::text, r.notes, u.name AS by_name,
              (SELECT f.source_file FROM import_files f WHERE f.import_run_id = r.id LIMIT 1) AS source_file,
              (SELECT count(*) FROM import_errors e WHERE e.import_run_id = r.id)::int AS errors
       FROM import_runs r LEFT JOIN users u ON u.id = r.triggered_by_user
       WHERE r.triggered_by = 'manual_upload' ORDER BY r.started_at DESC LIMIT 8`);
    return { options, uploads: rows };
  });

  return (
    <>
      <PageHeader
        title="Data entry"
        subtitle={admin
          ? "Finance & Operations enters projects, budgets, monthly financials and staff costs — and can enter everything a Project Lead can."
          : "As Project Lead you enter the monthly forecast, milestones, risks and team members for your own projects. Budgets, actuals, commitments and staff costs are entered by Finance & Operations."}
        crumbs={[{ label: "NAAMII", href: "/" }, { label: "Data entry" }]}
      />
      <EntryNotice ok={ok} err={err} />

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader title="1 · Import from Excel" subtitle="Best for the first-time set-up or many rows at once" />
          <CardBody>
            <ol className="mb-4 flex list-decimal flex-col gap-1 pl-5 text-[13px] text-ink">
              <li>Download the template. It contains the sheets your role can fill in: <span className="font-medium">{sheets.map((s) => s.sheet).join(", ")}</span>.</li>
              <li>Fill it in Excel — the Instructions sheet explains every column.</li>
              <li>Upload it here. Check first; import when the check passes.</li>
            </ol>
            <div className="mb-5 flex flex-wrap gap-2">
              <a href="/data-entry/template" className={BTN} download>Download empty template</a>
              <a href="/data-entry/template?data=1" className={BTN} download>Download template with current data</a>
            </div>
            <ImportForm />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="2 · Enter in forms"
            subtitle="Best for day-to-day updates to one project"
            action={admin ? <Link href="/data-entry/projects/new" className="rounded-md bg-ink px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-ink-700">New project</Link> : undefined}
          />
          {options.projects.length === 0 ? (
            <CardBody><p className="text-[13px] text-grey">{admin ? "No projects yet. Create the first one with “New project”, or import the Projects sheet." : "No project is assigned to you yet. Ask Finance & Operations to name you as project lead."}</p></CardBody>
          ) : (
            <table className="w-full text-[13px]">
              <thead className="bg-cool-100 text-[11.5px] uppercase tracking-wide text-grey">
                <tr><th className="px-5 py-2 text-left font-semibold">Project</th><th className="px-3 py-2 text-left font-semibold">Lab</th><th className="px-5 py-2" /></tr>
              </thead>
              <tbody>
                {options.projects.map((p) => (
                  <tr key={p.id} className="border-t border-cool-200">
                    <td className="px-5 py-2"><span className="font-medium text-ink">{p.name}</span><span className="ml-2 text-[12px] text-grey">{p.code}</span></td>
                    <td className="px-3 py-2 text-grey">{p.labName}</td>
                    <td className="px-5 py-2 text-right"><Link href={`/projects/${p.id}/edit`} className="font-medium text-ink underline decoration-cool-300 underline-offset-2 hover:decoration-ink">Enter data</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader title="Who enters what" subtitle="The same rule is enforced in the database" />
          <table className="w-full text-[13px]">
            <thead className="bg-cool-100 text-[11.5px] uppercase tracking-wide text-grey">
              <tr><th className="px-5 py-2 text-left font-semibold">Data</th><th className="px-3 py-2 text-left font-semibold">Finance &amp; Operations</th><th className="px-3 py-2 text-left font-semibold">Project Lead</th></tr>
            </thead>
            <tbody>
              {ENTRY_SHEETS.map((s) => (
                <tr key={s.entity} className="border-t border-cool-200 align-top">
                  <td className="px-5 py-2"><p className="font-medium text-ink">{s.sheet}</p><p className="text-[12px] text-grey">{s.description}</p></td>
                  <td className="px-3 py-2 text-ink">Enters</td>
                  <td className="px-3 py-2">{canEnterEntity("project_lead", s.entity) ? <span className="text-ink">Enters, own projects{s.fields.some((f) => f.financeOnly) ? ` — except ${s.fields.filter((f) => f.financeOnly).map((f) => f.header).join(", ")}` : ""}</span> : <span className="text-grey">View only</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card>
          <CardHeader title={admin ? "Recent uploads" : "My recent uploads"} subtitle="A rejected upload saves nothing" />
          {uploads.length === 0 ? <CardBody><p className="text-[13px] text-grey">No uploads yet.</p></CardBody> : (
            <ul>
              {uploads.map((u) => (
                <li key={u.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-cool-200 px-5 py-2.5 text-[13px] first:border-t-0">
                  <span className={`rounded-full px-2 py-0.5 text-[12px] font-medium ${u.status === "success" ? "bg-good/10 text-good" : "bg-critical/10 text-critical"}`}>{u.status === "success" ? "Imported" : "Rejected"}</span>
                  <span className="font-medium text-ink">{u.source_file ?? "—"}</span>
                  <span className="tnum text-grey">{formatDateTime(u.started_at.toISOString())}</span>
                  {admin && u.by_name ? <span className="text-grey">{u.by_name}</span> : null}
                  {u.errors ? <span className="text-critical">{u.errors} problem{u.errors === 1 ? "" : "s"}</span> : null}
                </li>
              ))}
            </ul>
          )}
          {admin ? <p className="border-t border-cool-200 px-5 py-2.5 text-[12px] text-grey">Row-level problems are listed under <Link href="/admin/data-quality" className="underline">Data Quality</Link>.</p> : null}
        </Card>
      </div>
    </>
  );
}
