import { requireRole } from "@/lib/auth/current-user";
import { withUser } from "@/lib/db";
import { loadImportRuns } from "@/lib/data/admin";
import { formatDateTime } from "@/lib/format";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

export const metadata = { title: "Data imports" };

export default async function DataImportsPage() {
  const user = await requireRole("admin");
  const { runs, files } = await withUser(user.id, (q) => loadImportRuns(q));
  return (
    <>
      <PageHeader title="Data imports" subtitle="Excel uploads made under Data Entry, and synchronisation runs. Scheduled OneDrive sync arrives in Phase 2." crumbs={[{ label: "NAAMII", href: "/" }, { label: "Administration" }, { label: "Data imports" }]} />
      <Card>
        <CardHeader title="Import runs" subtitle="Most recent first" />
        {runs.length === 0 ? <CardBody><p className="text-[13px] text-grey">No import runs yet.</p></CardBody> : runs.map((r) => (
          <div key={r.id} className="border-t border-cool-200 px-5 py-4">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-[13px]">
              <span className="font-semibold text-ink">{formatDateTime(r.started_at.toISOString())}</span>
              <span className={`rounded-full px-2 py-0.5 text-[12px] font-medium ${r.status === "success" ? "bg-good/10 text-good" : r.status === "failed" ? "bg-critical/10 text-critical" : "bg-cool-100 text-ink"}`}>{r.status}</span>
              <span className="text-grey">trigger: {r.triggered_by}</span>
              <span className="tnum text-grey">{r.files_total} files · {r.files_changed} changed · {r.files_unchanged} unchanged · <span className={r.files_failed ? "font-semibold text-critical" : ""}>{r.files_failed} failed</span></span>
              {r.notes ? <span className="text-grey">— {r.notes}</span> : null}
            </div>
            <ul className="mt-2 grid gap-1 text-[12.5px] md:grid-cols-2 xl:grid-cols-3">
              {files.filter((f) => f.import_run_id === r.id).map((f, i) => (
                <li key={i} className="flex items-center justify-between rounded border border-cool-200 px-3 py-1.5">
                  <span className="truncate text-ink">{f.source_file}</span>
                  <span className={`ml-2 shrink-0 ${f.status === "failed" ? "font-semibold text-critical" : "text-grey"}`}>{f.status}{f.rows_upserted ? ` · ${f.rows_upserted} rows` : ""}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </Card>
    </>
  );
}
