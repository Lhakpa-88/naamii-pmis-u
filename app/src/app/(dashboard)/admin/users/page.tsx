import { ROLE_LABEL } from "@naamii/core";
import { requireRole } from "@/lib/auth/current-user";
import { withUser } from "@/lib/db";
import { loadUsers } from "@/lib/data/admin";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

export const metadata = { title: "Users & roles" };

export default async function UsersPage() {
  const user = await requireRole("admin");
  const users = await withUser(user.id, (q) => loadUsers(q));
  return (
    <>
      <PageHeader title="Users & roles" subtitle="User → role → lab → project(s). Changing a row here changes what that person sees on their next sign-in — no code change. Editing arrives in Phase 3." crumbs={[{ label: "NAAMII", href: "/" }, { label: "Administration" }, { label: "Users & roles" }]} />
      <Card>
        <CardHeader title="Mapped users" subtitle={`${users.length} accounts`} />
        <table className="w-full text-[13px]">
          <thead className="bg-cool-100 text-[11.5px] uppercase tracking-wide text-grey">
            <tr><th className="px-5 py-2 text-left font-semibold">Name</th><th className="px-3 py-2 text-left font-semibold">E-mail</th><th className="px-3 py-2 text-left font-semibold">Role</th><th className="px-3 py-2 text-left font-semibold">Lab</th><th className="px-3 py-2 text-right font-semibold">Projects</th><th className="px-3 py-2 text-left font-semibold">SSO</th><th className="px-3 py-2 text-left font-semibold">Active</th></tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-cool-200">
                <td className="px-5 py-2 font-medium text-ink">{u.name}</td>
                <td className="px-3 py-2 text-grey">{u.email}</td>
                <td className="px-3 py-2">{ROLE_LABEL[u.role]}</td>
                <td className="px-3 py-2">{u.lab_name ?? "—"}</td>
                <td className="tnum px-3 py-2 text-right">{u.projects}</td>
                <td className="px-3 py-2 text-grey">{u.entra_bound ? "Linked" : "Not yet"}</td>
                <td className="px-3 py-2">{u.active ? <span className="text-good">Yes</span> : <span className="text-critical">No</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
