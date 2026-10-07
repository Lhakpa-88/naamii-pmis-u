import type { ReactNode } from "react";
import Link from "next/link";
import { ROLE_LABEL, navItemsFor, type CurrentUser } from "@naamii/core";
import { signOut } from "@/lib/auth/actions";
import { formatDateTime } from "@/lib/format";
import type { Freshness } from "@/lib/data/portfolio";
import { SidebarNav } from "./sidebar-nav";

export function DemoBanner() {
  return (
    <div role="status" className="border-b border-warning/40 bg-[#fff6e5] px-4 py-1.5 text-center text-[12.5px] font-medium text-[#7a4f00]">
      DEMO DATA — every lab, person, project and figure shown is fictional and clearly labelled “DEMO”. Not NAAMII’s real information.
    </div>
  );
}

export function AppShell({ user, freshness, demo, children }: { user: CurrentUser; freshness: Freshness; demo: boolean; children: ReactNode }) {
  const items = navItemsFor(user.role);
  return (
    <div className="flex min-h-screen">
      {/* Sidebar: Dark Blue Grey background → white text (brand contrast rule) */}
      <aside className="hidden w-60 shrink-0 flex-col bg-ink px-3 py-5 text-white md:flex">
        <Link href="/" className="mb-7 flex items-baseline gap-2 px-3" aria-label="NAAMII PMIS home">
          {/* Logo placeholder: the white (reverse) logotype goes here on the Dark Blue Grey background. */}
          <span className="text-[20px] font-bold tracking-tight">NAAMII</span>
          <span className="text-[12px] font-medium uppercase tracking-widest text-white/70">PMIS</span>
        </Link>
        <SidebarNav items={items} />
        <div className="mt-auto px-3 pt-6 text-[11px] leading-relaxed text-white/55">
          Project Management Information System
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {demo ? <DemoBanner /> : null}
        <header className="flex items-center justify-between gap-4 border-b border-cool-200 bg-white px-6 py-3">
          <div className="text-[12.5px] text-grey">
            <span className="font-medium text-ink">Data last updated:</span>{" "}
            <span className="tnum">{formatDateTime(freshness.lastSuccessfulSync)}</span>
            {freshness.lastRunStatus && freshness.lastRunStatus !== "success" ? (
              <span className="ml-2 rounded-full bg-warning/15 px-2 py-0.5 text-[11.5px] font-medium text-warning">last run: {freshness.lastRunStatus}</span>
            ) : null}
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right leading-tight">
              <p className="text-[13px] font-semibold text-ink">{user.name}</p>
              <p className="text-[11.5px] text-grey">{ROLE_LABEL[user.role]}</p>
            </div>
            <form action={signOut}>
              <button type="submit" className="rounded-md border border-cool-300 px-3 py-1.5 text-[12.5px] font-medium text-ink hover:bg-cool-100">
                Sign out
              </button>
            </form>
          </div>
        </header>
        <main className="flex-1 px-6 py-6">{children}</main>
        <footer className="px-6 py-3 text-[11.5px] text-grey">
          NAAMII PMIS · management information derived from source project workbooks — not an accounting system.
        </footer>
      </div>
    </div>
  );
}
