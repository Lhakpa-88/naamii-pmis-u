-- NAAMII PMIS — sign-in with user ID (e-mail) and password  (PMIS_AUTH_MODE=password)
--
-- Passwords are never stored: only a salted bcrypt hash (pgcrypto), in a table
-- the web application's database role cannot read at all. Everything goes
-- through the SECURITY DEFINER functions below, which
--   * check a password without revealing whether the user ID exists,
--   * lock an account for 15 minutes after 5 wrong passwords,
--   * let only an administrator, or the user themself, set a password,
--   * record every password change in the audit log (never the password).

CREATE TABLE user_credentials (
  user_id         uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  password_hash   text NOT NULL,
  must_change     boolean NOT NULL DEFAULT true,   -- set by an administrator → user must choose their own
  failed_attempts integer NOT NULL DEFAULT 0,
  locked_until    timestamptz,
  password_set_at timestamptz NOT NULL DEFAULT now(),
  last_login_at   timestamptz
);
-- RLS on with no policy and no GRANT: pmis_app can neither read nor write this table directly.
ALTER TABLE user_credentials ENABLE ROW LEVEL SECURITY;

-- Check a user ID + password. One row is always returned; `user_id` is set only on success.
--   status: ok | invalid | locked
CREATE OR REPLACE FUNCTION app.password_login(p_email text, p_password text)
RETURNS TABLE (user_id uuid, must_change boolean, status text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, app AS $$
DECLARE
  c record;
BEGIN
  SELECT u.id, k.password_hash, k.must_change, k.locked_until, k.failed_attempts INTO c
  FROM users u JOIN user_credentials k ON k.user_id = u.id
  WHERE u.active AND u.email = btrim(p_email)::citext;

  IF NOT FOUND THEN
    PERFORM crypt(coalesce(p_password, ''), gen_salt('bf', 10));   -- same work as a real check
    RETURN QUERY SELECT NULL::uuid, false, 'invalid'::text;
    RETURN;
  END IF;
  IF c.locked_until IS NOT NULL AND c.locked_until > now() THEN
    RETURN QUERY SELECT NULL::uuid, false, 'locked'::text;
    RETURN;
  END IF;
  IF crypt(coalesce(p_password, ''), c.password_hash) = c.password_hash THEN
    UPDATE user_credentials k SET failed_attempts = 0, locked_until = NULL, last_login_at = now() WHERE k.user_id = c.id;
    RETURN QUERY SELECT c.id, c.must_change, 'ok'::text;
    RETURN;
  END IF;
  UPDATE user_credentials k
     SET failed_attempts = CASE WHEN c.failed_attempts + 1 >= 5 THEN 0 ELSE c.failed_attempts + 1 END,
         locked_until    = CASE WHEN c.failed_attempts + 1 >= 5 THEN now() + interval '15 minutes' ELSE NULL END
   WHERE k.user_id = c.id;
  RETURN QUERY SELECT NULL::uuid, false, CASE WHEN c.failed_attempts + 1 >= 5 THEN 'locked' ELSE 'invalid' END;
END $$;

-- Internal: store a new password hash and audit the change.
CREATE OR REPLACE FUNCTION app.store_password(p_user_id uuid, p_password text, p_must_change boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, app AS $$
BEGIN
  IF p_password IS NULL OR length(p_password) < 8 OR length(p_password) > 72 THEN
    RAISE EXCEPTION 'A password must be 8 to 72 characters long' USING ERRCODE = '23514', CONSTRAINT = 'password_length';
  END IF;
  INSERT INTO user_credentials (user_id, password_hash, must_change)
  VALUES (p_user_id, crypt(p_password, gen_salt('bf', 10)), p_must_change)
  ON CONFLICT (user_id) DO UPDATE
    SET password_hash = EXCLUDED.password_hash, must_change = EXCLUDED.must_change,
        failed_attempts = 0, locked_until = NULL, password_set_at = now();
  INSERT INTO audit_log (actor_user_id, actor_role, action, entity, entity_id, after)
  VALUES (app.current_user_id(), session_user, 'PASSWORD_SET', 'user_credentials', p_user_id::text,
          jsonb_build_object('must_change', p_must_change));
END $$;
REVOKE ALL ON FUNCTION app.store_password(uuid, text, boolean) FROM PUBLIC;

-- Administrator sets or resets someone's password (the person must then choose their own).
CREATE OR REPLACE FUNCTION app.admin_set_password(p_user_id uuid, p_password text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, app AS $$
BEGIN
  IF app.is_admin() IS NOT TRUE THEN
    RAISE EXCEPTION 'Only an administrator may set another user''s password' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'Unknown user' USING ERRCODE = '23503';
  END IF;
  -- An administrator resetting their own password need not be forced to change it again.
  PERFORM app.store_password(p_user_id, p_password, p_user_id <> app.current_user_id());
END $$;

-- A signed-in user changes their own password; the current one must be given.
CREATE OR REPLACE FUNCTION app.change_own_password(p_current text, p_new text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, app AS $$
DECLARE
  v_hash text;
BEGIN
  SELECT k.password_hash INTO v_hash FROM user_credentials k JOIN users u ON u.id = k.user_id
  WHERE k.user_id = app.current_user_id() AND u.active;
  IF NOT FOUND OR crypt(coalesce(p_current, ''), v_hash) <> v_hash THEN
    RETURN false;
  END IF;
  PERFORM app.store_password(app.current_user_id(), p_new, false);
  RETURN true;
END $$;

-- The signed-in user behind a session cookie (active users only).
CREATE OR REPLACE FUNCTION app.session_user(p_user_id uuid)
RETURNS TABLE (id uuid, email citext, name text, role user_role, lab_id uuid, must_change boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, app AS $$
  SELECT u.id, u.email, u.name, u.role, u.lab_id, COALESCE(k.must_change, false)
  FROM users u LEFT JOIN user_credentials k ON k.user_id = u.id
  WHERE u.id = p_user_id AND u.active
$$;

-- For the Users & Roles page: password state per user (administrators only; never the hash).
CREATE OR REPLACE FUNCTION app.password_status()
RETURNS TABLE (user_id uuid, has_password boolean, must_change boolean, locked boolean, last_login_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, app AS $$
  SELECT k.user_id, true, k.must_change, (k.locked_until IS NOT NULL AND k.locked_until > now()), k.last_login_at
  FROM user_credentials k WHERE app.is_admin()
$$;

GRANT EXECUTE ON FUNCTION app.password_login(text, text), app.admin_set_password(uuid, text),
                          app.change_own_password(text, text), app.session_user(uuid), app.password_status() TO pmis_app;
