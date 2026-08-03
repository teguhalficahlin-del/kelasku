-- Migration: fn_lookup_profile_name
-- Masalah: dashboard ortu query profiles untuk nama guru dan nama siswa
-- ditolak RLS karena profiles hanya bisa diakses oleh pemiliknya.
-- Fungsi ini return full_name berdasarkan profile id — data minimal,
-- tidak ada data sensitif yang diekspos.

CREATE OR REPLACE FUNCTION fn_lookup_profile_name(p_profile_id uuid)
RETURNS text
LANGUAGE sql
SECURITY DEFINER AS $$
  SELECT full_name
  FROM profiles
  WHERE id = p_profile_id
  LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION fn_lookup_profile_name FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fn_lookup_profile_name FROM anon;
GRANT EXECUTE ON FUNCTION fn_lookup_profile_name TO authenticated;
