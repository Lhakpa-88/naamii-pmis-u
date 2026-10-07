"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { Health, ProjectStatus } from "@naamii/core";
import { formatDate, formatMoney, formatPct, labelFor } from "@/lib/format";
import { HealthBadge, StatusBadge } from "./ui/badges";

export interface PortfolioRowDto {
  id: string; code: string; name: string; labId: string; labName: string; piName: string | null;
  leadName: string | null; funder: string | null; currency: string; budget: number; actual: number;
  utilization: number | null; startDate: string | null; endDate: string | null; status: ProjectStatus;
  health: Health; atRisk: boolean;
}

type SortKey = "name" | "labName" | "piName" | "leadName" | "funder" | "budget" | "actual" | "utilization" | "startDate" | "endDate" | "status" | "health";

const HEALTH_RANK: Record<Health, number> = { critical: 0, warning: 1, good: 2, unknown: 3 };

function compare(a: PortfolioRowDto, b: PortfolioRowDto, key: SortKey): number {
  if (key === "health") return HEALTH_RANK[a.health] - HEALTH_RANK[b.health];
  const av = a[key], bv = b[key];
  if (av === null || av === undefined) return 1;
  if (bv === null || bv === undefined) return -1;
  if (typeof av === "number" && typeof bv === "number") return av - bv;
  return String(av).localeCompare(String(bv));
}

function uniq(values: (string | null)[]): string[] {
  return Array.from(new Set(values.filter((v): v is string => !!v))).sort();
}

/**
 * Sortable, filterable portfolio table. Filter options are derived from the
 * rows the server already filtered by Row Level Security, so a PI's "Lab"
 * filter can only ever list their own lab.
 */
export function PortfolioTable({ rows, showLab = true, compact = false }: { rows: PortfolioRowDto[]; showLab?: boolean; compact?: boolean }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "health", dir: 1 });
  const [q, setQ] = useState("");
  const [lab, setLab] = useState("");
  const [status, setStatus] = useState("");
  const [funder, setFunder] = useState("");
  const [lead, setLead] = useState("");
  const [pi, setPi] = useState("");

  const options = useMemo(() => ({
    labs: uniq(rows.map((r) => r.labName)),
    statuses: uniq(rows.map((r) => r.status)),
    funders: uniq(rows.map((r) => r.funder)),
    leads: uniq(rows.map((r) => r.leadName)),
    pis: uniq(rows.map((r) => r.piName)),
  }), [rows]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows
      .filter((r) => !needle || r.name.toLowerCase().includes(needle) || r.code.toLowerCase().includes(needle))
      .filter((r) => !lab || r.labName === lab)
      .filter((r) => !status || r.status === status)
      .filter((r) => !funder || r.funder === funder)
      .filter((r) => !lead || r.leadName === lead)
      .filter((r) => !pi || r.piName === pi)
      .sort((a, b) => compare(a, b, sort.key) * sort.dir);
  }, [rows, q, lab, status, funder, lead, pi, sort]);

  const toggle = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: 1 }));

  const Th = ({ k, children, align = "left" }: { k: SortKey; children: React.ReactNode; align?: "left" | "right" }) => (
    <th scope="col" className={`whitespace-nowrap px-3 py-2 text-[11.5px] font-semibold uppercase tracking-wide text-grey ${align === "right" ? "text-right" : "text-left"}`}>
      <button type="button" onClick={() => toggle(k)} className="inline-flex items-center gap-1 hover:text-ink" aria-sort={sort.key === k ? (sort.dir === 1 ? "ascending" : "descending") : undefined}>
        {children}
        <span aria-hidden className="text-[9px] text-cool">{sort.key === k ? (sort.dir === 1 ? "▲" : "▼") : "⇅"}</span>
      </button>
    </th>
  );

  const select = (value: string, onChange: (v: string) => void, label: string, opts: string[], display: (o: string) => string = (o) => o) => (
    <label className="flex items-center gap-1.5 text-[12.5px] text-grey">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="rounded-md border border-cool-300 bg-white px-2 py-1 text-[12.5px] text-ink">
        <option value="">All</option>
        {opts.map((o) => <option key={o} value={o}>{display(o)}</option>)}
      </select>
    </label>
  );

  return (
    <div>
      {!compact ? (
        <div className="flex flex-wrap items-center gap-3 border-b border-cool-200 px-5 py-3">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search project or code" aria-label="Search projects" className="w-56 rounded-md border border-cool-300 px-2.5 py-1.5 text-[13px] placeholder:text-cool" />
          {showLab && options.labs.length > 1 ? select(lab, setLab, "Lab", options.labs) : null}
          {select(status, setStatus, "Status", options.statuses, labelFor)}
          {options.pis.length > 1 ? select(pi, setPi, "PI", options.pis) : null}
          {options.leads.length > 1 ? select(lead, setLead, "Lead", options.leads) : null}
          {options.funders.length > 1 ? select(funder, setFunder, "Funder", options.funders) : null}
          <span className="ml-auto text-[12.5px] text-grey">{filtered.length} of {rows.length} projects</span>
        </div>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1180px] border-collapse text-[13px]">
          <thead className="bg-cool-100">
            <tr>
              <Th k="name">Project</Th>
              {showLab ? <Th k="labName">Lab</Th> : null}
              <Th k="piName">PI</Th>
              <Th k="leadName">Project lead</Th>
              <Th k="funder">Funder</Th>
              <Th k="budget" align="right">Budget</Th>
              <Th k="actual" align="right">Actual</Th>
              <Th k="utilization" align="right">Utilisation</Th>
              <Th k="startDate">Start</Th>
              <Th k="endDate">End</Th>
              <Th k="status">Status</Th>
              <Th k="health">Health</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={12} className="px-3 py-8 text-center text-grey">No projects match the current filters.</td></tr>
            ) : filtered.map((r) => (
              <tr key={r.id} className="border-t border-cool-200 hover:bg-cool-100/60">
                <td className="min-w-[260px] px-3 py-2.5">
                  <Link href={`/projects/${r.id}`} className="font-medium text-ink hover:underline">{r.name}</Link>
                  <div className="text-[11.5px] text-grey">{r.code}</div>
                </td>
                {showLab ? <td className="px-3 py-2.5"><Link href={`/labs/${r.labId}`} className="hover:underline">{r.labName}</Link></td> : null}
                <td className="whitespace-nowrap px-3 py-2.5">{r.piName ?? "—"}</td>
                <td className="whitespace-nowrap px-3 py-2.5">{r.leadName ?? "—"}</td>
                <td className="px-3 py-2.5 text-grey">{r.funder ?? "—"}</td>
                <td className="tnum whitespace-nowrap px-3 py-2.5 text-right">{formatMoney(r.budget, r.currency, { compact: true })}</td>
                <td className="tnum whitespace-nowrap px-3 py-2.5 text-right">{formatMoney(r.actual, r.currency, { compact: true })}</td>
                <td className="px-3 py-2.5 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <span className="tnum">{formatPct(r.utilization)}</span>
                    <span className="h-1.5 w-16 overflow-hidden rounded bg-cool-200" aria-hidden>
                      <span className={`block h-full ${r.utilization !== null && r.utilization >= 100 ? "bg-critical" : r.utilization !== null && r.utilization >= 85 ? "bg-warning" : "bg-ink"}`} style={{ width: `${Math.min(100, r.utilization ?? 0)}%` }} />
                    </span>
                  </div>
                </td>
                <td className="tnum whitespace-nowrap px-3 py-2.5">{formatDate(r.startDate)}</td>
                <td className="tnum whitespace-nowrap px-3 py-2.5">{formatDate(r.endDate)}</td>
                <td className="px-3 py-2.5"><StatusBadge status={r.status} /></td>
                <td className="whitespace-nowrap px-3 py-2.5"><HealthBadge health={r.health} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
