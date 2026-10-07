import { requireUser } from "@/lib/auth/current-user";
import { withUser } from "@/lib/db";
import { loadFreshness } from "@/lib/data/portfolio";
import { env } from "@/lib/env";
import { AppShell } from "@/components/layout/app-shell";

export default async function DashboardLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const freshness = await withUser(user.id, (q) => loadFreshness(q));
  return (
    <AppShell user={user} freshness={freshness} demo={env.authMode === "demo" && env.demoBanner}>
      {children}
    </AppShell>
  );
}
