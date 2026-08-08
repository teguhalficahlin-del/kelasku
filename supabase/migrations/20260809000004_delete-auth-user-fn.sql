CREATE OR REPLACE FUNCTION delete_auth_user(uid UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public
AS $$
BEGIN
  DELETE FROM auth.users WHERE id = uid;
END;
$$;

REVOKE EXECUTE ON FUNCTION delete_auth_user(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION delete_auth_user(UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION delete_auth_user(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION delete_auth_user(UUID) TO service_role;
