import Link from "next/link";
import { redirect } from "next/navigation";
import { changePasswordAction, signOut } from "@/lib/auth/actions";
import { requireUser } from "@/lib/auth/current-user";
import { PASSWORD_RULE } from "@/lib/auth/passwords";
import { env } from "@/lib/env";
import { NaamiiLogo } from "@/components/ui/logo";

export const metadata = { title: "Change password" };

const INPUT = "w-full rounded-md border border-cool-300 bg-white px-3 py-2.5 text-[14px] text-ink focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink";
const LABEL = "mb-1 block text-[13px] font-medium text-ink";

export default async function ChangePasswordPage({ searchParams }: PageProps<"/account/password">) {
  const user = await requireUser();
  if (env.authMode !== "password") redirect("/");
  const { err } = (await searchParams) as { err?: string };
  const forced = user.mustChangePassword === true;
  return (
    <div className="flex min-h-screen items-center justify-center bg-cool-100 px-6 py-10">
      <div className="w-full max-w-md">
        <div className="rounded-t-card border border-b-0 border-cool-200 bg-white px-8 pb-5 pt-7"><NaamiiLogo width={220} priority /></div>
        <div className="bg-ink px-8 py-3 text-[13.5px] font-medium text-white">{forced ? "Choose your own password" : "Change password"}</div>
        <div className="rounded-b-card border border-t-0 border-cool-200 bg-white px-8 py-7">
          <p className="text-[13px] text-grey">
            Signed in as <span className="font-medium text-ink">{user.name}</span> ({user.email}).
            {forced ? " Your password was set by Finance & Operations. Before you continue, replace it with one only you know." : ""}
          </p>
          {err ? <p role="alert" className="mt-4 rounded-md border border-critical/30 bg-critical/5 px-3 py-2 text-[13px] text-critical">{err}</p> : null}
          <form action={changePasswordAction} className="mt-5 flex flex-col gap-4">
            <div>
              <label htmlFor="pw-current" className={LABEL}>{forced ? "Password you were given" : "Current password"}</label>
              <input id="pw-current" name="current" type="password" required autoFocus autoComplete="current-password" maxLength={200} className={INPUT} />
            </div>
            <div>
              <label htmlFor="pw-next" className={LABEL}>New password</label>
              <input id="pw-next" name="next" type="password" required minLength={8} maxLength={72} autoComplete="new-password" className={INPUT} />
              <p className="mt-1 text-[12px] text-grey">{PASSWORD_RULE}</p>
            </div>
            <div>
              <label htmlFor="pw-confirm" className={LABEL}>New password again</label>
              <input id="pw-confirm" name="confirm" type="password" required minLength={8} maxLength={72} autoComplete="new-password" className={INPUT} />
            </div>
            <button type="submit" className="mt-1 rounded-md bg-ink px-5 py-2.5 text-[14px] font-semibold text-white hover:bg-ink-700">Save new password</button>
          </form>
          <div className="mt-5 flex items-center justify-between text-[12.5px]">
            {forced ? <span /> : <Link href="/" className="text-ink underline decoration-cool-300 underline-offset-2">Back to PMIS</Link>}
            <form action={signOut}><button type="submit" className="text-grey underline decoration-cool-300 underline-offset-2 hover:text-ink">Sign out</button></form>
          </div>
        </div>
      </div>
    </div>
  );
}
