-- Fix FK student_id → profiles(id) tanpa ON DELETE clause
-- Memblokir deleteUser saat hapus akun siswa
-- Nama constraint lama: sisa dari rename tabel (grade_summaries → student_grades)

ALTER TABLE student_grades
  DROP CONSTRAINT IF EXISTS grade_summaries_student_id_fkey,
  DROP CONSTRAINT IF EXISTS student_grades_student_id_fkey;
ALTER TABLE student_grades
  ADD CONSTRAINT student_grades_student_id_fkey
    FOREIGN KEY (student_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE assessment_kktp_results
  DROP CONSTRAINT IF EXISTS assessment_kktp_results_student_id_fkey;
ALTER TABLE assessment_kktp_results
  ADD CONSTRAINT assessment_kktp_results_student_id_fkey
    FOREIGN KEY (student_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE assessment_rubric_results
  DROP CONSTRAINT IF EXISTS assessment_rubric_results_student_id_fkey;
ALTER TABLE assessment_rubric_results
  ADD CONSTRAINT assessment_rubric_results_student_id_fkey
    FOREIGN KEY (student_id) REFERENCES profiles(id) ON DELETE CASCADE;
