import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/current-user";
import { withUser } from "@/lib/db";
import { loadFreshness } from "@/lib/data/portfolio";
import { env } from "@/lib/env";
import { AppShell } from "@/components/layout/app-shell";

export default async function DashboardLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  // A password handed out by an administrator must be replaced before anything else is shown.
  if (user.mustChangePassword) redirect("/account/password");
  const freshness = await withUser(user.id, (q) => loadFreshness(q));
  return (
    <AppShell user={user} freshness={freshness} demo={env.demoBanner} canChangePassword={env.authMode === "password"}>
      {children}
    </AppShell>
  );
}
