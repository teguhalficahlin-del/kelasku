-- Migration: fn_lookup_classroom_code
-- Masalah: query classrooms memerlukan authenticated session,
-- tapi siswa/ortu perlu verifikasi kode sebelum buat akun.
-- Solusi: SECURITY DEFINER function yang hanya return data minimal.

CREATE OR REPLACE FUNCTION fn_lookup_classroom_code(p_code text)
RETURNS TABLE (
  id             uuid,
  name           text,
  classroom_code text,
  teacher_id     uuid
)
LANGUAGE sql
SECURITY DEFINER AS $$
  SELECT id, name, classroom_code, teacher_id
  FROM classrooms
  WHERE classroom_code = upper(p_code)
    AND is_archived = false
  LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION fn_lookup_classroom_code FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fn_lookup_classroom_code FROM anon;
GRANT EXECUTE ON FUNCTION fn_lookup_classroom_code TO anon;
GRANT EXECUTE ON FUNCTION fn_lookup_classroom_code TO authenticated;
