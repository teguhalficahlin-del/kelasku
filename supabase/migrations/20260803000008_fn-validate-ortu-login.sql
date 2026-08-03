-- Migration: fn_validate_ortu_login
-- Validasi nama anak + NIS di classroom_roster sebelum ortu signInWithPassword.
-- Dipanggil dari portal ortu sebelum user punya session → perlu GRANT ke anon.
-- Lookup via classroom_code (bukan classroom_id) karena ortu tidak tahu UUID.

CREATE OR REPLACE FUNCTION fn_validate_ortu_login(
  p_classroom_code TEXT,
  p_nis            TEXT,
  p_nama_anak      TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1
    FROM   classroom_roster cr
    JOIN   classrooms c ON c.id = cr.classroom_id
    WHERE  c.classroom_code  = upper(p_classroom_code)
      AND  c.is_archived     = false
      AND  cr.nis            = p_nis
      AND  lower(trim(cr.full_name)) = lower(trim(p_nama_anak))
  )
$$;

REVOKE EXECUTE ON FUNCTION fn_validate_ortu_login FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fn_validate_ortu_login FROM anon;
GRANT  EXECUTE ON FUNCTION fn_validate_ortu_login TO anon;
GRANT  EXECUTE ON FUNCTION fn_validate_ortu_login TO authenticated;
