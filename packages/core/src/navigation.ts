/**
 * Role-aware navigation model (business rule, not UI).
 * The sidebar renders exactly what this returns; the same role check is
 * enforced again on the server for every route and at the database by RLS.
 */
import type { Role } from "./types.js";

export interface NavItem {
  label: string;
  href: string;
  /** Optional grouping shown as a section heading. */
  section?: "Dashboard" | "Administration";
}

export const ROLE_LABEL: Record<Role, string> = {
  ed: "Executive Director",
  pi: "Principal Investigator",
  project_lead: "Project Lead",
  admin: "Finance & Operations",
};

/** Where a signed-in user lands. The overview route itself is role-scoped. */
export function landingPathFor(_role: Role): string {
  return "/";
}

export function navItemsFor(role: Role): NavItem[] {
  switch (role) {
    case "ed":
      return [
        { label: "Executive Overview", href: "/", section: "Dashboard" },
        { label: "Labs", href: "/labs", section: "Dashboard" },
        { label: "Projects", href: "/projects", section: "Dashboard" },
      ];
    case "pi":
      return [
        { label: "My Lab", href: "/", section: "Dashboard" },
        { label: "My Projects", href: "/projects", section: "Dashboard" },
      ];
    case "project_lead":
      return [
        { label: "My Project", href: "/", section: "Dashboard" },
        { label: "My Projects", href: "/projects", section: "Dashboard" },
      ];
    case "admin":
      return [
        { label: "Executive Overview", href: "/", section: "Dashboard" },
        { label: "Labs", href: "/labs", section: "Dashboard" },
        { label: "Projects", href: "/projects", section: "Dashboard" },
        { label: "Data Imports", href: "/admin/data", section: "Administration" },
        { label: "Data Quality", href: "/admin/data-quality", section: "Administration" },
        { label: "Users & Roles", href: "/admin/users", section: "Administration" },
        { label: "Column Mappings", href: "/admin/mappings", section: "Administration" },
      ];
  }
}

export function canAccessAdmin(role: Role): boolean {
  return role === "admin";
}

/** Org-wide roles see every lab and project. */
export function isOrgWide(role: Role): boolean {
  return role === "ed" || role === "admin";
}

/** Title of the overview page per role. */
export function overviewTitleFor(role: Role): string {
  switch (role) {
    case "ed":
    case "admin":
      return "Executive Overview";
    case "pi":
      return "My Lab";
    case "project_lead":
      return "My Project";
  }
}
