-- NAAMII PMIS — data entry (Excel import + forms)
-- Two entry points, enforced here so neither a form nor an uploaded workbook
-- can write what the signed-in user is not responsible for:
--   Finance & Operations (admin) : everything — projects, budgets, monthly
--                                  financials, team compensation, and all below.
--   Project Lead (project manager): milestones, risks and team members of the
--                                  projects assigned to them. (0007 adds the
--                                  monthly forecast; nothing else financial.)
--   Executive Director, PI       : read-only (unchanged).

-- May the current user write project-level facts for this project?
CREATE OR REPLACE FUNCTION app.can_edit_project(p_project_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, app AS $$
  SELECT CASE app.current_user_role()
    WHEN 'admin' THEN true
    WHEN 'project_lead' THEN EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = p_project_id
        AND (p.project_lead_id = app.current_user_id()
             OR p.id IN (SELECT project_id FROM project_assignments WHERE user_id = app.current_user_id())))
    ELSE false
  END
$$;
GRANT EXECUTE ON FUNCTION app.can_edit_project(uuid) TO pmis_app, pmis_etl;

-- Table privileges for the web application (RLS below decides which rows).
GRANT INSERT, UPDATE, DELETE ON projects, project_financials, project_milestones, project_risks,
                                project_team_members, project_team_compensation TO pmis_app;
GRANT INSERT ON import_errors TO pmis_app;

-- Finance & Operations only: project master data, financial facts, compensation.
CREATE POLICY projects_admin_write ON projects FOR ALL
  USING (app.is_admin()) WITH CHECK (app.is_admin());
CREATE POLICY financials_admin_write ON project_financials FOR ALL
  USING (app.is_admin()) WITH CHECK (app.is_admin());
CREATE POLICY compensation_admin_write ON project_team_compensation FOR ALL
  USING (app.is_admin()) WITH CHECK (app.is_admin());

-- Finance & Operations, or the Project Lead of that project.
CREATE POLICY milestones_write ON project_milestones FOR ALL
  USING (app.can_edit_project(project_id)) WITH CHECK (app.can_edit_project(project_id));
CREATE POLICY risks_write ON project_risks FOR ALL
  USING (app.can_edit_project(project_id)) WITH CHECK (app.can_edit_project(project_id));
CREATE POLICY team_members_write ON project_team_members FOR ALL
  USING (app.can_edit_project(project_id)) WITH CHECK (app.can_edit_project(project_id));

-- Upload records: a Project Lead may record and read their own uploads;
-- Finance & Operations still sees every run (existing *_admin policies).
CREATE POLICY import_runs_own ON import_runs FOR ALL
  USING (triggered_by_user = app.current_user_id())
  WITH CHECK (triggered_by_user = app.current_user_id()
              AND triggered_by = 'manual_upload'
              AND app.current_user_role() IN ('admin', 'project_lead'));
CREATE POLICY import_files_own ON import_files FOR ALL
  USING (EXISTS (SELECT 1 FROM import_runs r WHERE r.id = import_files.import_run_id))
  WITH CHECK (EXISTS (SELECT 1 FROM import_runs r WHERE r.id = import_files.import_run_id));
CREATE POLICY import_errors_own ON import_errors FOR SELECT
  USING (EXISTS (SELECT 1 FROM import_runs r WHERE r.id = import_errors.import_run_id));
CREATE POLICY import_errors_insert ON import_errors FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM import_runs r WHERE r.id = import_errors.import_run_id));

-- Every change made through the application is audited (who, before, after).
CREATE TRIGGER projects_audit             AFTER INSERT OR UPDATE OR DELETE ON projects             FOR EACH ROW EXECUTE FUNCTION app.audit_trigger();
CREATE TRIGGER project_financials_audit   AFTER INSERT OR UPDATE OR DELETE ON project_financials   FOR EACH ROW EXECUTE FUNCTION app.audit_trigger();
CREATE TRIGGER project_milestones_audit   AFTER INSERT OR UPDATE OR DELETE ON project_milestones   FOR EACH ROW EXECUTE FUNCTION app.audit_trigger();
CREATE TRIGGER project_risks_audit        AFTER INSERT OR UPDATE OR DELETE ON project_risks        FOR EACH ROW EXECUTE FUNCTION app.audit_trigger();
CREATE TRIGGER project_team_members_audit AFTER INSERT OR UPDATE OR DELETE ON project_team_members FOR EACH ROW EXECUTE FUNCTION app.audit_trigger();

CREATE OR REPLACE FUNCTION app.audit_compensation_trigger() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, app AS $$
BEGIN
  INSERT INTO audit_log(actor_user_id, actor_role, action, entity, entity_id, before, after)
  VALUES (app.current_user_id(), current_user, TG_OP, TG_TABLE_NAME,
          COALESCE(NEW.team_member_id, OLD.team_member_id)::text,
          CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END,
          CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END);
  RETURN COALESCE(NEW, OLD);
END $$;
CREATE TRIGGER project_team_compensation_audit AFTER INSERT OR UPDATE OR DELETE ON project_team_compensation
  FOR EACH ROW EXECUTE FUNCTION app.audit_compensation_trigger();

CREATE TRIGGER project_team_compensation_touch BEFORE UPDATE ON project_team_compensation
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- "Data last updated" now also reflects entries made through forms.
CREATE OR REPLACE FUNCTION app.data_freshness()
RETURNS TABLE (last_successful_sync timestamptz, last_run_status import_status, last_run_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, app AS $$
  SELECT
    GREATEST(
      (SELECT max(finished_at) FROM import_runs WHERE status IN ('success','partial','unchanged')),
      (SELECT max(updated_at) FROM projects),
      (SELECT max(updated_at) FROM project_financials),
      (SELECT max(updated_at) FROM project_milestones),
      (SELECT max(updated_at) FROM project_risks),
      (SELECT max(updated_at) FROM project_team_members)),
    (SELECT status      FROM import_runs WHERE triggered_by <> 'manual_upload' ORDER BY started_at DESC LIMIT 1),
    (SELECT started_at  FROM import_runs WHERE triggered_by <> 'manual_upload' ORDER BY started_at DESC LIMIT 1)
$$;
