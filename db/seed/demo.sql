-- ============================================================================
--  NAAMII PMIS — DEMO DATA (FICTIONAL)
--  Every organisation, lab, person, project, funder and figure in this file is
--  invented for demonstration. Names carry the prefix "DEMO" and e-mails use the
--  reserved .test domain so nothing here can be mistaken for real NAAMII data.
--  Idempotent: re-running replaces the demo dataset.
-- ============================================================================

TRUNCATE TABLE
  audit_log, import_errors, import_files, import_runs, column_mappings,
  project_team_compensation, project_team_members, project_risks, project_milestones,
  project_financials, project_assignments, projects, pi_lab, users, labs, organizations
RESTART IDENTITY CASCADE;

-- ---------------------------------------------------------------------------
-- Organisation and labs
-- ---------------------------------------------------------------------------
INSERT INTO organizations (id, name, short_name) VALUES
  ('00000000-0000-4000-8000-000000000001', 'DEMO · NAAMII (fictional demonstration dataset)', 'NAAMII (DEMO)');

INSERT INTO labs (id, organization_id, code, name) VALUES
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'DEMO-AIM', 'DEMO · AI & Mathematics Lab'),
  ('10000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'DEMO-CSL', 'DEMO · Computational Science Lab'),
  ('10000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000001', 'DEMO-AIS', 'DEMO · AI Systems Lab');

-- ---------------------------------------------------------------------------
-- Users (demo sign-ins). The six starred rows are the demo accounts offered on
-- the sign-in page; the others exist so projects have named leads.
-- ---------------------------------------------------------------------------
INSERT INTO users (id, email, name, role, lab_id) VALUES
  ('20000000-0000-4000-8000-000000000001', 'ed.demo@naamii-demo.test',         'Demo Executive Director',        'ed',           NULL),                                   -- *
  ('20000000-0000-4000-8000-000000000002', 'pi.aim.demo@naamii-demo.test',     'Dr. Demo Pradhan (PI)',           'pi',           '10000000-0000-4000-8000-000000000001'), -- *
  ('20000000-0000-4000-8000-000000000003', 'pi.csl.demo@naamii-demo.test',     'Dr. Demo Karki (PI)',             'pi',           '10000000-0000-4000-8000-000000000002'), -- *
  ('20000000-0000-4000-8000-000000000004', 'pi.ais.demo@naamii-demo.test',     'Dr. Demo Thapa (PI)',             'pi',           '10000000-0000-4000-8000-000000000003'),
  ('20000000-0000-4000-8000-000000000005', 'lead.alpha.demo@naamii-demo.test', 'Demo Lead — Project Alpha',       'project_lead', '10000000-0000-4000-8000-000000000001'), -- *
  ('20000000-0000-4000-8000-000000000006', 'lead.gamma.demo@naamii-demo.test', 'Demo Lead — Project Gamma',       'project_lead', '10000000-0000-4000-8000-000000000002'), -- *
  ('20000000-0000-4000-8000-000000000007', 'admin.demo@naamii-demo.test',      'Demo Finance & Operations',       'admin',        NULL),                                   -- *
  ('20000000-0000-4000-8000-000000000008', 'lead.beta.demo@naamii-demo.test',  'Demo Lead — Project Beta',        'project_lead', '10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000009', 'lead.delta.demo@naamii-demo.test', 'Demo Lead — Project Delta',       'project_lead', '10000000-0000-4000-8000-000000000002'),
  ('20000000-0000-4000-8000-000000000010', 'lead.eps.demo@naamii-demo.test',   'Demo Lead — Project Epsilon',     'project_lead', '10000000-0000-4000-8000-000000000003'),
  ('20000000-0000-4000-8000-000000000011', 'lead.zeta.demo@naamii-demo.test',  'Demo Lead — Project Zeta',        'project_lead', '10000000-0000-4000-8000-000000000003');

UPDATE labs SET pi_user_id = '20000000-0000-4000-8000-000000000002' WHERE code = 'DEMO-AIM';
UPDATE labs SET pi_user_id = '20000000-0000-4000-8000-000000000003' WHERE code = 'DEMO-CSL';
UPDATE labs SET pi_user_id = '20000000-0000-4000-8000-000000000004' WHERE code = 'DEMO-AIS';

INSERT INTO pi_lab (user_id, lab_id) VALUES
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000002'),
  ('20000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000003');

-- ---------------------------------------------------------------------------
-- Import run that "produced" this dataset (so provenance and freshness work)
-- ---------------------------------------------------------------------------
INSERT INTO import_runs (id, started_at, finished_at, triggered_by, status, files_total, files_changed, files_unchanged, files_failed, notes)
VALUES ('40000000-0000-4000-8000-000000000001', now() - interval '6 hours', now() - interval '6 hours' + interval '48 seconds',
        'seed', 'success', 6, 6, 0, 0, 'DEMO DATA — fictional seed; not imported from OneDrive');

-- ---------------------------------------------------------------------------
-- Projects (6 across 3 labs). Figures are fictional NPR amounts.
-- ---------------------------------------------------------------------------
INSERT INTO projects (id, code, name, lab_id, pi_id, project_lead_id, funder, project_type, status, currency, total_budget, start_date, end_date, description,
                      source_file, source_sheet, source_row, source_modified, imported_at, import_status, import_run_id) VALUES
  ('30000000-0000-4000-8000-000000000001', 'DEMO-AIM-2024-001', 'Project Alpha — Foundation Models for Nepali Language',
   '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000005',
   'Demo Foundation (fictional)', 'Research', 'active', 'NPR', 48000000, '2024-08-01', '2027-07-31',
   'Fictional project: open Nepali-language corpus and baseline models.',
   'DEMO_Project_Alpha.xlsx', 'Project Information', 2, now() - interval '2 days', now() - interval '6 hours', 'success', '40000000-0000-4000-8000-000000000001'),

  ('30000000-0000-4000-8000-000000000002', 'DEMO-AIM-2025-002', 'Project Beta — Optimisation for Grid Scheduling',
   '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000008',
   'Demo Development Agency (fictional)', 'Research', 'active', 'NPR', 22500000, '2025-01-01', '2026-12-31',
   'Fictional project: mathematical optimisation for hydropower grid scheduling.',
   'DEMO_Project_Beta.xlsx', 'Project Information', 2, now() - interval '1 day', now() - interval '6 hours', 'success', '40000000-0000-4000-8000-000000000001'),

  ('30000000-0000-4000-8000-000000000003', 'DEMO-CSL-2025-003', 'Project Gamma — Climate Downscaling for Himalayan Basins',
   '10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000006',
   'Demo Research Council (fictional)', 'Research', 'active', 'NPR', 36000000, '2025-01-01', '2026-12-31',
   'Fictional project: statistical downscaling of climate projections.',
   'DEMO_Project_Gamma.xlsx', 'Project Information', 2, now() - interval '3 days', now() - interval '6 hours', 'success', '40000000-0000-4000-8000-000000000001'),

  ('30000000-0000-4000-8000-000000000004', 'DEMO-CSL-2026-004', 'Project Delta — Flood Early-Warning Simulation',
   '10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000009',
   'Demo Humanitarian Fund (fictional)', 'Research', 'active', 'NPR', 15000000, '2026-03-01', '2028-02-29',
   'Fictional project: hydrological simulation for community early warning.',
   'DEMO_Project_Delta.xlsx', 'Project Information', 2, now() - interval '5 days', now() - interval '6 hours', 'success', '40000000-0000-4000-8000-000000000001'),

  ('30000000-0000-4000-8000-000000000005', 'DEMO-AIS-2025-005', 'Project Epsilon — Edge AI for Ultrasound Triage',
   '10000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000010',
   'Demo Global Health Partners (fictional)', 'Research', 'active', 'NPR', 60000000, '2025-07-01', '2028-06-30',
   'Fictional project: on-device inference for point-of-care ultrasound.',
   'DEMO_Project_Epsilon.xlsx', 'Project Information', 2, now() - interval '1 day', now() - interval '6 hours', 'success', '40000000-0000-4000-8000-000000000001'),

  ('30000000-0000-4000-8000-000000000006', 'DEMO-AIS-2024-006', 'Project Zeta — Research Compute Platform',
   '10000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000011',
   'Demo Core Grant (fictional)', 'Infrastructure', 'completed', 'NPR', 18000000, '2024-07-01', '2026-06-30',
   'Fictional project: shared GPU cluster procurement and commissioning (closed).',
   'DEMO_Project_Zeta.xlsx', 'Project Information', 2, now() - interval '40 days', now() - interval '6 hours', 'success', '40000000-0000-4000-8000-000000000001');

INSERT INTO project_assignments (user_id, project_id) VALUES
  ('20000000-0000-4000-8000-000000000005', '30000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000008', '30000000-0000-4000-8000-000000000002'),
  ('20000000-0000-4000-8000-000000000006', '30000000-0000-4000-8000-000000000003'),
  ('20000000-0000-4000-8000-000000000009', '30000000-0000-4000-8000-000000000004'),
  ('20000000-0000-4000-8000-000000000010', '30000000-0000-4000-8000-000000000005'),
  ('20000000-0000-4000-8000-000000000011', '30000000-0000-4000-8000-000000000006');

INSERT INTO import_files (import_run_id, source_file, source_path, content_hash, project_id, status, rows_upserted, message)
SELECT '40000000-0000-4000-8000-000000000001', p.source_file, '/NAAMII Projects (DEMO)/' || p.source_file,
       'demo-' || substr(md5(p.code), 1, 12), p.id, 'success', 60, 'DEMO seed'
FROM projects p;

-- ---------------------------------------------------------------------------
-- Monthly financials, generated deterministically per project.
--   budget   = total budget phased evenly over the project months
--   actual   = phased budget × spend factor × small deterministic variation,
--              for closed months only (up to September 2026)
--   forecast = phased budget for past months; slightly above budget for future months
--   committed= 35% of the phased budget for the next two open months
-- Spend factors are chosen so the demo shows one over-spending project (Beta),
-- one under-spending project (Delta), a completed project (Zeta) and healthy ones.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION pg_temp.seed_financials(p_project uuid, p_spend_factor numeric, p_forecast_factor numeric)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  r      record;
  months integer;
  phased numeric;
  idx    integer := 0;
  period date;
  v_actual numeric; v_forecast numeric; v_committed numeric;
  closed_through constant date := DATE '2026-09-01';   -- last fully closed month in the demo
BEGIN
  SELECT * INTO r FROM projects WHERE id = p_project;
  months := (extract(year FROM age(r.end_date + 1, r.start_date)) * 12 + extract(month FROM age(r.end_date + 1, r.start_date)))::int;
  phased := round(r.total_budget / months, 2);

  FOR period IN SELECT generate_series(r.start_date, r.end_date, interval '1 month')::date LOOP
    idx := idx + 1;
    IF period <= closed_through THEN
      v_actual   := round((phased * p_spend_factor * (1 + 0.08 * sin(idx * 1.3)))::numeric, 2);
      v_forecast := phased;
      v_committed:= 0;
    ELSE
      v_actual   := 0;
      v_forecast := round(phased * p_forecast_factor, 2);
      v_committed:= CASE WHEN period <= closed_through + interval '2 months' THEN round(phased * 0.35, 2) ELSE 0 END;
    END IF;

    INSERT INTO project_financials (project_id, financial_period, fiscal_year, budget, actual_expenditure, committed_amount, forecast, currency,
                                    source_file, source_sheet, source_row, source_modified, imported_at, import_status, import_run_id)
    VALUES (p_project, period, app.fiscal_year_label(period), phased, v_actual, v_committed, v_forecast, r.currency,
            r.source_file, 'Financials', 1 + idx, r.source_modified, r.imported_at, 'success', r.import_run_id);
  END LOOP;
END $$;

SELECT pg_temp.seed_financials('30000000-0000-4000-8000-000000000001', 0.94, 1.02);  -- Alpha: healthy
SELECT pg_temp.seed_financials('30000000-0000-4000-8000-000000000002', 1.05, 1.06);  -- Beta: over-spending, ends Dec 2026
SELECT pg_temp.seed_financials('30000000-0000-4000-8000-000000000003', 0.89, 1.00);  -- Gamma: on track, ends Dec 2026
SELECT pg_temp.seed_financials('30000000-0000-4000-8000-000000000004', 0.31, 1.00);  -- Delta: far below forecast
SELECT pg_temp.seed_financials('30000000-0000-4000-8000-000000000005', 0.96, 1.01);  -- Epsilon: healthy
SELECT pg_temp.seed_financials('30000000-0000-4000-8000-000000000006', 0.96, 1.00);  -- Zeta: completed

-- ---------------------------------------------------------------------------
-- Milestones and deliverables
-- ---------------------------------------------------------------------------
INSERT INTO project_milestones (project_id, name, due_date, completion_date, status, is_deliverable, source_file, source_sheet, source_row, imported_at, import_status, import_run_id)
SELECT p.id, m.name, m.due, m.done, m.status::milestone_status, m.deliv, p.source_file, 'Milestones', m.row, p.imported_at, 'success', p.import_run_id
FROM projects p
JOIN (VALUES
  -- Alpha
  ('DEMO-AIM-2024-001', 'Inception report',                 DATE '2024-10-31', DATE '2024-10-28', 'completed',   true,  2),
  ('DEMO-AIM-2024-001', 'Corpus v1 released',               DATE '2025-06-30', DATE '2025-07-10', 'completed',   true,  3),
  ('DEMO-AIM-2024-001', 'Baseline model trained',           DATE '2026-03-31', DATE '2026-03-20', 'completed',   false, 4),
  ('DEMO-AIM-2024-001', 'Mid-term evaluation',              DATE '2026-09-30', DATE '2026-10-02', 'completed',   true,  5),
  ('DEMO-AIM-2024-001', 'Model v2 and public API',          DATE '2027-03-31', NULL,              'not_started', true,  6),
  ('DEMO-AIM-2024-001', 'Final report',                     DATE '2027-07-31', NULL,              'not_started', true,  7),
  -- Beta
  ('DEMO-AIM-2025-002', 'Requirements agreed with utility', DATE '2025-03-31', DATE '2025-03-28', 'completed',   true,  2),
  ('DEMO-AIM-2025-002', 'Prototype scheduler',              DATE '2025-10-31', DATE '2025-12-05', 'completed',   true,  3),
  ('DEMO-AIM-2025-002', 'Pilot deployment',                 DATE '2026-06-30', NULL,              'in_progress', true,  4),
  ('DEMO-AIM-2025-002', 'Evaluation report',                DATE '2026-09-30', NULL,              'not_started', true,  5),
  ('DEMO-AIM-2025-002', 'Final report and handover',        DATE '2026-12-31', NULL,              'not_started', true,  6),
  -- Gamma
  ('DEMO-CSL-2025-003', 'Data agreements signed',           DATE '2025-04-30', DATE '2025-04-22', 'completed',   false, 2),
  ('DEMO-CSL-2025-003', 'Downscaling model v1',             DATE '2025-12-31', DATE '2026-01-15', 'completed',   true,  3),
  ('DEMO-CSL-2025-003', 'Validation against gauges',        DATE '2026-08-31', DATE '2026-08-29', 'completed',   true,  4),
  ('DEMO-CSL-2025-003', 'Policy brief',                     DATE '2026-11-30', NULL,              'in_progress', true,  5),
  ('DEMO-CSL-2025-003', 'Final report',                     DATE '2026-12-31', NULL,              'not_started', true,  6),
  -- Delta
  ('DEMO-CSL-2026-004', 'Inception',                        DATE '2026-05-31', DATE '2026-05-20', 'completed',   true,  2),
  ('DEMO-CSL-2026-004', 'Simulation framework',             DATE '2026-12-31', NULL,              'in_progress', true,  3),
  ('DEMO-CSL-2026-004', 'Community pilot',                  DATE '2027-08-31', NULL,              'not_started', true,  4),
  ('DEMO-CSL-2026-004', 'Final report',                     DATE '2028-02-29', NULL,              'not_started', true,  5),
  -- Epsilon
  ('DEMO-AIS-2025-005', 'Ethics approval',                  DATE '2025-10-31', DATE '2025-10-20', 'completed',   false, 2),
  ('DEMO-AIS-2025-005', 'Dataset collection (phase 1)',     DATE '2026-06-30', DATE '2026-06-25', 'completed',   true,  3),
  ('DEMO-AIS-2025-005', 'Edge model v1',                    DATE '2026-12-31', NULL,              'in_progress', true,  4),
  ('DEMO-AIS-2025-005', 'Clinical validation',              DATE '2027-12-31', NULL,              'not_started', true,  5),
  ('DEMO-AIS-2025-005', 'Final report',                     DATE '2028-06-30', NULL,              'not_started', true,  6),
  -- Zeta
  ('DEMO-AIS-2024-006', 'Procurement complete',             DATE '2024-12-31', DATE '2024-12-19', 'completed',   false, 2),
  ('DEMO-AIS-2024-006', 'Cluster commissioning',            DATE '2025-09-30', DATE '2025-09-26', 'completed',   true,  3),
  ('DEMO-AIS-2024-006', 'User onboarding',                  DATE '2026-03-31', DATE '2026-03-30', 'completed',   false, 4),
  ('DEMO-AIS-2024-006', 'Closure report',                   DATE '2026-06-30', DATE '2026-06-28', 'completed',   true,  5)
) AS m(code, name, due, done, status, deliv, row) ON m.code = p.code;

-- ---------------------------------------------------------------------------
-- Risks and issues
-- ---------------------------------------------------------------------------
INSERT INTO project_risks (project_id, issue, risk_level, owner, due_date, status, source_file, source_sheet, source_row, imported_at, import_status, import_run_id)
SELECT p.id, r.issue, r.level::risk_level, r.owner, r.due, r.status::issue_status, p.source_file, 'Risks', r.row, p.imported_at, 'success', p.import_run_id
FROM projects p
JOIN (VALUES
  ('DEMO-AIM-2024-001', 'GPU availability constrained by shared cluster demand',  'medium', 'Demo Lead — Project Alpha',   DATE '2026-12-31', 'open',       2),
  ('DEMO-AIM-2025-002', 'Spend rate exceeds remaining budget runway',             'high',   'Demo Lead — Project Beta',    DATE '2026-10-31', 'open',       2),
  ('DEMO-AIM-2025-002', 'Utility partner staff turnover delays pilot',            'high',   'Dr. Demo Pradhan (PI)',       DATE '2026-11-15', 'mitigating', 3),
  ('DEMO-CSL-2025-003', 'Final report timeline tight after validation slip',      'medium', 'Demo Lead — Project Gamma',   DATE '2026-11-30', 'mitigating', 2),
  ('DEMO-CSL-2026-004', 'Hiring of simulation engineer delayed (under-spend)',    'medium', 'Demo Lead — Project Delta',   DATE '2026-11-30', 'open',       2),
  ('DEMO-AIS-2025-005', 'Device import lead time',                                'low',    'Demo Lead — Project Epsilon', DATE '2027-01-31', 'mitigating', 2),
  ('DEMO-AIS-2024-006', 'Power redundancy for cluster room',                      'low',    'Demo Lead — Project Zeta',    DATE '2025-06-30', 'closed',     2)
) AS r(code, issue, level, owner, due, status, row) ON r.code = p.code;

-- ---------------------------------------------------------------------------
-- Team members and (restricted) compensation — all fictional
-- ---------------------------------------------------------------------------
INSERT INTO project_team_members (id, project_id, person_name, role_title, allocation_pct, source_file, source_sheet, source_row, imported_at, import_status, import_run_id)
SELECT t.id::uuid, p.id, t.person, t.title, t.alloc, p.source_file, 'Team', t.row, p.imported_at, 'success', p.import_run_id
FROM projects p
JOIN (VALUES
  ('50000000-0000-4000-8000-000000000001', 'DEMO-AIM-2024-001', 'Demo Researcher A1', 'Senior Research Scientist', 50,  2),
  ('50000000-0000-4000-8000-000000000002', 'DEMO-AIM-2024-001', 'Demo Engineer A2',   'ML Engineer',               100, 3),
  ('50000000-0000-4000-8000-000000000003', 'DEMO-AIM-2024-001', 'Demo Associate A3',  'Research Associate',        100, 4),
  ('50000000-0000-4000-8000-000000000004', 'DEMO-AIM-2025-002', 'Demo Researcher B1', 'Research Scientist',        60,  2),
  ('50000000-0000-4000-8000-000000000005', 'DEMO-AIM-2025-002', 'Demo Engineer B2',   'Optimisation Engineer',     100, 3),
  ('50000000-0000-4000-8000-000000000006', 'DEMO-CSL-2025-003', 'Demo Researcher G1', 'Climate Scientist',         80,  2),
  ('50000000-0000-4000-8000-000000000007', 'DEMO-CSL-2025-003', 'Demo Associate G2',  'Research Associate',        100, 3),
  ('50000000-0000-4000-8000-000000000008', 'DEMO-CSL-2026-004', 'Demo Researcher D1', 'Hydrologist',               50,  2),
  ('50000000-0000-4000-8000-000000000009', 'DEMO-AIS-2025-005', 'Demo Researcher E1', 'Clinical AI Lead',          70,  2),
  ('50000000-0000-4000-8000-000000000010', 'DEMO-AIS-2025-005', 'Demo Engineer E2',   'Embedded ML Engineer',      100, 3),
  ('50000000-0000-4000-8000-000000000011', 'DEMO-AIS-2025-005', 'Demo Associate E3',  'Research Associate',        100, 4),
  ('50000000-0000-4000-8000-000000000012', 'DEMO-AIS-2024-006', 'Demo Engineer Z1',   'Systems Engineer',          100, 2)
) AS t(id, code, person, title, alloc, row) ON t.code = p.code;

INSERT INTO project_team_compensation (team_member_id, monthly_cost, currency) VALUES
  ('50000000-0000-4000-8000-000000000001', 240000, 'NPR'),
  ('50000000-0000-4000-8000-000000000002', 180000, 'NPR'),
  ('50000000-0000-4000-8000-000000000003',  95000, 'NPR'),
  ('50000000-0000-4000-8000-000000000004', 210000, 'NPR'),
  ('50000000-0000-4000-8000-000000000005', 175000, 'NPR'),
  ('50000000-0000-4000-8000-000000000006', 230000, 'NPR'),
  ('50000000-0000-4000-8000-000000000007',  98000, 'NPR'),
  ('50000000-0000-4000-8000-000000000008', 205000, 'NPR'),
  ('50000000-0000-4000-8000-000000000009', 260000, 'NPR'),
  ('50000000-0000-4000-8000-000000000010', 185000, 'NPR'),
  ('50000000-0000-4000-8000-000000000011',  92000, 'NPR'),
  ('50000000-0000-4000-8000-000000000012', 170000, 'NPR');

-- ---------------------------------------------------------------------------
-- Starter column mappings (Excel heading → schema field). Finance/Ops extend
-- these in the Admin console when a workbook uses different headings.
-- ---------------------------------------------------------------------------
INSERT INTO column_mappings (sheet_pattern, excel_column, target_entity, target_field, data_type, required, notes) VALUES
  ('Project Information', 'Project Code',          'project',            'code',               'text',     true,  'Natural key; must be unique'),
  ('Project Information', 'Project Name',          'project',            'name',               'text',     true,  NULL),
  ('Project Information', 'Lab',                   'project',            'lab_code',           'text',     true,  'Matched to labs.code or labs.name'),
  ('Project Information', 'Funder',                'project',            'funder',             'text',     false, NULL),
  ('Project Information', 'Project Budget',        'project',            'total_budget',       'currency', true,  'Also accepts "Approved Budget"'),
  ('Project Information', 'Approved Budget',       'project',            'total_budget',       'currency', false, 'Alias of Project Budget'),
  ('Project Information', 'Start Date',            'project',            'start_date',         'date',     true,  NULL),
  ('Project Information', 'End Date',              'project',            'end_date',           'date',     true,  NULL),
  ('Project Information', 'Currency',              'project',            'currency',           'text',     false, 'ISO 4217; defaults to NPR'),
  ('Financials',          'Month',                 'project_financials', 'financial_period',   'date',     true,  'First day of month'),
  ('Financials',          'Budget',                'project_financials', 'budget',             'currency', true,  NULL),
  ('Financials',          'Actual Spending',       'project_financials', 'actual_expenditure', 'currency', true,  'Also accepts "Expenditure"'),
  ('Financials',          'Expenditure',           'project_financials', 'actual_expenditure', 'currency', false, 'Alias of Actual Spending'),
  ('Financials',          'Committed',             'project_financials', 'committed_amount',   'currency', false, NULL),
  ('Financials',          'Forecast',              'project_financials', 'forecast',           'currency', false, NULL),
  ('Milestones',          'Milestone',             'project_milestones', 'name',               'text',     true,  NULL),
  ('Milestones',          'Due Date',              'project_milestones', 'due_date',           'date',     true,  NULL),
  ('Milestones',          'Completed On',          'project_milestones', 'completion_date',    'date',     false, NULL),
  ('Milestones',          'Status',                'project_milestones', 'status',             'text',     false, 'not_started | in_progress | completed | cancelled'),
  ('Risks',               'Issue',                 'project_risks',      'issue',              'text',     true,  NULL),
  ('Risks',               'Risk Level',            'project_risks',      'risk_level',         'text',     false, 'low | medium | high | critical'),
  ('Risks',               'Owner',                 'project_risks',      'owner',              'text',     false, NULL),
  ('Risks',               'Status',                'project_risks',      'status',             'text',     false, 'open | mitigating | closed'),
  ('Team',                'Name',                  'project_team_members', 'person_name',      'text',     true,  NULL),
  ('Team',                'Role',                  'project_team_members', 'role_title',       'text',     false, NULL),
  ('Team',                'Allocation %',          'project_team_members', 'allocation_pct',   'percent',  false, NULL),
  ('Team',                'Monthly Cost',          'project_team_compensation', 'monthly_cost','currency', false, 'Restricted: Admin and ED only');

-- The seed itself is written by the owner, so audit rows record actor_role = owner.
-- Clear them: they describe seeding, not real changes.
TRUNCATE TABLE audit_log RESTART IDENTITY;
