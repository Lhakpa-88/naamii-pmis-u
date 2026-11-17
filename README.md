# NAAMII PMIS — Project Management Information System

Role-based project portfolio and financial dashboard for NAAMII. The same data produces different,
role-appropriate views for the Executive Director, Principal Investigators, Project Leads and
Finance & Operations — enforced in the database with PostgreSQL Row Level Security, not just on screen.

> **Phase 0 (this release): Foundation & Demo Mode.** Database schema + row security, centralised
> calculations, the Executive / Lab / Project dashboards, Admin read-only pages, and the authorization
> test suite — all running on clearly-labelled **fictional demo data**. OneDrive sync, Entra sign-in
> wiring and admin editing follow in Phases 2–3.

## Quick start (local, no Docker needed)

Prerequisites: Node 20+ and PostgreSQL 16 binaries (`sudo apt install postgresql-16` on Ubuntu;
`brew install postgresql@16` on macOS). No real NAAMII data is used.

```bash
npm install
cp .env.example .env            # defaults work locally; set SESSION_SECRET to any long random string
npm run db:start                # starts a throw-away PostgreSQL on 127.0.0.1:5433
npm run db:reset                # creates the database, applies migrations, seeds DEMO data
npm run build -w @naamii/core   # shared calculations package
npm run dev                     # http://localhost:3000
```

Sign in with a **user ID (the account’s e-mail) and password** (`PMIS_AUTH_MODE=password`, the default).
The demo accounts all share the demo password written at the end of `db/seed/demo.sql`:

| User ID | Role | What they see |
| --- | --- | --- |
| `ed.demo@naamii-demo.test` | ED | Everything, read-only, compensation visible |
| `pi.aim.demo@naamii-demo.test` | PI, AI & Mathematics Lab | Only that lab’s projects |
| `pi.csl.demo@naamii-demo.test` | PI, Computational Science Lab | Only that lab’s projects |
| `lead.alpha.demo@naamii-demo.test` | Project Lead | Project Alpha only |
| `lead.gamma.demo@naamii-demo.test` | Project Lead | Project Gamma only |
| `admin.demo@naamii-demo.test` | Admin | Everything + Administration pages |

**Passwords.** Only a salted bcrypt hash is stored, in a table the web application’s database role
cannot read (`db/migrations/0009_password_login.sql`). Finance & Operations sets a person’s first
password (and resets a forgotten one) under Users & Roles; the person must replace it at first sign-in
and can change it later from the header. Five wrong passwords lock an account for 15 minutes; a reset
unlocks it. Sessions last 8 hours. For the very first administrator of a real installation:
`PMIS_NEW_PASSWORD=… npm run db:set-password -- <e-mail>`.

**Development sign-in.** While the system is being developed and tested, set `PMIS_AUTH_MODE=dev` in
`.env`: the sign-in page then asks only for a user ID — `Admin`, `PI`, `PM` or `ED` (the first active
account of that role), or any active user's e-mail — and **no password**. The app refuses to start in
this mode with `NODE_ENV=production`. Switch back to `password` before real data or real users.

Other modes: `PMIS_AUTH_MODE=demo` (pick a demo account, no password — local demos only) and
`PMIS_AUTH_MODE=entra` (Microsoft Entra single sign-on on Azure App Service).

Try it: sign in as the AI & Mathematics PI and open `/projects/30000000-0000-4000-8000-000000000003`
(Project Gamma, another lab). You get “not available” — the database returned no row.

## Data entry

Data reaches PMIS in two ways, both under **Data Entry** in the sidebar:

1. **Import from Excel** — download the template (`/data-entry/template`; add `?data=1` to have current
   records filled in), complete it in Excel and upload it. "Check file" validates without saving; "Import"
   saves **all rows or none** and lists every problem by sheet, row and column. Re-importing is safe: rows
   are matched on their natural key (project code, project + month, project + milestone …) and updated.
2. **Forms** — `/projects/<id>/edit` (the "Enter data" button on a project) and `/data-entry/projects/new`.

Two entry points, enforced in the database (`db/migrations/0006_data_entry.sql`, `0007_lead_forecast.sql`):

| Data | Finance & Operations (`admin`) | Project Lead (`project_lead`) |
| --- | --- | --- |
| Projects (master record, budget, people) | enters | view only |
| Monthly budget, actual, committed | enters | view only |
| Monthly forecast | enters | enters, own projects only |
| Milestones, Risks, Team | enters | enters, own projects only |
| Staff monthly cost | enters | hidden |

The Executive Director and PIs stay read-only. Every field is defined once in
`packages/core/src/entry.ts`; the template, the importer and the forms are all generated from it.
Every change is written to `audit_log`; uploads are listed under Administration → Data Imports.

## User management

Finance & Operations (the `admin` role) administers the system under **Administration → Users & Roles**:
"Add user" creates an account, "Edit" changes it. An account has two parts:

- **Identity (authentication)** — name and e-mail. PMIS stores no passwords: the person signs in with
  Microsoft Entra ID and is matched by e-mail. In Demo Mode, accounts added on `@naamii-demo.test`
  appear on the demo sign-in page.
- **Authority (authorization)** — the role, the lab a PI leads, and the projects a Project Lead may see
  and enter data for. Unticking "Active" blocks sign-in at once; users are never deleted.

Only the admin role can write to `users`, `pi_lab` and `project_assignments` (Row Level Security), an
administrator cannot demote or deactivate their own account, and the last active administrator cannot
be removed (`db/migrations/0008_user_management.sql`). Every change appears under "Recent changes".

## Lab management

Labs are data, not code. Under **Administration → Manage Labs** Finance & Operations can add a lab,
rename it, change its code or PI, retire it (untick "Active") or delete it. Every lab pick-list — the
project form, the user form and the Lists sheet of the Excel template — reads the `labs` table, so a
change shows up everywhere at once. A lab that still has projects cannot be deleted; retire it instead.
Deleting a lab keeps its people and only clears their link to it. Other roles cannot change labs
(Row Level Security), and every change is written to `audit_log`.

## Tests

```bash
npm run test -w @naamii/core    # unit tests for every formula and health rule
npm run test:authz              # the 7 critical authorization cases against real Row Level Security
npm run test:entry              # Excel template, import, forms and user management — per role, against the real database
npm run lint && npm run build   # lint + production build
```

The authorization suite (`db/test/authz.test.ts`) connects as the application role exactly as the web
app does and proves: ED sees all; PI sees own lab only; PI cannot fetch another lab’s project by id;
Project Lead sees own project only and cannot fetch another; Admin sees administration tables and
nobody else does; changing a role/assignment/active flag changes access with no code change;
compensation is visible to Admin and ED only. CI runs all of this on every push (`.github/workflows/ci.yml`).

## How it is built

```
naamii-pmis/
  app/                 Next.js 16 (App Router, TypeScript, Tailwind v4, Recharts) — PRESENTATION + secure server code
    src/app            routes: (auth)/login, (dashboard)/{overview, labs, projects, admin/*}
    src/components     NAAMII design system: KPI cards, tables, charts, shell, badges
    src/lib            env, db (RLS-scoped transactions), auth (Demo / Entra), data access layer, formatting
    src/proxy.ts       redirects unauthenticated requests before any page renders
  packages/core/       BUSINESS LOGIC: domain types, calculations, configurable health rules, alerts, navigation model
  db/                  DATA: SQL migrations (schema, RLS policies, views), demo seed, scripts, authorization tests
  functions/, infra/   Phase 2 / Phase 4 placeholders (Azure Functions sync; Bicep)
  docs/                architecture summary
```

**Security model.** The app connects as the low-privilege `pmis_app` role and runs every request inside
a transaction that sets `app.user_id`. Policies in `db/migrations/0002_rls.sql` decide row visibility:
ED/Admin → all; PI → projects in their labs; Project Lead → assigned projects; financial, milestone,
risk and team rows inherit from the project; compensation lives in its own table visible to Admin + ED;
configuration and import tables are Admin-only. Hidden menu items are a convenience — a URL cannot
reach what the policy denies. The sync Function uses a separate `pmis_etl` role.

**Calculations** are defined once in `packages/core` and unit-tested: Utilisation = Actual ÷ Budget,
Remaining = Budget − Actual, Budget variance = Budget − Actual, Forecast variance = Forecast − Budget,
Days remaining = End − Today, plus configurable traffic-light rules (`DEFAULT_HEALTH_RULES`) and
data-driven alerts. Budget, Actual, Committed and Forecast are stored facts and never mixed.

**Brand.** Tokens in `app/src/app/globals.css` follow NAAMII Brand Book 2026 (Helvetica Neue; Dark Blue
Grey #454d59, Pure Red #db0505, Neutral Grey #737370, Cool Grey #a1a6b2, White). Pure Red is reserved
for emphasis and the critical state; charts use the brand greys with forecast dashed; traffic lights use
colour + shape + label. The logotype slot (sidebar / sign-in) takes the white reverse logo on Dark Blue Grey —
add the asset under `app/public/brand/` when available.

**Money.** NPR is shown with Nepali grouping and lakh/crore compact units; other currencies use
Western grouping. Each project stores its own currency. Fiscal-year labels follow Nepal’s mid-July year.

## Authentication modes

| `PMIS_AUTH_MODE` | Behaviour |
| --- | --- |
| `demo` | Sign-in page lists the fictional demo accounts (only `@naamii-demo.test` users can ever be chosen). Local/dev only. |
| `entra` | Azure App Service built-in authentication validates the Microsoft Entra ID token and forwards the principal; the app maps e-mail/object-id → PMIS user (`app.resolve_user`). Unmapped staff see a friendly “no role yet” message. |

## Deploying to Azure (outline — Phase 4)

App Service (Linux, Node 20+): `npm ci && npm run build && npm start`, settings from Key Vault
(`DATABASE_URL`, `SESSION_SECRET`, `PMIS_AUTH_MODE=entra`, `PMIS_DEMO_BANNER=false`), built-in
authentication = Microsoft Entra ID (your app registration). Database: Azure Database for PostgreSQL
Flexible Server; run `npm run db:migrate` with `DATABASE_ADMIN_URL` and `PMIS_APP_PASSWORD` /
`PMIS_ETL_PASSWORD` set. Do **not** seed demo data in production.

## Roadmap

- **Phase 1** — PI and Project dashboards hardened; drill-down polish; responsive tables.
- **Phase 2** — Microsoft Graph nightly sync (Azure Function, managed identity), configurable mapping engine, validation, quarantine, Sync Now, manual upload, “Data last updated”.
- **Phase 3** — Admin editing: users/roles, lab and project ownership, column mappings, data-quality review of failed imports.
- **Phase 4** — Infra as code, Entra wiring, security review, performance, pilot and go-live.
