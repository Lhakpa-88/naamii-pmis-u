import type { ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-card border border-cool-200 bg-white ${className}`}>{children}</section>;
}

export function CardHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <header className="flex items-start justify-between gap-4 border-b border-cool-200 px-5 py-4">
      <div>
        <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-[13px] text-grey">{subtitle}</p> : null}
      </div>
      {action}
    </header>
  );
}

export function CardBody({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`px-5 py-4 ${className}`}>{children}</div>;
}
