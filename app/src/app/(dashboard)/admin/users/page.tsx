import Link from "next/link";
import { ROLE_LABEL } from "@naamii/core";
import { requireRole } from "@/lib/auth/current-user";
import { withUser } from "@/lib/db";
import { loadUsers } from "@/lib/data/admin";
import { loadUserChanges } from "@/lib/admin/users";
import { loadPasswordStatus } from "@/lib/auth/passwords";
import { env } from "@/lib/env";
import { formatDateTime } from "@/lib/format";
import { ROLE_AUTHORITY } from "@/components/admin/user-form";
import { EntryNotice } from "@/components/entry/record-editor";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

export const metadata = { title: "Users & roles" };

function signInState(p: { hasPassword: boolean; mustChange: boolean; locked: boolean; lastLoginAt: Date | null } | undefined) {
  if (!p?.hasPassword) return <span className="font-medium text-critical">No password set</span>;
  if (p.locked) return <span className="font-medium text-critical">Locked</span>;
  if (p.mustChange) return "First password not yet changed";
  return p.lastLoginAt ? `Last signed in ${formatDateTime(p.lastLoginAt.toISOString())}` : "Password set";
}

export default async function UsersPage({ searchParams }: PageProps<"/admin/users">) {
  const user = await requireRole("admin");
  const { ok, err } = (await searchParams) as { ok?: string; err?: string };
  const { users, changes, passwords } = await withUser(user.id, async (q) => ({ users: await loadUsers(q), changes: await loadUserChanges(q), passwords: await loadPasswordStatus(q) }));
  const passwordMode = env.authMode === "password";
  const active = users.filter((u) => u.active).length;
  return (
    <>
      <PageHeader
        title="Users & roles"
        subtitle="Finance & Operations administers the system: who may sign in, and what each person may see and enter. A change takes effect on that person’s next page load."
        crumbs={[{ label: "NAAMII", href: "/" }, { label: "Administration" }, { label: "Users & roles" }]}
        actions={<Link href="/admin/users/new" className="rounded-md bg-ink px-4 py-2 text-[13px] font-semibold text-white hover:bg-ink-700">Add user</Link>}
      />
      <EntryNotice ok={ok} err={err} />
      <Card>
        <CardHeader title="Users" subtitle={`${users.length} accounts · ${active} active`} />
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="bg-cool-100 text-[11.5px] uppercase tracking-wide text-grey">
              <tr><th className="px-5 py-2 text-left font-semibold">Name</th><th className="px-3 py-2 text-left font-semibold">E-mail</th><th className="px-3 py-2 text-left font-semibold">Role</th><th className="px-3 py-2 text-left font-semibold">Lab</th><th className="px-3 py-2 text-right font-semibold">Projects</th><th className="px-3 py-2 text-left font-semibold">{passwordMode || env.authMode === "dev" ? "Sign-in" : "Microsoft sign-in"}</th><th className="px-3 py-2 text-left font-semibold">Status</th><th className="px-5 py-2" /></tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className={`border-t border-cool-200 ${u.active ? "" : "bg-cool-100/60"}`}>
                  <td className="px-5 py-2 font-medium text-ink">{u.name}{u.id === user.id ? <span className="ml-2 rounded bg-cool-100 px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-grey">You</span> : null}</td>
                  <td className="px-3 py-2 text-grey">{u.email}</td>
                  <td className="px-3 py-2">{ROLE_LABEL[u.role]}</td>
                  <td className="px-3 py-2">{u.lab_name ?? "—"}</td>
                  <td className="tnum px-3 py-2 text-right">{u.projects}</td>
                  <td className="px-3 py-2 text-grey">{passwordMode ? signInState(passwords.get(u.id)) : env.authMode === "dev" ? "No password asked (development)" : u.entra_bound ? "Linked" : "Not yet signed in"}</td>
                  <td className="px-3 py-2">{u.active ? <span className="text-good">Active</span> : <span className="font-medium text-critical">Deactivated</span>}</td>
                  <td className="px-5 py-2 text-right"><Link href={`/admin/users/${u.id}`} className="font-medium text-ink underline decoration-cool-300 underline-offset-2 hover:decoration-ink">Edit</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader title="What each role may do" subtitle="Enforced in the database, not only on screen" />
          <ul>
            {(["admin", "ed", "pi", "project_lead"] as const).map((r) => (
              <li key={r} className="border-t border-cool-200 px-5 py-2.5 first:border-t-0">
                <p className="text-[13px] font-semibold text-ink">{ROLE_LABEL[r]} <span className="tnum ml-1 font-normal text-grey">· {users.filter((u) => u.role === r && u.active).length} active</span></p>
                <p className="text-[12.5px] text-grey">{ROLE_AUTHORITY[r]}</p>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Recent changes" subtitle="From the audit log — who changed which account" />
          {changes.length === 0 ? <CardBody><p className="text-[13px] text-grey">No changes yet.</p></CardBody> : (
            <ul>
              {changes.map((c, i) => (
                <li key={i} className="flex flex-wrap items-baseline gap-x-3 border-t border-cool-200 px-5 py-2 text-[13px] first:border-t-0">
                  <span className="text-ink">{c.summary}</span>
                  <span className="tnum text-[12px] text-grey">{formatDateTime(c.at.toISOString())}{c.actorName ? ` · by ${c.actorName}` : ""}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
