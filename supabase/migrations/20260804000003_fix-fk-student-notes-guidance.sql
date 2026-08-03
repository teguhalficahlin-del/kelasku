-- Migration: 20260804000003_fix-fk-student-notes-guidance.sql
-- Fix FK ON DELETE untuk student_notes.student_id dan guidance_sessions.student_id
-- SET NULL: catatan/sesi tetap ada sebagai data historis guru setelah akun siswa dihapus
-- NOT NULL harus di-drop dulu karena ON DELETE SET NULL perlu kolom nullable

BEGIN;

ALTER TABLE student_notes
  ALTER COLUMN student_id DROP NOT NULL,
  DROP CONSTRAINT student_notes_student_id_fkey,
  ADD CONSTRAINT student_notes_student_id_fkey
    FOREIGN KEY (student_id) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE guidance_sessions
  ALTER COLUMN student_id DROP NOT NULL,
  DROP CONSTRAINT guidance_sessions_student_id_fkey,
  ADD CONSTRAINT guidance_sessions_student_id_fkey
    FOREIGN KEY (student_id) REFERENCES profiles(id) ON DELETE SET NULL;

COMMIT;
