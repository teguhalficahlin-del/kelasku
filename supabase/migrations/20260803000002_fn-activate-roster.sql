-- Migration: fn_activate_roster
-- Solusi RLS: siswa tidak bisa UPDATE classroom_roster langsung
-- karena profile_id masih NULL saat akun baru dibuat.
-- Fungsi ini melakukan UPDATE via SECURITY DEFINER dengan kondisi ketat.

CREATE OR REPLACE FUNCTION fn_activate_roster(p_roster_id uuid, p_profile_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER AS $$
  UPDATE classroom_roster
  SET profile_id = p_profile_id
  WHERE id = p_roster_id
    AND profile_id IS NULL;
$$;

REVOKE EXECUTE ON FUNCTION fn_activate_roster FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fn_activate_roster FROM anon;
GRANT EXECUTE ON FUNCTION fn_activate_roster TO authenticated;
