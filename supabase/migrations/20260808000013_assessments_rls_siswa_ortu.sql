-- Migration: 20260808000013_assessments_rls_siswa_ortu.sql
-- Tujuan: Tambah RLS SELECT untuk siswa dan ortu di tabel assessments
-- Idempotent: DO $$ IF NOT EXISTS $$

BEGIN;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'assessments' AND policyname = 'as_siswa_select'
  ) THEN
    CREATE POLICY as_siswa_select ON assessments FOR SELECT TO authenticated
      USING (fn_is_classroom_member(classroom_id));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'assessments' AND policyname = 'as_ortu_select'
  ) THEN
    CREATE POLICY as_ortu_select ON assessments FOR SELECT TO authenticated
      USING (EXISTS (
        SELECT 1 FROM classroom_members cm
        WHERE cm.profile_id = fn_current_profile_id()
          AND cm.member_role = 'ORTU'
          AND cm.linked_student_id IS NOT NULL
          AND cm.classroom_id = assessments.classroom_id
      ));
  END IF;
END $$;

COMMIT;
