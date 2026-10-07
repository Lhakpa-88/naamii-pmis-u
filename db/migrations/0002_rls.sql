-- NAAMII PMIS — Row Level Security
-- Layer: BUSINESS LOGIC (authorisation). The rules live with the data, so a
-- request for a project the user may not see returns zero rows however it is
-- made (URL, API, export). The UI only hides what is already blocked here.
--
-- Session contract: the app sets  SELECT set_config('app.user_id', '<uuid>', true)
-- inside each transaction and connects as role pmis_app (NOBYPASSRLS).

-- ---------------------------------------------------------------------------
-- Helpers (SECURITY DEFINER: run as the owner so they can read the membership
-- tables regardless of the caller's own row visibility). STABLE = evaluated
-- once per statement.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.current_user_role() RETURNS user_role
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, app AS $$
  SELECT u.role FROM users u WHERE u.id = app.current_user_id() AND u.active
$$;

-- Labs the current user leads (primary lab + any extra pi_lab memberships).
CREATE OR REPLACE FUNCTION app.user_lab_ids() RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, app AS $$
  SELECT lab_id FROM pi_lab WHERE user_id = app.current_user_id()
  UNION
  SELECT lab_id FROM users WHERE id = app.current_user_id() AND lab_id IS NOT NULL AND role = 'pi'
$$;

-- Projects explicitly assigned to the current user (Project Leads).
CREATE OR REPLACE FUNCTION app.user_project_ids() RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, app AS $$
  SELECT project_id FROM project_assignments WHERE user_id = app.current_user_id()
$$;

CREATE OR REPLACE FUNCTION app.is_admin() RETURNS boolean
LANGUAGE sql STABLE AS $$ SELECT app.current_user_role() = 'admin' $$;

CREATE OR REPLACE FUNCTION app.is_org_wide() RETURNS boolean
LANGUAGE sql STABLE AS $$ SELECT app.current_user_role() IN ('ed', 'admin') $$;

-- Resolve an authenticated identity (email and/or Entra object id) to a user.
-- Called before app.user_id is set, so it must bypass RLS (definer) — but it
-- only ever returns the caller's own matching, active row.
CREATE OR REPLACE FUNCTION app.resolve_user(p_email text, p_entra_oid text DEFAULT NULL)
RETURNS TABLE (id uuid, email citext, name text, role user_role, lab_id uuid, entra_object_id text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, app AS $$
BEGIN
  RETURN QUERY
  SELECT u.id, u.email, u.name, u.role, u.lab_id, u.entra_object_id
  FROM users u
  WHERE u.active
    AND ((p_entra_oid IS NOT NULL AND u.entra_object_id = p_entra_oid)
         OR (p_email IS NOT NULL AND u.email = p_email::citext))
  ORDER BY (u.entra_object_id = p_entra_oid) DESC NULLS LAST
  LIMIT 1;
END $$;

-- First SSO sign-in: remember the Entra object id for a matched e-mail.
CREATE OR REPLACE FUNCTION app.bind_entra_identity(p_user_id uuid, p_entra_oid text) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public, app AS $$
  UPDATE users SET entra_object_id = p_entra_oid
  WHERE id = p_user_id AND entra_object_id IS NULL AND p_entra_oid IS NOT NULL
$$;

GRANT EXECUTE ON FUNCTION app.current_user_role(), app.user_lab_ids(), app.user_project_ids(),
                          app.is_admin(), app.is_org_wide() TO pmis_app, pmis_etl;
GRANT EXECUTE ON FUNCTION app.resolve_user(text, text), app.bind_entra_identity(uuid, text) TO pmis_app;

-- ---------------------------------------------------------------------------
-- Enable RLS. Default is deny: a table with RLS enabled and no matching policy
-- returns nothing to pmis_app. pmis_etl bypasses by role attribute.
-- ---------------------------------------------------------------------------
ALTER TABLE organizations             ENABLE ROW LEVEL SECURITY;
ALTER TABLE labs                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE users                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE pi_lab                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_assignments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_financials        ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_milestones        ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_risks             ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_team_members      ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_team_compensation ENABLE ROW LEVEL SECURITY;
ALTER TABLE column_mappings           ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_runs               ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_files              ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_errors             ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log                 ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Projects: the anchor rule. Everything project-related inherits from it.
--   ED / Admin  → all projects
--   PI          → projects whose lab is one of the PI's labs
--   Project Lead→ projects assigned to them (or where they are the named lead)
-- ---------------------------------------------------------------------------
CREATE POLICY projects_select ON projects FOR SELECT USING (
     app.is_org_wide()
  OR (app.current_user_role() = 'pi'
      AND lab_id IN (SELECT app.user_lab_ids()))
  OR (app.current_user_role() = 'project_lead'
      AND (project_lead_id = app.current_user_id()
           OR id IN (SELECT app.user_project_ids())))
);

-- Child facts: visible exactly when the parent project is visible.
-- (The sub-select on projects is itself filtered by projects_select for pmis_app.)
CREATE POLICY financials_select ON project_financials FOR SELECT
  USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = project_financials.project_id));

CREATE POLICY milestones_select ON project_milestones FOR SELECT
  USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = project_milestones.project_id));

CREATE POLICY risks_select ON project_risks FOR SELECT
  USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = project_risks.project_id));

CREATE POLICY team_members_select ON project_team_members FOR SELECT
  USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = project_team_members.project_id));

-- Compensation: Admin and Executive Director only, and only for visible projects.
CREATE POLICY compensation_select ON project_team_compensation FOR SELECT
  USING (app.is_org_wide()
         AND EXISTS (SELECT 1 FROM project_team_members m WHERE m.id = project_team_compensation.team_member_id));

-- ---------------------------------------------------------------------------
-- Organisation structure
-- ---------------------------------------------------------------------------
CREATE POLICY organizations_select ON organizations FOR SELECT USING (app.current_user_role() IS NOT NULL);

-- Labs: org-wide roles see all; others see the labs of projects they can see
-- plus (for PIs) their own labs. Writes: Admin only.
CREATE POLICY labs_select ON labs FOR SELECT USING (
     app.is_org_wide()
  OR id IN (SELECT app.user_lab_ids())
  OR id IN (SELECT lab_id FROM projects)
);
CREATE POLICY labs_admin_write ON labs FOR ALL USING (app.is_admin()) WITH CHECK (app.is_admin());

-- Users: a directory of active people for everyone signed in; Admin sees and
-- manages all (including inactive). Role changes take effect on next sign-in.
CREATE POLICY users_select ON users FOR SELECT USING (app.is_admin() OR active OR id = app.current_user_id());
CREATE POLICY users_admin_write ON users FOR ALL USING (app.is_admin()) WITH CHECK (app.is_admin());

CREATE POLICY pi_lab_select ON pi_lab FOR SELECT USING (app.is_admin() OR user_id = app.current_user_id());
CREATE POLICY pi_lab_admin_write ON pi_lab FOR ALL USING (app.is_admin()) WITH CHECK (app.is_admin());

CREATE POLICY assignments_select ON project_assignments FOR SELECT
  USING (app.is_admin() OR user_id = app.current_user_id()
         OR EXISTS (SELECT 1 FROM projects p WHERE p.id = project_assignments.project_id));
CREATE POLICY assignments_admin_write ON project_assignments FOR ALL USING (app.is_admin()) WITH CHECK (app.is_admin());

-- ---------------------------------------------------------------------------
-- Ingestion configuration, sync status and audit: Admin (Finance/Ops) only.
-- Everyone gets the "Data last updated" stamp through app.data_freshness().
-- ---------------------------------------------------------------------------
CREATE POLICY column_mappings_admin ON column_mappings FOR ALL USING (app.is_admin()) WITH CHECK (app.is_admin());
CREATE POLICY import_runs_admin     ON import_runs     FOR ALL USING (app.is_admin()) WITH CHECK (app.is_admin());
CREATE POLICY import_files_admin    ON import_files    FOR ALL USING (app.is_admin()) WITH CHECK (app.is_admin());
CREATE POLICY import_errors_admin   ON import_errors   FOR SELECT USING (app.is_admin());
CREATE POLICY audit_log_admin       ON audit_log       FOR SELECT USING (app.is_admin());

CREATE OR REPLACE FUNCTION app.data_freshness()
RETURNS TABLE (last_successful_sync timestamptz, last_run_status import_status, last_run_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, app AS $$
  SELECT
    (SELECT max(finished_at) FROM import_runs WHERE status IN ('success','partial','unchanged')),
    (SELECT status      FROM import_runs ORDER BY started_at DESC LIMIT 1),
    (SELECT started_at  FROM import_runs ORDER BY started_at DESC LIMIT 1)
$$;
GRANT EXECUTE ON FUNCTION app.data_freshness() TO pmis_app;
