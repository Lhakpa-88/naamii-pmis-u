-- NAAMII PMIS — Project Leads enter the monthly FORECAST for their own projects.
-- Budget, actual expenditure and committed amounts stay with Finance & Operations.
--
-- Row Level Security decides WHICH rows a lead may write (their own projects);
-- the trigger below decides WHICH figures: anything other than the forecast is
-- refused, whether it arrives from a form, an uploaded workbook or a crafted request.

CREATE POLICY financials_lead_insert ON project_financials FOR INSERT
  WITH CHECK (app.can_edit_project(project_id));
CREATE POLICY financials_lead_update ON project_financials FOR UPDATE
  USING (app.can_edit_project(project_id)) WITH CHECK (app.can_edit_project(project_id));
-- (No DELETE policy for leads: removing a month remains Finance & Operations only.)

CREATE OR REPLACE FUNCTION app.guard_financial_facts() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  -- Only the web application's non-admin users are restricted; Finance & Operations,
  -- the sync Function and migrations/seed write every figure.
  IF current_user <> 'pmis_app' OR app.is_admin() IS TRUE THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.budget <> 0 OR NEW.actual_expenditure <> 0 OR NEW.committed_amount <> 0 THEN
      RAISE EXCEPTION 'Only Finance & Operations may enter budget, actual or committed amounts'
        USING ERRCODE = '42501';
    END IF;
  ELSIF NEW.budget IS DISTINCT FROM OLD.budget
     OR NEW.actual_expenditure IS DISTINCT FROM OLD.actual_expenditure
     OR NEW.committed_amount IS DISTINCT FROM OLD.committed_amount
     OR NEW.project_id IS DISTINCT FROM OLD.project_id
     OR NEW.financial_period IS DISTINCT FROM OLD.financial_period THEN
    RAISE EXCEPTION 'Only Finance & Operations may change budget, actual or committed amounts, or move a month'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER project_financials_guard BEFORE INSERT OR UPDATE ON project_financials
  FOR EACH ROW EXECUTE FUNCTION app.guard_financial_facts();
