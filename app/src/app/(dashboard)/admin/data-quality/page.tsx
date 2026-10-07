import { requireRole } from "@/lib/auth/current-user";
import { withUser } from "@/lib/db";
import { loadImportErrors } from "@/lib/data/admin";
import { formatDateTime } from "@/lib/format";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

export const metadata = { title: "Data quality" };

export default async function DataQualityPage() {
  const user = await requireRole("admin");
  const errors = await withUser(user.id, (q) => loadImportErrors(q));
  return (
    <>
      <PageHeader title="Data quality" subtitle="Validation problems found while importing project workbooks, with the file, sheet and row to fix." crumbs={[{ label: "NAAMII", href: "/" }, { label: "Administration" }, { label: "Data quality" }]} />
      <Card>
        <CardHeader title="Import errors" subtitle={`${errors.length} recorded`} />
        {errors.length === 0 ? (
          <CardBody><p className="text-[13px] text-grey">No validation errors recorded. The checks (missing project code, duplicate codes, missing lab/PI/lead, invalid dates, currencies and numbers, unexpected structure) run inside the ingestion Function from Phase 2.</p></CardBody>
        ) : (
          <table className="w-full text-[13px]">
            <thead className="bg-cool-100 text-[11.5px] uppercase tracking-wide text-grey">
              <tr><th className="px-5 py-2 text-left font-semibold">When</th><th className="px-3 py-2 text-left font-semibold">File</th><th className="px-3 py-2 text-left font-semibold">Sheet / row</th><th className="px-3 py-2 text-left font-semibold">Field</th><th className="px-3 py-2 text-left font-semibold">Error</th></tr>
            </thead>
            <tbody>
              {errors.map((e) => (
                <tr key={e.id} className="border-t border-cool-200">
                  <td className="tnum whitespace-nowrap px-5 py-2 text-grey">{formatDateTime(e.created_at.toISOString())}</td>
                  <td className="px-3 py-2 text-ink">{e.source_file}</td>
                  <td className="px-3 py-2 text-grey">{e.source_sheet ?? "—"}{e.source_row ? ` / ${e.source_row}` : ""}</td>
                  <td className="px-3 py-2">{e.field ?? "—"}</td>
                  <td className="px-3 py-2"><span className="font-semibold text-critical">{e.error_code}</span> — {e.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
