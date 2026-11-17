import Link from "next/link";
import { requireRole } from "@/lib/auth/current-user";
import { withUser } from "@/lib/db";
import { loadLabsAdmin } from "@/lib/admin/labs";
import { EntryNotice } from "@/components/entry/record-editor";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

export const metadata = { title: "Manage labs" };

export default async function ManageLabsPage({ searchParams }: PageProps<"/admin/labs">) {
  const admin = await requireRole("admin");
  const { ok, err } = (await searchParams) as { ok?: string; err?: string };
  const labs = await withUser(admin.id, (q) => loadLabsAdmin(q));
  const active = labs.filter((l) => l.active).length;
  return (
    <>
      <PageHeader
        title="Manage labs"
        subtitle="Add, rename, retire or delete labs as NAAMII changes. Every lab list in PMIS — project forms, user forms and the Excel template — is read from here."
        crumbs={[{ label: "NAAMII", href: "/" }, { label: "Administration" }, { label: "Manage labs" }]}
        actions={<Link href="/admin/labs/new" className="rounded-md bg-ink px-4 py-2 text-[13px] font-semibold text-white hover:bg-ink-700">Add lab</Link>}
      />
      <EntryNotice ok={ok} err={err} />
      <Card>
        <CardHeader title="Labs" subtitle={`${labs.length} lab${labs.length === 1 ? "" : "s"} · ${active} active`} />
        {labs.length === 0 ? <CardBody><p className="text-[13px] text-grey">No labs yet. Add the first one with “Add lab”.</p></CardBody> : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="bg-cool-100 text-[11.5px] uppercase tracking-wide text-grey">
                <tr><th className="px-5 py-2 text-left font-semibold">Lab</th><th className="px-3 py-2 text-left font-semibold">Code</th><th className="px-3 py-2 text-left font-semibold">Principal Investigator</th><th className="px-3 py-2 text-right font-semibold">Projects</th><th className="px-3 py-2 text-right font-semibold">People</th><th className="px-3 py-2 text-left font-semibold">Status</th><th className="px-5 py-2" /></tr>
              </thead>
              <tbody>
                {labs.map((l) => (
                  <tr key={l.id} className={`border-t border-cool-200 ${l.active ? "" : "bg-cool-100/60"}`}>
                    <td className="px-5 py-2 font-medium text-ink">{l.name}</td>
                    <td className="px-3 py-2 text-grey">{l.code}</td>
                    <td className="px-3 py-2">{l.piName ?? "—"}</td>
                    <td className="tnum px-3 py-2 text-right">{l.projects}</td>
                    <td className="tnum px-3 py-2 text-right">{l.people}</td>
                    <td className="px-3 py-2">{l.active ? <span className="text-good">Active</span> : <span className="font-medium text-grey">Retired</span>}</td>
                    <td className="px-5 py-2 text-right"><Link href={`/admin/labs/${l.id}`} className="font-medium text-ink underline decoration-cool-300 underline-offset-2 hover:decoration-ink">Edit</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="border-t border-cool-200 px-5 py-2.5 text-[12px] text-grey">A lab with projects cannot be deleted — retire it (untick “Active”) so its history stays. Open a lab with “Edit” to rename, retire or delete it.</p>
      </Card>
    </>
  );
}
