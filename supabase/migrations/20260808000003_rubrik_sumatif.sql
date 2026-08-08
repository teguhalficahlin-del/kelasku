BEGIN;

-- ============================================================
-- Bagian 1: Tambah kolom format_penilaian ke assessments
-- DEFAULT 'SKOR' — assessment existing otomatis mendapat nilai SKOR
-- ============================================================

ALTER TABLE assessments
  ADD COLUMN IF NOT EXISTS format_penilaian TEXT NOT NULL DEFAULT 'SKOR'
  CHECK (format_penilaian IN ('SKOR', 'RUBRIK'));

-- ============================================================
-- Bagian 2: Tabel assessment_rubric_criteria
-- Kriteria rubrik per entri penilaian Sumatif format RUBRIK
-- ============================================================

CREATE TABLE IF NOT EXISTS assessment_rubric_criteria (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  classroom_id  UUID NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
  teacher_id    UUID NOT NULL REFERENCES profiles(id),
  urutan        SMALLINT NOT NULL DEFAULT 1,
  judul         TEXT NOT NULL,
  bobot         NUMERIC(5,2) NOT NULL CHECK (bobot > 0 AND bobot <= 100),
  deskripsi_baru_berkembang TEXT,
  deskripsi_layak           TEXT,
  deskripsi_cakap           TEXT,
  deskripsi_mahir           TEXT,
  created_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE (assessment_id, urutan)
);

ALTER TABLE assessment_rubric_criteria ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
    WHERE tablename = 'assessment_rubric_criteria' AND policyname = 'arc_guru_select') THEN
    CREATE POLICY arc_guru_select ON assessment_rubric_criteria FOR SELECT TO authenticated
      USING (fn_is_classroom_owner(classroom_id));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
    WHERE tablename = 'assessment_rubric_criteria' AND policyname = 'arc_guru_insert') THEN
    CREATE POLICY arc_guru_insert ON assessment_rubric_criteria FOR INSERT TO authenticated
      WITH CHECK (teacher_id = fn_current_profile_id() AND fn_is_classroom_owner(classroom_id));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
    WHERE tablename = 'assessment_rubric_criteria' AND policyname = 'arc_guru_update') THEN
    CREATE POLICY arc_guru_update ON assessment_rubric_criteria FOR UPDATE TO authenticated
      USING (teacher_id = fn_current_profile_id() AND fn_is_classroom_owner(classroom_id));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
    WHERE tablename = 'assessment_rubric_criteria' AND policyname = 'arc_guru_delete') THEN
    CREATE POLICY arc_guru_delete ON assessment_rubric_criteria FOR DELETE TO authenticated
      USING (teacher_id = fn_current_profile_id() AND fn_is_classroom_owner(classroom_id));
  END IF;
END $$;

-- ============================================================
-- Bagian 3: Tabel assessment_rubric_results
-- Hasil level per siswa per kriteria
-- ============================================================

CREATE TABLE IF NOT EXISTS assessment_rubric_results (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  criteria_id   UUID NOT NULL REFERENCES assessment_rubric_criteria(id) ON DELETE CASCADE,
  student_id    UUID NOT NULL REFERENCES profiles(id),
  classroom_id  UUID NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
  teacher_id    UUID NOT NULL REFERENCES profiles(id),
  level         SMALLINT NOT NULL CHECK (level BETWEEN 1 AND 4),
  created_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE (assessment_id, criteria_id, student_id)
);

ALTER TABLE assessment_rubric_results ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
    WHERE tablename = 'assessment_rubric_results' AND policyname = 'arr_guru_select') THEN
    CREATE POLICY arr_guru_select ON assessment_rubric_results FOR SELECT TO authenticated
      USING (fn_is_classroom_owner(classroom_id));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
    WHERE tablename = 'assessment_rubric_results' AND policyname = 'arr_guru_insert') THEN
    CREATE POLICY arr_guru_insert ON assessment_rubric_results FOR INSERT TO authenticated
      WITH CHECK (teacher_id = fn_current_profile_id() AND fn_is_classroom_owner(classroom_id));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
    WHERE tablename = 'assessment_rubric_results' AND policyname = 'arr_guru_update') THEN
    CREATE POLICY arr_guru_update ON assessment_rubric_results FOR UPDATE TO authenticated
      USING (teacher_id = fn_current_profile_id() AND fn_is_classroom_owner(classroom_id));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
    WHERE tablename = 'assessment_rubric_results' AND policyname = 'arr_guru_delete') THEN
    CREATE POLICY arr_guru_delete ON assessment_rubric_results FOR DELETE TO authenticated
      USING (teacher_id = fn_current_profile_id() AND fn_is_classroom_owner(classroom_id));
  END IF;
END $$;

COMMIT;
