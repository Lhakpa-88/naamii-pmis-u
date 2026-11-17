-- NAAMII PMIS — user management by Finance & Operations (the system administrator)
--
-- The privileges and policies already exist (0001/0002): only the admin role may
-- insert, update or delete users, pi_lab and project_assignments, and every such
-- change is written to audit_log. This migration adds the safeguards that make
-- handing that authority to one role safe.

-- 1. The system can never be left without an administrator, and an administrator
--    cannot remove their own authority (someone else must do it).
CREATE OR REPLACE FUNCTION app.guard_admin_accounts() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, app AS $$
DECLARE
  losing_admin boolean;
BEGIN
  losing_admin := OLD.role = 'admin' AND OLD.active
                  AND (TG_OP = 'DELETE' OR NEW.role <> 'admin' OR NOT NEW.active);
  IF NOT losing_admin THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF OLD.id = app.current_user_id() THEN
    RAISE EXCEPTION 'You cannot remove your own administrator access; ask another administrator'
      USING ERRCODE = '23514', CONSTRAINT = 'users_no_self_demotion';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM users WHERE role = 'admin' AND active AND id <> OLD.id) THEN
    RAISE EXCEPTION 'At least one active administrator must remain'
      USING ERRCODE = '23514', CONSTRAINT = 'users_last_admin';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

CREATE TRIGGER users_guard_admin BEFORE UPDATE OR DELETE ON users
  FOR EACH ROW EXECUTE FUNCTION app.guard_admin_accounts();

-- 2. Demo Mode sign-in: the six original demo accounts, plus any account an
--    administrator adds on the reserved demo domain (so a newly added user can be
--    tried out). Real accounts are never listed: they sign in with Microsoft Entra.
CREATE OR REPLACE FUNCTION app.demo_accounts()
RETURNS TABLE (id uuid, email citext, name text, role user_role, lab_id uuid, lab_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, app AS $$
  SELECT u.id, u.email, u.name, u.role, u.lab_id, l.name
  FROM users u LEFT JOIN labs l ON l.id = u.lab_id
  WHERE u.active AND u.email::text LIKE '%@naamii-demo.test'
    AND (u.id IN ('20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002',
                  '20000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000005',
                  '20000000-0000-4000-8000-000000000006','20000000-0000-4000-8000-000000000007')
         OR u.id::text NOT LIKE '20000000-0000-4000-8000-%')   -- added through Users & Roles, not seeded
  ORDER BY array_position(ARRAY['ed','pi','project_lead','admin']::user_role[], u.role), u.name
$$;
