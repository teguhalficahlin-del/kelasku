-- Perbaikan RLS penilaian untuk siswa dan ortu.
--
-- Masalah: assessment_results.student_id dan grade_recap.student_id menunjuk
-- classroom_roster(id), sementara policy siswa/ortu membandingkannya dengan
-- fn_current_profile_id() dan classroom_members.linked_student_id — keduanya
-- berisi profiles(id). Dua ruang UUID yang berbeda, tidak pernah cocok, sehingga
-- siswa dan ortu dipastikan tidak dapat melihat nilai mereka sendiri.
--
-- Perbaikan: terjemahkan lebih dulu profil -> baris roster lewat dua fungsi
-- SECURITY DEFINER, sesuai konvensi CLAUDE.md §11 (bukan EXISTS mentah di policy).

BEGIN;

-- Baris roster milik pengguna saat ini (peran SISWA)
CREATE OR REPLACE FUNCTION fn_current_roster_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT r.id
  FROM classroom_roster r
  WHERE r.profile_id = fn_current_profile_id();
$$;

REVOKE EXECUTE ON FUNCTION fn_current_roster_ids() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fn_current_roster_ids() FROM anon;
GRANT  EXECUTE ON FUNCTION fn_current_roster_ids() TO authenticated;

-- Baris roster anak yang ditautkan ke pengguna saat ini (peran ORTU)
CREATE OR REPLACE FUNCTION fn_child_roster_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT r.id
  FROM classroom_roster r
  JOIN classroom_members cm
    ON cm.linked_student_id = r.profile_id
   AND cm.classroom_id      = r.classroom_id
  WHERE cm.profile_id  = fn_current_profile_id()
    AND cm.member_role = 'ORTU'::member_role;
$$;

REVOKE EXECUTE ON FUNCTION fn_child_roster_ids() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fn_child_roster_ids() FROM anon;
GRANT  EXECUTE ON FUNCTION fn_child_roster_ids() TO authenticated;

-- assessment_results
DROP POLICY IF EXISTS ar_siswa_select ON assessment_results;
CREATE POLICY ar_siswa_select ON assessment_results
  FOR SELECT TO authenticated
  USING (
    fn_is_classroom_member(classroom_id)
    AND student_id IN (SELECT fn_current_roster_ids())
  );

DROP POLICY IF EXISTS ar_ortu_select ON assessment_results;
CREATE POLICY ar_ortu_select ON assessment_results
  FOR SELECT TO authenticated
  USING (student_id IN (SELECT fn_child_roster_ids()));

-- grade_recap — cacat yang sama; diperbaiki sekalian agar tidak terulang
DROP POLICY IF EXISTS gr_siswa_select ON grade_recap;
CREATE POLICY gr_siswa_select ON grade_recap
  FOR SELECT TO authenticated
  USING (
    fn_is_classroom_member(classroom_id)
    AND student_id IN (SELECT fn_current_roster_ids())
  );

DROP POLICY IF EXISTS gr_ortu_select ON grade_recap;
CREATE POLICY gr_ortu_select ON grade_recap
  FOR SELECT TO authenticated
  USING (student_id IN (SELECT fn_child_roster_ids()));

COMMIT;

-- Catatan: student_groups sengaja TIDAK diubah. Pengelompokan diferensiasi
-- adalah alat kerja guru; membukanya ke siswa/ortu adalah keputusan produk
-- tersendiri, bukan bagian dari perbaikan cacat ini.
