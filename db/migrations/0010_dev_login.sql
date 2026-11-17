-- NAAMII PMIS — development sign-in  (PMIS_AUTH_MODE=dev)
--
-- For the development and testing phase only: sign in with a short user ID and
-- NO password.
--     Admin → Finance & Operations      PI → a Principal Investigator
--     PM    → a Project Lead            ED → the Executive Director
-- Each shortcut is the first active account with that role. A full e-mail
-- address also works, to try a specific account.
--
-- The web application refuses to start in this mode when NODE_ENV=production
-- (app/src/lib/env.ts). These functions are only called in that mode.

CREATE OR REPLACE FUNCTION app.dev_accounts()
RETURNS TABLE (shortcut text, id uuid, name text, role user_role, email citext)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, app AS $$
  SELECT DISTINCT ON (u.role)
         CASE u.role WHEN 'admin' THEN 'Admin' WHEN 'pi' THEN 'PI' WHEN 'project_lead' THEN 'PM' WHEN 'ed' THEN 'ED' END,
         u.id, u.name, u.role, u.email
  FROM users u
  WHERE u.active
  ORDER BY u.role, u.created_at, u.email
$$;

-- Resolve a typed user ID (shortcut or e-mail) to an active user; NULL when unknown.
CREATE OR REPLACE FUNCTION app.dev_login(p_user_id text) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, app AS $$
  SELECT id FROM (
    SELECT a.id, 1 AS pref FROM app.dev_accounts() a WHERE lower(a.shortcut) = lower(btrim(p_user_id))
    UNION ALL
    SELECT u.id, 2 FROM users u WHERE u.active AND u.email = btrim(p_user_id)::citext
  ) hit ORDER BY pref LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION app.dev_accounts(), app.dev_login(text) TO pmis_app;
