import { requireRole } from "@/lib/auth/current-user";
import { withUser } from "@/lib/db";
import { loadMappings } from "@/lib/data/admin";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

export const metadata = { title: "Column mappings" };

export default async function MappingsPage() {
  const user = await requireRole("admin");
  const rows = await withUser(user.id, (q) => loadMappings(q));
  return (
    <>
      <PageHeader title="Column mappings" subtitle="How Excel headings map to the standard schema. Edit here (Phase 3) when a workbook uses different headings — no developer, no redeploy." crumbs={[{ label: "NAAMII", href: "/" }, { label: "Administration" }, { label: "Column mappings" }]} />
      <Card>
        <CardHeader title="Active mappings" subtitle={`${rows.length} rules`} />
        <table className="w-full text-[13px]">
          <thead className="bg-cool-100 text-[11.5px] uppercase tracking-wide text-grey">
            <tr><th className="px-5 py-2 text-left font-semibold">Sheet</th><th className="px-3 py-2 text-left font-semibold">Excel column</th><th className="px-3 py-2 text-left font-semibold">Maps to</th><th className="px-3 py-2 text-left font-semibold">Type</th><th className="px-3 py-2 text-left font-semibold">Required</th><th className="px-3 py-2 text-left font-semibold">Notes</th></tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.id} className={`border-t border-cool-200 ${m.active ? "" : "opacity-50"}`}>
                <td className="px-5 py-2 text-grey">{m.sheet_pattern}</td>
                <td className="px-3 py-2 font-medium text-ink">“{m.excel_column}”</td>
                <td className="px-3 py-2"><code className="rounded bg-cool-100 px-1.5 py-0.5 text-[12px]">{m.target_entity}.{m.target_field}</code></td>
                <td className="px-3 py-2">{m.data_type}</td>
                <td className="px-3 py-2">{m.required ? "Yes" : "No"}</td>
                <td className="px-3 py-2 text-grey">{m.notes ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
