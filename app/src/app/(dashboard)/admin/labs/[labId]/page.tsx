import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/current-user";
import { withUser } from "@/lib/db";
import { loadLabsAdmin, loadPiChoices } from "@/lib/admin/labs";
import { formatDateTime } from "@/lib/format";
import { LabForm } from "@/components/admin/lab-form";
import { EntryNotice } from "@/components/entry/record-editor";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

export const metadata = { title: "Edit lab" };

export default async function EditLabPage({ params, searchParams }: PageProps<"/admin/labs/[labId]">) {
  const admin = await requireRole("admin");
  const { labId } = await params;
  const { err } = (await searchParams) as { err?: string };
  const data = await withUser(admin.id, async (q) => {
    const [lab] = await loadLabsAdmin(q, labId);
    return lab ? { lab, pis: await loadPiChoices(q) } : null;
  });
  if (!data) notFound();
  const { lab, pis } = data;
  return (
    <>
      <PageHeader title={lab.name} subtitle={`${lab.projects} project${lab.projects === 1 ? "" : "s"} · ${lab.people} ${lab.people === 1 ? "person" : "people"} · last changed ${formatDateTime(lab.updatedAt.toISOString())}`} crumbs={[{ label: "NAAMII", href: "/" }, { label: "Administration" }, { label: "Manage labs", href: "/admin/labs" }, { label: lab.name }]} />
      <EntryNotice err={err} />
      <Card>
        <CardHeader title="Edit lab" subtitle="Finance & Operations only · recorded in the audit log" />
        <LabForm lab={lab} pis={pis} />
      </Card>
    </>
  );
}
