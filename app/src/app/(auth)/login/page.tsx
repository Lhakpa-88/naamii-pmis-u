import { redirect } from "next/navigation";
import { ROLE_LABEL, type Role } from "@naamii/core";
import { signInAsDemo, signInForDevelopment, signInWithPassword } from "@/lib/auth/actions";
import { getCurrentUser } from "@/lib/auth/current-user";
import { anonymousQuery } from "@/lib/db";
import { env } from "@/lib/env";
import { DemoBanner } from "@/components/layout/app-shell";
import { NaamiiLogo } from "@/components/ui/logo";

export const metadata = { title: "Sign in" };

interface DemoAccount { id: string; email: string; name: string; role: Role; lab_name: string | null }

const INPUT = "w-full rounded-md border border-cool-300 bg-white px-3 py-2.5 text-[14px] text-ink focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink";

const ERRORS: Record<string, string> = {
  invalid: "The user ID or password is not correct.",
  missing: "Enter your user ID and your password.",
  "missing-id": "Enter a user ID.",
  "unknown-id": "That user ID is not known. Use Admin, PI, PM or ED — or the e-mail address of an active user.",
  locked: "Too many wrong passwords. This account is locked for 15 minutes; after that, try again or ask Finance & Operations to reset your password.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const user = await getCurrentUser();
  if (user) redirect("/");
  const params = await searchParams;
  const reason = typeof params.reason === "string" ? params.reason : undefined;
  const error = typeof params.error === "string" ? ERRORS[params.error] : undefined;

  const mode = env.authMode;
  const devAccounts = mode === "dev" ? (await anonymousQuery<{ shortcut: string; name: string; role: Role }>("SELECT shortcut, name, role FROM app.dev_accounts()")).rows : [];
  const accounts = mode === "demo" ? (await anonymousQuery<DemoAccount>("SELECT id, email, name, role, lab_name FROM app.demo_accounts()")).rows : [];

  return (
    <div className="flex min-h-screen flex-col bg-cool-100">
      {env.demoBanner ? <DemoBanner /> : null}
      <div className="flex flex-1 items-center justify-center px-6 py-10">
        <div className={`w-full ${mode === "demo" ? "max-w-lg" : "max-w-md"}`}>
          {/* Brand block: the full-colour logo on white (brand contrast rule), over a Dark Blue Grey title strip */}
          <div className="rounded-t-card border border-b-0 border-cool-200 bg-white px-8 pb-5 pt-7">
            <NaamiiLogo width={260} priority />
          </div>
          <div className="bg-ink px-8 py-3 text-white">
            <p className="text-[13.5px] font-medium">Project Management Information System <span className="ml-1 text-[12px] uppercase tracking-widest text-white/70">PMIS</span></p>
          </div>
          <div className="rounded-b-card border border-t-0 border-cool-200 bg-white px-8 py-7">
            {mode === "password" ? (
              <>
                <h1 className="text-[17px] font-semibold text-ink">Sign in</h1>
                <p className="mt-1 text-[13px] text-grey">Use the user ID and password given to you by Finance &amp; Operations.</p>
                {error ? <p role="alert" className="mt-4 rounded-md border border-critical/30 bg-critical/5 px-3 py-2 text-[13px] text-critical">{error}</p> : null}
                <form action={signInWithPassword} className="mt-5 flex flex-col gap-4">
                  <div>
                    <label htmlFor="login-user" className="mb-1 block text-[13px] font-medium text-ink">User ID</label>
                    <input id="login-user" name="userId" type="email" required autoFocus autoComplete="username" maxLength={254} placeholder="your e-mail address" className={INPUT} />
                  </div>
                  <div>
                    <label htmlFor="login-password" className="mb-1 block text-[13px] font-medium text-ink">Password</label>
                    <input id="login-password" name="password" type="password" required autoComplete="current-password" maxLength={200} className={INPUT} />
                  </div>
                  <button type="submit" className="mt-1 rounded-md bg-brand px-5 py-2.5 text-[14px] font-semibold text-white hover:bg-[#b80404]">Sign in</button>
                </form>
                <p className="mt-5 text-[12.5px] text-grey">Forgot your password, or no account yet? Ask Finance &amp; Operations — they can reset it or add you.</p>
              </>
            ) : mode === "dev" ? (
              <>
                <h1 className="text-[17px] font-semibold text-ink">Sign in</h1>
                <p className="mt-1 rounded-md border border-warning/40 bg-[#fff6e5] px-3 py-2 text-[12.5px] text-[#7a4f00]">Development and testing sign-in — no password is asked. Not for real data; switch to password sign-in before going live.</p>
                {error ? <p role="alert" className="mt-4 rounded-md border border-critical/30 bg-critical/5 px-3 py-2 text-[13px] text-critical">{error}</p> : null}
                <form action={signInForDevelopment} className="mt-5 flex flex-col gap-4">
                  <div>
                    <label htmlFor="login-user" className="mb-1 block text-[13px] font-medium text-ink">User ID</label>
                    <input id="login-user" name="userId" type="text" required autoFocus autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={254} placeholder="Admin, PI, PM or ED" className={INPUT} />
                  </div>
                  <button type="submit" className="mt-1 rounded-md bg-brand px-5 py-2.5 text-[14px] font-semibold text-white hover:bg-[#b80404]">Sign in</button>
                </form>
                <table className="mt-5 w-full text-[12.5px]">
                  <thead className="text-left text-[11px] uppercase tracking-wide text-grey"><tr><th className="py-1 font-semibold">User ID</th><th className="py-1 font-semibold">Signs in as</th></tr></thead>
                  <tbody>
                    {(["Admin", "PI", "PM", "ED"] as const).map((id) => {
                      const a = devAccounts.find((d) => d.shortcut === id);
                      return (
                        <tr key={id} className="border-t border-cool-200">
                          <td className="py-1.5 font-semibold text-ink">{id}</td>
                          <td className="py-1.5 text-grey">{a ? <>{ROLE_LABEL[a.role]} <span className="text-cool">· {a.name}</span></> : "no active account with this role yet"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <p className="mt-3 text-[12px] text-grey">The user ID is not case-sensitive. To try a specific person, type their e-mail address instead.</p>
              </>
            ) : mode === "demo" ? (
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
