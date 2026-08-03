-- Migration: 20260804000002_fix-fk-hapus-akun.sql
-- Fix FK ON DELETE untuk support hapus akun siswa + ortu

BEGIN;

-- classroom_roster.profile_id: NO ACTION → SET NULL
-- Saat profiles siswa dihapus, baris roster tetap ada (data historis), profile_id menjadi NULL
ALTER TABLE classroom_roster
  DROP CONSTRAINT classroom_roster_profile_id_fkey,
  ADD CONSTRAINT classroom_roster_profile_id_fkey
    FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE SET NULL;

-- classroom_members.linked_student_id: NO ACTION → CASCADE
-- Saat profiles siswa dihapus, baris ortu di classroom_members ikut terhapus
ALTER TABLE classroom_members
  DROP CONSTRAINT classroom_members_linked_student_id_fkey,
  ADD CONSTRAINT classroom_members_linked_student_id_fkey
    FOREIGN KEY (linked_student_id) REFERENCES profiles(id) ON DELETE CASCADE;

COMMIT;
