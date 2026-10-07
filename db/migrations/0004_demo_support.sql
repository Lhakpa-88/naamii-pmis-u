-- NAAMII PMIS — Demo Mode support
-- Lists the demo sign-in accounts for the sign-in page. Only accounts on the
-- reserved .test domain are ever returned, so this cannot expose real users.
-- The application calls it only when PMIS_AUTH_MODE=demo.
CREATE OR REPLACE FUNCTION app.demo_accounts()
RETURNS TABLE (id uuid, email citext, name text, role user_role, lab_id uuid, lab_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, app AS $$
  SELECT u.id, u.email, u.name, u.role, u.lab_id, l.name
  FROM users u LEFT JOIN labs l ON l.id = u.lab_id
  WHERE u.active AND u.email::text LIKE '%@naamii-demo.test'
    AND u.id IN ('20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002',
                 '20000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000005',
                 '20000000-0000-4000-8000-000000000006','20000000-0000-4000-8000-000000000007')
  ORDER BY array_position(ARRAY['ed','pi','project_lead','admin']::user_role[], u.role), u.name
$$;
GRANT EXECUTE ON FUNCTION app.demo_accounts() TO pmis_app;
