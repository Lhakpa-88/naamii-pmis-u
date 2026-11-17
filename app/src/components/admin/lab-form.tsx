import Link from "next/link";
import { deleteLabAction, saveLabAction } from "@/lib/admin/lab-actions";
import type { LabAdminRow } from "@/lib/admin/labs";
import { ConfirmButton } from "@/components/entry/confirm-button";

const INPUT = "w-full rounded-md border border-cool-300 bg-white px-2.5 py-2 text-[13px] text-ink focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink";
const LABEL = "mb-1 block text-[12.5px] font-medium text-ink";
const HINT = "mt-1 text-[11.5px] leading-snug text-grey";

export function LabForm({ lab, pis }: { lab?: LabAdminRow; pis: { id: string; name: string }[] }) {
  return (
    <form action={saveLabAction} className="px-5 py-5">
      {lab ? <input type="hidden" name="id" value={lab.id} /> : null}
      <div className="grid gap-x-5 gap-y-3.5 md:grid-cols-2">
        <div>
          <label htmlFor="lab-name" className={LABEL}>Lab name <span className="text-critical">*</span></label>
          <input id="lab-name" name="name" required maxLength={200} defaultValue={lab?.name} className={INPUT} autoComplete="off" />
          <p className={HINT}>Shown on dashboards and in every lab list. Renaming it changes it everywhere.</p>
        </div>
        <div>
          <label htmlFor="lab-code" className={LABEL}>Lab code <span className="text-critical">*</span></label>
          <input id="lab-code" name="code" required maxLength={20} pattern="[A-Za-z0-9][A-Za-z0-9\- ]{1,19}" defaultValue={lab?.code} className={INPUT} autoComplete="off" placeholder="e.g. AIM" />
          <p className={HINT}>Short unique code, 2–20 letters, digits or hyphens. Used in the “Lab code” column of the Excel template.</p>
        </div>
        <div>
          <label htmlFor="lab-pi" className={LABEL}>Principal Investigator</label>
          <select id="lab-pi" name="piUserId" defaultValue={lab?.piUserId ?? ""} className={INPUT}>
            <option value="">— none yet —</option>
            {lab?.piUserId && !pis.some((p) => p.id === lab.piUserId) ? <option value={lab.piUserId}>{lab.piName ?? "Current PI"}</option> : null}
            {pis.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <p className={HINT}>Optional. The chosen PI sees this lab’s projects. Add the person under Users &amp; Roles first if they are not listed.</p>
        </div>
      </div>

      <label className="mt-5 flex items-start gap-2 text-[13px] text-ink">
        <input type="checkbox" name="active" defaultChecked={lab ? lab.active : true} className="mt-0.5 accent-[#454d59]" />
        <span>Active<span className="block text-[12px] text-grey">Untick to retire the lab: it is no longer offered for new projects or users and leaves the Labs dashboard, but its projects and history are kept.</span></span>
      </label>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button type="submit" className="rounded-md bg-ink px-4 py-2 text-[13px] font-semibold text-white hover:bg-ink-700">{lab ? "Save changes" : "Add lab"}</button>
        <Link href="/admin/labs" className="rounded-md border border-cool-300 bg-white px-4 py-2 text-[13px] font-medium text-ink hover:bg-cool-100">Cancel</Link>
        {lab ? (
          <span className="ml-auto flex items-center gap-3">
            {lab.projects > 0 ? <span className="text-[12px] text-grey">Has {lab.projects} project{lab.projects === 1 ? "" : "s"} — cannot be deleted; retire it instead.</span> : (
              <ConfirmButton action={deleteLabAction} message={`Delete ${lab.name}? This cannot be undone.${lab.people ? ` ${lab.people} user${lab.people === 1 ? "" : "s"} will no longer be linked to a lab.` : ""}`}
                className="rounded-md border border-critical/40 px-4 py-2 text-[13px] font-medium text-critical hover:bg-critical/5">Delete lab</ConfirmButton>
            )}
          </span>
        ) : null}
      </div>
    </form>
  );
}
