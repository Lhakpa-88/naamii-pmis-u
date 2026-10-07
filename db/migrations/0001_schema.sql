-- NAAMII PMIS — core schema
-- Layer: DATA. Stores facts imported from source files; derived figures
-- (utilisation, remaining, variances, health) are computed in @naamii/core.
-- Run as the migration owner (superuser locally; the admin login on Azure).

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE SCHEMA IF NOT EXISTS app;   -- session context + security helpers

-- ---------------------------------------------------------------------------
-- Database roles used by the application tiers
--   pmis_app : the web application. Subject to Row Level Security (no BYPASSRLS).
--   pmis_etl : the sync Function. Trusted writer, bypasses RLS.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pmis_app') THEN
    CREATE ROLE pmis_app LOGIN NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pmis_etl') THEN
    CREATE ROLE pmis_etl LOGIN BYPASSRLS;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Enumerations (closed sets). Open-ended classifications use lookup/text.
-- ---------------------------------------------------------------------------
CREATE TYPE user_role        AS ENUM ('ed', 'pi', 'project_lead', 'admin');
CREATE TYPE project_status   AS ENUM ('planned', 'active', 'on_hold', 'completed', 'closed', 'cancelled');
CREATE TYPE milestone_status AS ENUM ('not_started', 'in_progress', 'completed', 'cancelled');
CREATE TYPE risk_level       AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE issue_status     AS ENUM ('open', 'mitigating', 'closed');
CREATE TYPE import_status    AS ENUM ('running', 'success', 'partial', 'failed', 'unchanged');
CREATE TYPE import_trigger   AS ENUM ('schedule', 'sync_now', 'manual_upload', 'seed');

-- ---------------------------------------------------------------------------
-- Organisation structure
-- ---------------------------------------------------------------------------
CREATE TABLE organizations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  short_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE labs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  code            text NOT NULL UNIQUE,
  name            text NOT NULL,
  pi_user_id      uuid,                       -- FK added after users exists
  active          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email           citext NOT NULL UNIQUE,
  name            text NOT NULL,
  role            user_role NOT NULL,
  lab_id          uuid REFERENCES labs(id),   -- primary lab (PIs may have more via pi_lab)
  entra_object_id text UNIQUE,                -- Microsoft Entra ID object id, set on first SSO
  active          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE labs
  ADD CONSTRAINT labs_pi_user_fk FOREIGN KEY (pi_user_id) REFERENCES users(id);

-- A PI may lead more than one lab; a Project Lead may run several projects.
CREATE TABLE pi_lab (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lab_id  uuid NOT NULL REFERENCES labs(id)  ON DELETE CASCADE,
  PRIMARY KEY (user_id, lab_id)
);

-- ---------------------------------------------------------------------------
-- Projects and project-level facts
-- Provenance columns trace every row back to its source workbook.
-- ---------------------------------------------------------------------------
CREATE TABLE projects (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code            text NOT NULL UNIQUE,                 -- natural key used by ingestion
  name            text NOT NULL,
  lab_id          uuid NOT NULL REFERENCES labs(id),
  pi_id           uuid REFERENCES users(id),
  project_lead_id uuid REFERENCES users(id),
  funder          text,
  project_type    text,                                 -- research / service / capacity ... (open set)
  status          project_status NOT NULL DEFAULT 'active',
  currency        char(3) NOT NULL DEFAULT 'NPR',       -- project currency; reporting currency is separate
  total_budget    numeric(18,2) NOT NULL DEFAULT 0 CHECK (total_budget >= 0),
  start_date      date,
  end_date        date,
  description     text,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,   -- extension point: new attributes without migrations
  -- provenance
  source_file     text,
  source_sheet    text,
  source_row      integer,
  source_modified timestamptz,
  imported_at     timestamptz,
  import_status   import_status,
  import_run_id   uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);
CREATE INDEX projects_lab_idx  ON projects(lab_id);
CREATE INDEX projects_lead_idx ON projects(project_lead_id);
CREATE INDEX projects_pi_idx   ON projects(pi_id);

CREATE TABLE project_assignments (
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id      uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  role_in_project text NOT NULL DEFAULT 'lead',
  PRIMARY KEY (user_id, project_id)
);
CREATE INDEX project_assignments_project_idx ON project_assignments(project_id);

-- One row per project per month. Budget/Actual/Committed/Forecast are stored facts;
-- Remaining and Utilisation are derived in code (never stored, never mixed).
CREATE TABLE project_financials (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id         uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  financial_period   date NOT NULL,                     -- first day of the month
  fiscal_year        text,                              -- Nepal FY label, e.g. '2082/83'
  budget             numeric(18,2) NOT NULL DEFAULT 0,  -- phased budget for the period
  actual_expenditure numeric(18,2) NOT NULL DEFAULT 0,
  committed_amount   numeric(18,2) NOT NULL DEFAULT 0,
  forecast           numeric(18,2) NOT NULL DEFAULT 0,
  currency           char(3) NOT NULL DEFAULT 'NPR',
  -- provenance
  source_file     text,
  source_sheet    text,
  source_row      integer,
  source_modified timestamptz,
  imported_at     timestamptz,
  import_status   import_status,
  import_run_id   uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, financial_period),
  CHECK (financial_period = date_trunc('month', financial_period)::date)
);
CREATE INDEX project_financials_period_idx ON project_financials(financial_period);

CREATE TABLE project_milestones (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name            text NOT NULL,
  description     text,
  due_date        date,
  completion_date date,
  status          milestone_status NOT NULL DEFAULT 'not_started',
  is_deliverable  boolean NOT NULL DEFAULT false,
  -- provenance
  source_file     text,
  source_sheet    text,
  source_row      integer,
  source_modified timestamptz,
  imported_at     timestamptz,
  import_status   import_status,
  import_run_id   uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, name)
);
CREATE INDEX project_milestones_due_idx ON project_milestones(project_id, due_date);

CREATE TABLE project_risks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  issue           text NOT NULL,
  risk_level      risk_level NOT NULL DEFAULT 'medium',
  owner           text,
  due_date        date,
  status          issue_status NOT NULL DEFAULT 'open',
  -- provenance
  source_file     text,
  source_sheet    text,
  source_row      integer,
  source_modified timestamptz,
  imported_at     timestamptz,
  import_status   import_status,
  import_run_id   uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, issue)
);

-- Team members: names and allocations are visible to anyone who can see the project.
CREATE TABLE project_team_members (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  person_name     text NOT NULL,
  role_title      text,
  allocation_pct  numeric(5,2) CHECK (allocation_pct IS NULL OR (allocation_pct >= 0 AND allocation_pct <= 100)),
  start_date      date,
  end_date        date,
  -- provenance
  source_file     text,
  source_sheet    text,
  source_row      integer,
  source_modified timestamptz,
  imported_at     timestamptz,
  import_status   import_status,
  import_run_id   uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, person_name)
);

-- Compensation is kept in its own table so that it can carry its own
-- row-level security (visible to Admin and the Executive Director only).
CREATE TABLE project_team_compensation (
  team_member_id uuid PRIMARY KEY REFERENCES project_team_members(id) ON DELETE CASCADE,
  monthly_cost   numeric(18,2) NOT NULL CHECK (monthly_cost >= 0),
  currency       char(3) NOT NULL DEFAULT 'NPR',
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Ingestion configuration and audit
-- ---------------------------------------------------------------------------
-- Configurable Excel → schema mapping, edited by Finance/Ops in the Admin console.
CREATE TABLE column_mappings (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sheet_pattern  text NOT NULL,          -- e.g. 'Project Information', 'Financials*'
  excel_column   text NOT NULL,          -- heading as found in the workbook
  target_entity  text NOT NULL,          -- project | project_financials | project_milestones | project_risks | project_team_members
  target_field   text NOT NULL,
  data_type      text NOT NULL DEFAULT 'text',   -- text | number | date | currency | percent
  required       boolean NOT NULL DEFAULT false,
  transform      text,                   -- optional named transform, e.g. 'nepali_date', 'lakh_to_units'
  active         boolean NOT NULL DEFAULT true,
  notes          text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sheet_pattern, excel_column, target_entity, target_field)
);

CREATE TABLE import_runs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at        timestamptz NOT NULL DEFAULT now(),
  finished_at       timestamptz,
  triggered_by      import_trigger NOT NULL,
  triggered_by_user uuid REFERENCES users(id),
  status            import_status NOT NULL DEFAULT 'running',
  files_total       integer NOT NULL DEFAULT 0,
  files_changed     integer NOT NULL DEFAULT 0,
  files_unchanged   integer NOT NULL DEFAULT 0,
  files_failed      integer NOT NULL DEFAULT 0,
  notes             text
);

CREATE TABLE import_files (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_run_id uuid NOT NULL REFERENCES import_runs(id) ON DELETE CASCADE,
  source_file   text NOT NULL,
  source_path   text,
  content_hash  text,
  project_id    uuid REFERENCES projects(id),
  status        import_status NOT NULL,
  rows_upserted integer NOT NULL DEFAULT 0,
  message       text,
  processed_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX import_files_run_idx ON import_files(import_run_id);
CREATE INDEX import_files_hash_idx ON import_files(source_file, content_hash);

CREATE TABLE import_errors (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_run_id uuid NOT NULL REFERENCES import_runs(id) ON DELETE CASCADE,
  source_file   text NOT NULL,
  source_sheet  text,
  source_row    integer,
  field         text,
  error_code    text NOT NULL,          -- MISSING_REQUIRED | INVALID_DATE | INVALID_NUMBER | INVALID_CURRENCY | DUPLICATE_PROJECT | UNKNOWN_STRUCTURE | ...
  message       text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX import_errors_run_idx ON import_errors(import_run_id);

CREATE TABLE audit_log (
  id            bigserial PRIMARY KEY,
  at            timestamptz NOT NULL DEFAULT now(),
  actor_user_id uuid,
  actor_role    text,                    -- database role that made the change (pmis_app / pmis_etl / owner)
  action        text NOT NULL,           -- INSERT | UPDATE | DELETE
  entity        text NOT NULL,
  entity_id     text,
  before        jsonb,
  after         jsonb
);
CREATE INDEX audit_log_entity_idx ON audit_log(entity, entity_id);

-- ---------------------------------------------------------------------------
-- Session context helpers
-- The application sets the signed-in user for the transaction with
--   SELECT set_config('app.user_id', '<uuid>', true);
-- All policies read it through app.current_user_id().
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.current_user_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.user_id', true), '')::uuid
$$;

-- Nepal fiscal year label for a date (FY starts mid-July; Shrawan 1 ≈ 16/17 July).
-- Approximation is documented: used for grouping/labels only, not accounting.
CREATE OR REPLACE FUNCTION app.fiscal_year_label(d date) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT (fy_start + 57)::text || '/' || lpad(((fy_start + 58) % 100)::text, 2, '0')
  FROM (SELECT CASE WHEN (extract(month FROM d) > 7) OR (extract(month FROM d) = 7 AND extract(day FROM d) >= 16)
                    THEN extract(year FROM d)::int ELSE extract(year FROM d)::int - 1 END AS fy_start) s
$$;

-- updated_at maintenance
CREATE OR REPLACE FUNCTION app.touch_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['labs','users','projects','project_financials','project_milestones',
                           'project_risks','project_team_members','column_mappings']
  LOOP
    EXECUTE format('CREATE TRIGGER %I_touch BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at()', t, t);
  END LOOP;
END $$;

-- Audit trail on configuration tables (who changed what, with before/after values).
CREATE OR REPLACE FUNCTION app.audit_trigger() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, app AS $$
DECLARE
  v_before jsonb; v_after jsonb; v_id text;
BEGIN
  IF TG_OP = 'DELETE' THEN v_before := to_jsonb(OLD); v_id := COALESCE(OLD.id::text, NULL);
  ELSIF TG_OP = 'INSERT' THEN v_after := to_jsonb(NEW); v_id := COALESCE(NEW.id::text, NULL);
  ELSE v_before := to_jsonb(OLD); v_after := to_jsonb(NEW); v_id := COALESCE(NEW.id::text, NULL);
  END IF;
  INSERT INTO audit_log(actor_user_id, actor_role, action, entity, entity_id, before, after)
  VALUES (app.current_user_id(), current_user, TG_OP, TG_TABLE_NAME, v_id, v_before, v_after);
  RETURN COALESCE(NEW, OLD);
END $$;

CREATE TRIGGER users_audit            AFTER INSERT OR UPDATE OR DELETE ON users            FOR EACH ROW EXECUTE FUNCTION app.audit_trigger();
CREATE TRIGGER labs_audit             AFTER INSERT OR UPDATE OR DELETE ON labs             FOR EACH ROW EXECUTE FUNCTION app.audit_trigger();
CREATE TRIGGER column_mappings_audit  AFTER INSERT OR UPDATE OR DELETE ON column_mappings  FOR EACH ROW EXECUTE FUNCTION app.audit_trigger();

-- pi_lab / project_assignments have composite keys; audit them with a dedicated trigger.
CREATE OR REPLACE FUNCTION app.audit_membership_trigger() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, app AS $$
BEGIN
  INSERT INTO audit_log(actor_user_id, actor_role, action, entity, entity_id, before, after)
  VALUES (app.current_user_id(), current_user, TG_OP, TG_TABLE_NAME,
          COALESCE(NEW.user_id, OLD.user_id)::text,
          CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END,
          CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END);
  RETURN COALESCE(NEW, OLD);
END $$;
CREATE TRIGGER pi_lab_audit              AFTER INSERT OR UPDATE OR DELETE ON pi_lab              FOR EACH ROW EXECUTE FUNCTION app.audit_membership_trigger();
CREATE TRIGGER project_assignments_audit AFTER INSERT OR UPDATE OR DELETE ON project_assignments FOR EACH ROW EXECUTE FUNCTION app.audit_membership_trigger();

-- ---------------------------------------------------------------------------
-- Grants (what each tier may touch; RLS decides which rows)
-- ---------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public, app TO pmis_app, pmis_etl;

-- Application: read data, write configuration (RLS restricts writes to Admin).
GRANT SELECT ON organizations, labs, users, pi_lab, project_assignments, projects, project_financials,
                project_milestones, project_risks, project_team_members, project_team_compensation,
                column_mappings, import_runs, import_files, import_errors, audit_log TO pmis_app;
GRANT INSERT, UPDATE, DELETE ON users, labs, pi_lab, project_assignments, column_mappings TO pmis_app;
GRANT INSERT ON import_runs, import_files TO pmis_app;          -- manual upload / Sync Now records
GRANT UPDATE ON import_runs TO pmis_app;
GRANT USAGE, SELECT ON SEQUENCE audit_log_id_seq TO pmis_app;    -- audit trigger inserts run as definer, but keep explicit

-- ETL: full data writes; bypasses RLS by role attribute.
GRANT SELECT, INSERT, UPDATE, DELETE ON projects, project_financials, project_milestones, project_risks,
                project_team_members, project_team_compensation, import_runs, import_files, import_errors TO pmis_etl;
GRANT SELECT ON organizations, labs, users, pi_lab, project_assignments, column_mappings TO pmis_etl;
GRANT USAGE, SELECT ON SEQUENCE audit_log_id_seq TO pmis_etl;

GRANT EXECUTE ON FUNCTION app.current_user_id() TO pmis_app, pmis_etl;
GRANT EXECUTE ON FUNCTION app.fiscal_year_label(date) TO pmis_app, pmis_etl;
