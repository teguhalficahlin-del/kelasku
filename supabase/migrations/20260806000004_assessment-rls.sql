-- Migration: 20260806000004_assessment-rls.sql
-- Tujuan: Helper functions + RLS untuk 5 tabel penilaian
-- Idempotent: CREATE OR REPLACE + DO...EXCEPTION
-- Prereq: 20260806000003 (tabel penilaian sudah ada)
-- ORTU isolation: via classroom_members.linked_student_id (tidak ada parent_children)

-- ============================================================
-- HELPER 1: fn_is_my_lo
-- Cek apakah learning_objective milik guru yang sedang login
-- ============================================================
CREATE OR REPLACE FUNCTION fn_is_my_lo(p_lo_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM learning_objectives
    WHERE learning_objective_id = p_lo_id
      AND teacher_id = fn_current_profile_id()
      AND fn_is_classroom_owner(classroom_id)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION fn_is_my_lo(UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION fn_is_my_lo(UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION fn_is_my_lo(UUID) FROM PUBLIC;

-- ============================================================
-- HELPER 2: fn_lo_in_my_classroom
-- Cek apakah LO berada di classroom yang diikuti user (siswa/ortu)
-- ============================================================
CREATE OR REPLACE FUNCTION fn_lo_in_my_classroom(p_lo_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM learning_objectives lo
    WHERE lo.learning_objective_id = p_lo_id
      AND fn_is_classroom_member(lo.classroom_id)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION fn_lo_in_my_classroom(UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION fn_lo_in_my_classroom(UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION fn_lo_in_my_classroom(UUID) FROM PUBLIC;

-- ============================================================
-- HELPER 3: fn_grading_is_published
-- Cek apakah grading_settings untuk LO + classroom sudah is_published = true
-- ============================================================
CREATE OR REPLACE FUNCTION fn_grading_is_published(p_lo_id UUID, p_classroom_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM grading_settings gs
    JOIN learning_objectives lo
      ON lo.classroom_id  = gs.classroom_id
     AND lo.academic_year = gs.academic_year
     AND lo.semester      = gs.semester
    WHERE lo.learning_objective_id = p_lo_id
      AND gs.classroom_id          = p_classroom_id
      AND gs.is_published          = true
  );
END;
$$;

GRANT EXECUTE ON FUNCTION fn_grading_is_published(UUID, UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION fn_grading_is_published(UUID, UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION fn_grading_is_published(UUID, UUID) FROM PUBLIC;

-- ============================================================
-- HELPER 4: fn_grade_published_for_me
-- Untuk SISWA: cek grade_summaries sudah published untuk diri sendiri
-- ============================================================
CREATE OR REPLACE FUNCTION fn_grade_published_for_me(p_lo_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_classroom_id UUID;
  v_academic_year VARCHAR(9);
  v_semester INTEGER;
BEGIN
  SELECT lo.classroom_id, lo.academic_year, lo.semester
    INTO v_classroom_id, v_academic_year, v_semester
    FROM learning_objectives lo
   WHERE lo.learning_objective_id = p_lo_id;

  IF v_classroom_id IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM grade_summaries gs
    WHERE gs.classroom_id  = v_classroom_id
      AND gs.academic_year = v_academic_year
      AND gs.semester      = v_semester
      AND gs.student_id    = fn_current_profile_id()
      AND gs.published_at  IS NOT NULL
      AND fn_is_classroom_member(gs.classroom_id)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION fn_grade_published_for_me(UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION fn_grade_published_for_me(UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION fn_grade_published_for_me(UUID) FROM PUBLIC;

-- ============================================================
-- HELPER 5: fn_grade_published_for_child
-- Untuk ORTU: cek grade_summaries anak sudah published
-- Relasi ortu-siswa via classroom_members.linked_student_id
-- ============================================================
CREATE OR REPLACE FUNCTION fn_grade_published_for_child(p_lo_id UUID, p_student_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_classroom_id UUID;
  v_academic_year VARCHAR(9);
  v_semester INTEGER;
BEGIN
  SELECT lo.classroom_id, lo.academic_year, lo.semester
    INTO v_classroom_id, v_academic_year, v_semester
    FROM learning_objectives lo
   WHERE lo.learning_objective_id = p_lo_id;

  IF v_classroom_id IS NULL THEN
    RETURN false;
  END IF;

  -- Cek ortu terdaftar di classroom sebagai ORTU yang memantau p_student_id
  IF NOT EXISTS (
    SELECT 1 FROM classroom_members cm
    WHERE cm.classroom_id      = v_classroom_id
      AND cm.profile_id        = fn_current_profile_id()
      AND cm.member_role       = 'ORTU'
      AND cm.linked_student_id = p_student_id
  ) THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM grade_summaries gs
    WHERE gs.classroom_id  = v_classroom_id
      AND gs.academic_year = v_academic_year
      AND gs.semester      = v_semester
      AND gs.student_id    = p_student_id
      AND gs.published_at  IS NOT NULL
  );
END;
$$;

GRANT EXECUTE ON FUNCTION fn_grade_published_for_child(UUID, UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION fn_grade_published_for_child(UUID, UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION fn_grade_published_for_child(UUID, UUID) FROM PUBLIC;

-- ============================================================
-- RLS — enable semua 5 tabel
-- ============================================================
DO $$ BEGIN ALTER TABLE learning_objectives  ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN others THEN null; END $$;
DO $$ BEGIN ALTER TABLE assessment_criteria  ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN others THEN null; END $$;
DO $$ BEGIN ALTER TABLE grading_settings     ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN others THEN null; END $$;
DO $$ BEGIN ALTER TABLE tp_assessments       ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN others THEN null; END $$;
DO $$ BEGIN ALTER TABLE grade_summaries      ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN others THEN null; END $$;

-- ============================================================
-- RLS: learning_objectives
-- ============================================================
DO $$ BEGIN
  CREATE POLICY "lo_guru_select" ON learning_objectives
    FOR SELECT TO authenticated
    USING (
      fn_is_my_lo(learning_objective_id)
      OR fn_is_classroom_owner(classroom_id)
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "lo_guru_insert" ON learning_objectives
    FOR INSERT TO authenticated
    WITH CHECK (
      teacher_id = fn_current_profile_id()
      AND fn_is_classroom_owner(classroom_id)
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "lo_guru_update" ON learning_objectives
    FOR UPDATE TO authenticated
    USING (fn_is_my_lo(learning_objective_id));
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "lo_guru_delete" ON learning_objectives
    FOR DELETE TO authenticated
    USING (fn_is_my_lo(learning_objective_id));
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "lo_siswa_select" ON learning_objectives
    FOR SELECT TO authenticated
    USING (
      fn_lo_in_my_classroom(learning_objective_id)
      AND fn_grading_is_published(learning_objective_id, classroom_id)
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "lo_ortu_select" ON learning_objectives
    FOR SELECT TO authenticated
    USING (
      fn_lo_in_my_classroom(learning_objective_id)
      AND fn_grading_is_published(learning_objective_id, classroom_id)
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ============================================================
-- RLS: assessment_criteria
-- ============================================================
DO $$ BEGIN
  CREATE POLICY "ac_guru_select" ON assessment_criteria
    FOR SELECT TO authenticated
    USING (
      fn_is_my_lo(learning_objective_id)
      OR fn_is_classroom_owner(classroom_id)
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "ac_guru_insert" ON assessment_criteria
    FOR INSERT TO authenticated
    WITH CHECK (fn_is_my_lo(learning_objective_id));
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "ac_guru_update" ON assessment_criteria
    FOR UPDATE TO authenticated
    USING (fn_is_my_lo(learning_objective_id));
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "ac_guru_delete" ON assessment_criteria
    FOR DELETE TO authenticated
    USING (fn_is_my_lo(learning_objective_id));
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "ac_siswa_select" ON assessment_criteria
    FOR SELECT TO authenticated
    USING (
      fn_grading_is_published(learning_objective_id, classroom_id)
      AND fn_lo_in_my_classroom(learning_objective_id)
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "ac_ortu_select" ON assessment_criteria
    FOR SELECT TO authenticated
    USING (
      fn_grading_is_published(learning_objective_id, classroom_id)
      AND fn_lo_in_my_classroom(learning_objective_id)
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ============================================================
-- RLS: tp_assessments
-- ============================================================
DO $$ BEGIN
  CREATE POLICY "tpa_guru_select" ON tp_assessments
    FOR SELECT TO authenticated
    USING (fn_is_classroom_owner(classroom_id));
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "tpa_guru_insert" ON tp_assessments
    FOR INSERT TO authenticated
    WITH CHECK (
      teacher_id = fn_current_profile_id()
      AND fn_is_classroom_owner(classroom_id)
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- UPDATE dijaga trigger trg_guard_tp_assessment_update, bukan RLS

DO $$ BEGIN
  CREATE POLICY "tpa_siswa_select" ON tp_assessments
    FOR SELECT TO authenticated
    USING (
      fn_is_classroom_member(classroom_id)
      AND student_id = fn_current_profile_id()
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "tpa_ortu_select" ON tp_assessments
    FOR SELECT TO authenticated
    USING (
      fn_is_classroom_member(classroom_id)
      AND EXISTS (
        SELECT 1 FROM classroom_members cm
        WHERE cm.profile_id        = fn_current_profile_id()
          AND cm.member_role       = 'ORTU'
          AND cm.linked_student_id = tp_assessments.student_id
          AND cm.classroom_id      = tp_assessments.classroom_id
      )
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ============================================================
-- RLS: grading_settings
-- ============================================================
DO $$ BEGIN
  CREATE POLICY "gs_guru_select" ON grading_settings
    FOR SELECT TO authenticated
    USING (fn_is_classroom_owner(classroom_id));
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "gs_guru_insert" ON grading_settings
    FOR INSERT TO authenticated
    WITH CHECK (
      teacher_id = fn_current_profile_id()
      AND fn_is_classroom_owner(classroom_id)
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "gs_guru_update" ON grading_settings
    FOR UPDATE TO authenticated
    USING (fn_is_classroom_owner(classroom_id));
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- SISWA dan ORTU tidak ada akses ke grading_settings

-- ============================================================
-- RLS: grade_summaries
-- ============================================================
DO $$ BEGIN
  CREATE POLICY "gsum_guru_select" ON grade_summaries
    FOR SELECT TO authenticated
    USING (fn_is_classroom_owner(classroom_id));
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "gsum_guru_update" ON grade_summaries
    FOR UPDATE TO authenticated
    USING (
      fn_is_classroom_owner(classroom_id)
      AND teacher_id = fn_current_profile_id()
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "gsum_siswa_select" ON grade_summaries
    FOR SELECT TO authenticated
    USING (
      fn_is_classroom_member(classroom_id)
      AND student_id  = fn_current_profile_id()
      AND published_at IS NOT NULL
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "gsum_ortu_select" ON grade_summaries
    FOR SELECT TO authenticated
    USING (
      published_at IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM classroom_members cm
        WHERE cm.profile_id        = fn_current_profile_id()
          AND cm.member_role       = 'ORTU'
          AND cm.linked_student_id = grade_summaries.student_id
          AND cm.classroom_id      = grade_summaries.classroom_id
      )
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;
