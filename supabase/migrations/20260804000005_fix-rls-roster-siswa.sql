-- Migration: 20260804000005_fix-rls-roster-siswa.sql
-- Defense-in-depth: tambah filter classroom_id pada pol_roster_siswa_select
-- Siswa hanya bisa baca baris roster di classroom yang mereka ikuti,
-- bukan hanya berdasarkan profile_id saja.

BEGIN;

DROP POLICY IF EXISTS pol_roster_siswa_select ON classroom_roster;

CREATE POLICY pol_roster_siswa_select ON classroom_roster
  FOR SELECT
  TO authenticated
  USING (
    profile_id = fn_current_profile_id()
    AND fn_is_classroom_member(classroom_id)
  );

COMMIT;
