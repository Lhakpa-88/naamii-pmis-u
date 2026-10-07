import { redirect } from "next/navigation";
import { ROLE_LABEL, type Role } from "@naamii/core";
import { signInAsDemo } from "@/lib/auth/actions";
import { getCurrentUser } from "@/lib/auth/current-user";
import { anonymousQuery } from "@/lib/db";
import { env } from "@/lib/env";
import { DemoBanner } from "@/components/layout/app-shell";

export const metadata = { title: "Sign in" };

interface DemoAccount { id: string; email: string; name: string; role: Role; lab_name: string | null }

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const user = await getCurrentUser();
  if (user) redirect("/");
  const params = await searchParams;
  const reason = typeof params.reason === "string" ? params.reason : undefined;

  const demo = env.authMode === "demo";
  const accounts = demo ? (await anonymousQuery<DemoAccount>("SELECT id, email, name, role, lab_name FROM app.demo_accounts()")).rows : [];

  return (
    <div className="flex min-h-screen flex-col bg-cool-100">
      {demo && env.demoBanner ? <DemoBanner /> : null}
      <div className="flex flex-1 items-center justify-center px-6 py-10">
        <div className="w-full max-w-lg">
          {/* Brand block: Dark Blue Grey → white text (brand contrast rule); reverse logotype goes here */}
          <div className="rounded-t-card bg-ink px-8 py-7 text-white">
            <div className="flex items-baseline gap-2">
              <span className="text-[26px] font-bold tracking-tight">NAAMII</span>
              <span className="text-[13px] font-medium uppercase tracking-widest text-white/70">PMIS</span>
            </div>
            <p className="mt-1 text-[13.5px] text-white/80">Project Management Information System</p>
          </div>
          <div className="rounded-b-card border border-t-0 border-cool-200 bg-white px-8 py-7">
            {demo ? (
              <>
                <h1 className="text-[17px] font-semibold text-ink">Demo Mode — choose a role to explore</h1>
                <p className="mt-1 text-[13px] text-grey">Each account sees only what its role allows. Switch accounts to see the same data filtered differently.</p>
                <ul className="mt-5 flex flex-col gap-2">
                  {accounts.map((a) => (
                    <li key={a.id}>
                      <form action={signInAsDemo}>
                        <input type="hidden" name="userId" value={a.id} />
                        <button type="submit" className="flex w-full items-center justify-between rounded-md border border-cool-200 px-4 py-3 text-left hover:border-ink hover:bg-cool-100">
                          <span>
                            <span className="block text-[14px] font-semibold text-ink">{a.name}</span>
                            <span className="block text-[12px] text-grey">{ROLE_LABEL[a.role]}{a.lab_name ? ` · ${a.lab_name}` : ""}</span>
                          </span>
                          <span className="text-[12.5px] font-semibold text-brand">Sign in →</span>
                        </button>
                      </form>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <>
                <h1 className="text-[17px] font-semibold text-ink">Sign in with your NAAMII account</h1>
                <p className="mt-1 text-[13px] text-grey">Single sign-on through Microsoft Entra ID. Your role and labs are assigned by Finance &amp; Operations.</p>
                {reason === "unmapped" ? (
                  <p className="mt-4 rounded-md border border-warning/40 bg-[#fff6e5] px-3 py-2 text-[13px] text-[#7a4f00]">You signed in, but this account hasn’t been given a PMIS role yet. Please contact Finance &amp; Operations.</p>
                ) : null}
                <a href="/.auth/login/aad?post_login_redirect_uri=/" className="mt-5 inline-block rounded-md bg-brand px-5 py-2.5 text-[13.5px] font-semibold text-white hover:bg-[#b80404]">Sign in with Microsoft</a>
              </>
            )}
          </div>
          <p className="mt-4 text-center text-[11.5px] text-grey">Access is enforced in the database, not just on screen: a URL cannot reveal another lab’s project.</p>
        </div>
      </div>
    </div>
  );
}
