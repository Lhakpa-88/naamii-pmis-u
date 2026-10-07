-- Tighten the users directory policy: it must require a signed-in, active user.
-- (Found by the authorization test suite: an unauthenticated session could list active users.)
DROP POLICY IF EXISTS users_select ON users;
CREATE POLICY users_select ON users FOR SELECT USING (
     app.is_admin()
  OR id = app.current_user_id()
  OR (active AND app.current_user_role() IS NOT NULL)
);
