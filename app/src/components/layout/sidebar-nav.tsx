"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavItem } from "@naamii/core";

export function SidebarNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const sections = Array.from(new Set(items.map((i) => i.section ?? "Dashboard")));
  return (
    <nav aria-label="Main" className="flex flex-col gap-5">
      {sections.map((section) => (
        <div key={section}>
          <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-cool">{section}</p>
          <ul className="flex flex-col gap-0.5">
            {items.filter((i) => (i.section ?? "Dashboard") === section).map((item) => {
              const active = item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`block rounded-md px-3 py-2 text-[13.5px] transition-colors ${active ? "bg-white/12 font-semibold text-white" : "text-white/80 hover:bg-white/8 hover:text-white"}`}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
