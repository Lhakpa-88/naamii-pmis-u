import type { ReactNode } from "react";
import Link from "next/link";

export interface Crumb { label: string; href?: string }

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="text-[12.5px] text-grey">
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((c, i) => (
          <li key={i} className="flex items-center gap-1">
            {i > 0 ? <span aria-hidden className="text-cool">/</span> : null}
            {c.href ? <Link href={c.href} className="hover:text-ink hover:underline">{c.label}</Link> : <span className="text-ink">{c.label}</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function PageHeader({ title, subtitle, crumbs, actions }: { title: string; subtitle?: ReactNode; crumbs?: Crumb[]; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        {crumbs ? <div className="mb-1.5"><Breadcrumbs items={crumbs} /></div> : null}
        <h1 className="text-[22px] font-semibold leading-tight text-ink">{title}</h1>
        {subtitle ? <div className="mt-1 text-[13px] text-grey">{subtitle}</div> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({ title, body }: { title: string; body?: string }) {
  return (
    <div className="rounded-card border border-dashed border-cool-300 bg-white px-6 py-10 text-center">
      <p className="text-[15px] font-medium text-ink">{title}</p>
      {body ? <p className="mt-1 text-[13px] text-grey">{body}</p> : null}
    </div>
  );
}
