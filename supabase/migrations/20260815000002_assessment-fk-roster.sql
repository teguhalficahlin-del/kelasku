-- Re-point assessment_results.student_id dan student_groups.student_id
-- dari profiles(id) ke classroom_roster(id).
-- Guru harus bisa menilai siswa yang belum aktivasi akun.
-- Kedua tabel kosong saat migration ini dibuat — tidak ada data terdampak.

BEGIN;

-- assessment_results
ALTER TABLE assessment_results
  DROP CONSTRAINT IF EXISTS assessment_results_student_id_fkey;

ALTER TABLE assessment_results
  ADD CONSTRAINT assessment_results_student_id_fkey
  FOREIGN KEY (student_id) REFERENCES classroom_roster(id) ON DELETE CASCADE;

-- student_groups
ALTER TABLE student_groups
  DROP CONSTRAINT IF EXISTS student_groups_student_id_fkey;

ALTER TABLE student_groups
  ADD CONSTRAINT student_groups_student_id_fkey
  FOREIGN KEY (student_id) REFERENCES classroom_roster(id) ON DELETE CASCADE;

COMMIT;
