import { requireRole } from "@/lib/auth/current-user";
import { withUser } from "@/lib/db";
import { loadPiChoices } from "@/lib/admin/labs";
import { LabForm } from "@/components/admin/lab-form";
import { EntryNotice } from "@/components/entry/record-editor";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

export const metadata = { title: "Add lab" };

export default async function NewLabPage({ searchParams }: PageProps<"/admin/labs/new">) {
  const admin = await requireRole("admin");
  const { err } = (await searchParams) as { err?: string };
  const pis = await withUser(admin.id, (q) => loadPiChoices(q));
  return (
    <>
      <PageHeader title="Add lab" subtitle="The new lab becomes available at once wherever a lab is chosen." crumbs={[{ label: "NAAMII", href: "/" }, { label: "Administration" }, { label: "Manage labs", href: "/admin/labs" }, { label: "Add lab" }]} />
      <EntryNotice err={err} />
      <Card>
        <CardHeader title="New lab" subtitle="Finance & Operations only · recorded in the audit log" />
        <LabForm pis={pis} />
      </Card>
    </>
  );
}
