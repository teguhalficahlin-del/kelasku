-- Migration: 20260816000002_grade-recap-fk-roster.sql
-- Tujuan: Ubah grade_recap.student_id FK dari profiles(id)
--         ke classroom_roster(id), konsisten dengan assessment_results.
-- Root cause: assessment_results sudah diubah ke classroom_roster
--   (20260815000003) agar guru bisa menilai siswa belum aktivasi akun.
--   grade_recap harus mengikuti patokan yang sama.
-- grade_recap belum ada data produksi — aman DROP+ADD constraint.

BEGIN;

ALTER TABLE grade_recap
  DROP CONSTRAINT IF EXISTS grade_recap_student_id_fkey;

ALTER TABLE grade_recap
  ADD CONSTRAINT grade_recap_student_id_fkey
  FOREIGN KEY (student_id) REFERENCES classroom_roster(id) ON DELETE CASCADE;

COMMIT;
