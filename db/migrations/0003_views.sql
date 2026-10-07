-- NAAMII PMIS — convenience views
-- All views use security_invoker so the caller's Row Level Security applies.
-- They join facts for presentation; they do NOT compute business metrics
-- (utilisation, remaining, health) — that is @naamii/core's job.

-- Team members with compensation attached only where the caller may see it.
-- For PIs and Project Leads the LEFT JOIN finds no visible compensation rows,
-- so monthly_cost is NULL and compensation_visible is false.
CREATE OR REPLACE VIEW project_team_members_v
WITH (security_invoker = true) AS
SELECT
  m.id, m.project_id, m.person_name, m.role_title, m.allocation_pct,
  m.start_date, m.end_date,
  c.monthly_cost,
  c.currency AS compensation_currency,
  (c.team_member_id IS NOT NULL) AS compensation_visible,
  m.source_file, m.source_sheet, m.source_row, m.imported_at
FROM project_team_members m
LEFT JOIN project_team_compensation c ON c.team_member_id = m.id;

-- Projects with the names a dashboard row needs (lab, PI, lead).
CREATE OR REPLACE VIEW projects_v
WITH (security_invoker = true) AS
SELECT
  p.id, p.code, p.name, p.status, p.project_type, p.funder, p.currency,
  p.total_budget, p.start_date, p.end_date, p.description, p.metadata,
  p.lab_id, l.code AS lab_code, l.name AS lab_name,
  p.pi_id, pi.name AS pi_name,
  p.project_lead_id, lead.name AS project_lead_name,
  p.source_file, p.source_sheet, p.source_row, p.source_modified, p.imported_at, p.import_status,
  p.created_at, p.updated_at
FROM projects p
JOIN labs l       ON l.id = p.lab_id
LEFT JOIN users pi   ON pi.id = p.pi_id
LEFT JOIN users lead ON lead.id = p.project_lead_id;

GRANT SELECT ON project_team_members_v, projects_v TO pmis_app;
GRANT SELECT ON project_team_members_v, projects_v TO pmis_etl;
