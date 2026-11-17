import { requireRole } from "@/lib/auth/current-user";
import { withUser } from "@/lib/db";
import { env } from "@/lib/env";
import { loadUserFormOptions } from "@/lib/admin/users";
import { UserForm } from "@/components/admin/user-form";
import { EntryNotice } from "@/components/entry/record-editor";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

export const metadata = { title: "Add user" };

export default async function NewUserPage({ searchParams }: PageProps<"/admin/users/new">) {
  const admin = await requireRole("admin");
  const { err } = (await searchParams) as { err?: string };
  const options = await withUser(admin.id, (q) => loadUserFormOptions(q));
  return (
    <>
      <PageHeader title="Add user" subtitle="Give a person access to PMIS: who they are, and what they are allowed to see and do." crumbs={[{ label: "NAAMII", href: "/" }, { label: "Administration" }, { label: "Users & roles", href: "/admin/users" }, { label: "Add user" }]} />
      <EntryNotice err={err} />
      <Card>
        <CardHeader title="New user" subtitle="Finance & Operations only · recorded in the audit log" />
        <UserForm options={options} demoMode={env.authMode === "demo"} />
      </Card>
    </>
  );
}
