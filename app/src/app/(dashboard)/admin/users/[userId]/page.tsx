import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/current-user";
import { withUser } from "@/lib/db";
import { env } from "@/lib/env";
import { loadUser, loadUserFormOptions } from "@/lib/admin/users";
import { formatDateTime } from "@/lib/format";
import { UserForm } from "@/components/admin/user-form";
import { EntryNotice } from "@/components/entry/record-editor";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

export const metadata = { title: "Edit user" };

export default async function EditUserPage({ params, searchParams }: PageProps<"/admin/users/[userId]">) {
  const admin = await requireRole("admin");
  const { userId } = await params;
  const { err } = (await searchParams) as { err?: string };
  const data = await withUser(admin.id, async (q) => {
    const user = await loadUser(q, userId);
    return user ? { user, options: await loadUserFormOptions(q) } : null;
  });
  if (!data) notFound();
  const { user, options } = data;
  return (
    <>
      <PageHeader title={user.name} subtitle={`Added ${formatDateTime(user.createdAt.toISOString())} · last changed ${formatDateTime(user.updatedAt.toISOString())}`} crumbs={[{ label: "NAAMII", href: "/" }, { label: "Administration" }, { label: "Users & roles", href: "/admin/users" }, { label: user.name }]} />
      <EntryNotice err={err} />
      <Card>
        <CardHeader title="Edit user" subtitle="Changes take effect on the person’s next page load · recorded in the audit log" />
        <UserForm user={user} options={options} demoMode={env.authMode === "demo"} isSelf={user.id === admin.id} />
      </Card>
    </>
  );
}
