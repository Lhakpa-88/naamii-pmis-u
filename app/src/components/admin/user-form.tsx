import Link from "next/link";
import { ROLE_LABEL, type Role } from "@naamii/core";
import { saveUserAction } from "@/lib/admin/user-actions";
import { ROLES, type UserDetail, type UserFormOptions } from "@/lib/admin/users";

const INPUT = "w-full rounded-md border border-cool-300 bg-white px-2.5 py-2 text-[13px] text-ink focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink";
const LABEL = "mb-1 block text-[12.5px] font-medium text-ink";
const HINT = "mt-1 text-[11.5px] leading-snug text-grey";

/** What each role is allowed to do — shown next to the role picker so authority is granted knowingly. */
export const ROLE_AUTHORITY: Record<Role, string> = {
  admin: "System administrator. Sees everything, enters all data, and manages users and roles.",
  ed: "Sees every lab and project, including staff costs. Read-only.",
  pi: "Sees the projects of the lab chosen below. Read-only.",
  project_lead: "Sees the projects ticked below and enters their forecast, milestones, risks and team.",
};

export function UserForm({ user, options, demoMode, isSelf }: { user?: UserDetail; options: UserFormOptions; demoMode: boolean; isSelf?: boolean }) {
  const labs = new Map<string, typeof options.projects>();
  for (const p of options.projects) labs.set(p.labName, [...(labs.get(p.labName) ?? []), p]);
  return (
    <form action={saveUserAction} className="px-5 py-5">
      {user ? <input type="hidden" name="id" value={user.id} /> : null}

      <fieldset>
        <legend className="text-[13.5px] font-semibold text-ink">Identity — how this person signs in</legend>
        <p className={HINT}>
          PMIS keeps no passwords. The person signs in with their NAAMII Microsoft account, and is recognised by the e-mail address below.
          {demoMode ? " In Demo Mode only addresses ending in @naamii-demo.test can sign in; they appear on the demo sign-in page." : ""}
        </p>
        <div className="mt-3 grid gap-x-5 gap-y-3.5 md:grid-cols-2">
          <div>
            <label htmlFor="user-name" className={LABEL}>Full name <span className="text-critical">*</span></label>
            <input id="user-name" name="name" required maxLength={200} defaultValue={user?.name} className={INPUT} autoComplete="off" />
          </div>
          <div>
            <label htmlFor="user-email" className={LABEL}>E-mail <span className="text-critical">*</span></label>
            <input id="user-email" name="email" type="email" required maxLength={254} defaultValue={user?.email} className={INPUT} autoComplete="off" placeholder="name@naamii.org.np" />
            {user?.entraBound ? <p className={HINT}>This account has already signed in with Microsoft and is linked to it.</p> : null}
          </div>
        </div>
      </fieldset>

      <fieldset className="mt-6 border-t border-cool-200 pt-5">
        <legend className="float-left mb-3 w-full text-[13.5px] font-semibold text-ink">Authority — what this person may see and do</legend>
        <div className="clear-both grid gap-2">
          {ROLES.map((r) => (
            <label key={r} className="flex cursor-pointer items-start gap-3 rounded-md border border-cool-200 px-3.5 py-2.5 has-[:checked]:border-ink has-[:checked]:bg-cool-100">
              <input type="radio" name="role" value={r} required defaultChecked={user?.role === r} className="mt-0.5 accent-[#454d59]" />
              <span>
                <span className="block text-[13px] font-semibold text-ink">{ROLE_LABEL[r]}</span>
                <span className="block text-[12.5px] text-grey">{ROLE_AUTHORITY[r]}</span>
              </span>
            </label>
          ))}
        </div>

        <div className="mt-4 grid gap-x-5 gap-y-3.5 md:grid-cols-2">
          <div>
            <label htmlFor="user-lab" className={LABEL}>Lab</label>
            <select id="user-lab" name="labId" defaultValue={user?.labId ?? ""} className={INPUT}>
              <option value="">— none —</option>
              {options.labs.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.code})</option>)}
            </select>
            <p className={HINT}>Required for a Principal Investigator (the lab they lead). Optional home lab for a Project Lead. Ignored for other roles.</p>
          </div>
        </div>

        <div className="mt-4">
          <p className={LABEL}>Projects (Project Lead only)</p>
          {options.projects.length === 0 ? <p className={HINT}>No projects exist yet. Assign projects after creating them under Data Entry.</p> : (
            <div className="grid gap-x-6 gap-y-3 rounded-md border border-cool-200 px-3.5 py-3 md:grid-cols-2 xl:grid-cols-3">
              {[...labs.entries()].map(([labName, projects]) => (
                <div key={labName}>
                  <p className="mb-1 text-[11.5px] font-semibold uppercase tracking-wide text-grey">{labName}</p>
                  {projects.map((p) => (
                    <label key={p.id} className="flex items-start gap-2 py-0.5 text-[13px] text-ink">
                      <input type="checkbox" name="projectIds" value={p.id} defaultChecked={user?.projectIds.includes(p.id)} className="mt-0.5 accent-[#454d59]" />
                      <span>{p.name} <span className="text-[12px] text-grey">{p.code}</span></span>
                    </label>
                  ))}
                </div>
              ))}
            </div>
          )}
          <p className={HINT}>A Project Lead sees and enters data only for the ticked projects. Ignored for other roles.</p>
        </div>
      </fieldset>

      <fieldset className="mt-6 border-t border-cool-200 pt-5">
        <legend className="float-left mb-2 w-full text-[13.5px] font-semibold text-ink">Access</legend>
        <label className="clear-both flex items-start gap-2 text-[13px] text-ink">
          <input type="checkbox" name="active" defaultChecked={user ? user.active : true} className="mt-0.5 accent-[#454d59]" />
          <span>Active — may sign in<span className="block text-[12px] text-grey">Untick to block sign-in immediately. The account and its history are kept; users are never deleted.{isSelf ? " You cannot deactivate or demote your own account." : ""}</span></span>
        </label>
      </fieldset>

      <div className="mt-6 flex items-center gap-3">
        <button type="submit" className="rounded-md bg-ink px-4 py-2 text-[13px] font-semibold text-white hover:bg-ink-700">{user ? "Save changes" : "Add user"}</button>
        <Link href="/admin/users" className="rounded-md border border-cool-300 bg-white px-4 py-2 text-[13px] font-medium text-ink hover:bg-cool-100">Cancel</Link>
      </div>
    </form>
  );
}
