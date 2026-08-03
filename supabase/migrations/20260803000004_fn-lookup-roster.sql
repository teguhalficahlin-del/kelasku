-- Migration: fn_lookup_roster
-- Masalah: query classroom_roster via .ilike() ditolak untuk anon.
-- Dipakai oleh siswa (verifikasi NIS) dan ortu (verifikasi nama+NIS)
-- sebelum mereka punya akun.

CREATE OR REPLACE FUNCTION fn_lookup_roster_by_nis(
  p_classroom_id uuid,
  p_nis          text
)
RETURNS TABLE (
  id         uuid,
  full_name  text,
  nis        text,
  profile_id uuid
)
LANGUAGE sql
SECURITY DEFINER AS $$
  SELECT id, full_name, nis, profile_id
  FROM classroom_roster
  WHERE classroom_id = p_classroom_id
    AND nis = p_nis
  LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION fn_lookup_roster_by_nis FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fn_lookup_roster_by_nis FROM anon;
GRANT EXECUTE ON FUNCTION fn_lookup_roster_by_nis TO anon;
GRANT EXECUTE ON FUNCTION fn_lookup_roster_by_nis TO authenticated;

CREATE OR REPLACE FUNCTION fn_lookup_roster_by_name_nis(
  p_classroom_id uuid,
  p_full_name    text,
  p_nis          text
)
RETURNS TABLE (
  id         uuid,
  full_name  text,
  nis        text,
  profile_id uuid
)
LANGUAGE sql
SECURITY DEFINER AS $$
  SELECT id, full_name, nis, profile_id
  FROM classroom_roster
  WHERE classroom_id = p_classroom_id
    AND lower(full_name) = lower(p_full_name)
    AND nis = p_nis
  LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION fn_lookup_roster_by_name_nis FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fn_lookup_roster_by_name_nis FROM anon;
GRANT EXECUTE ON FUNCTION fn_lookup_roster_by_name_nis TO anon;
GRANT EXECUTE ON FUNCTION fn_lookup_roster_by_name_nis TO authenticated;
