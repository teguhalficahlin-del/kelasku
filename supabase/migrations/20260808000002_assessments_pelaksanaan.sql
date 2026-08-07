BEGIN;

-- ============================================================
-- Bagian 1: Bersihkan student_grades
-- Verified: COUNT(*) = 1, judul = 'Ulangan Harian: Menggambar bangunan',
-- assessment_item_id = NULL (data test) — aman untuk DELETE.
-- ============================================================

DELETE FROM student_grades;
ALTER TABLE student_grades DROP CONSTRAINT IF EXISTS uq_student_grades;

-- ============================================================
-- Bagian 2: Tabel assessments
-- ============================================================

CREATE TABLE IF NOT EXISTS assessments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id  UUID NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
  teacher_id    UUID NOT NULL REFERENCES profiles(id),
  academic_year VARCHAR NOT NULL,
  semester      SMALLINT NOT NULL CHECK (semester IN (1, 2)),
  judul         TEXT NOT NULL,
  teknik        TEXT,
  tanggal       DATE,
  jenis         TEXT NOT NULL CHECK (jenis IN ('DIAGNOSTIK_NK', 'DIAGNOSTIK_K', 'FORMATIF', 'SUMATIF')),
  tp_id         UUID REFERENCES assessment_items(id) ON DELETE SET NULL,
  tindak_lanjut TEXT CHECK (tindak_lanjut IN ('PENGAYAAN', 'PENGUATAN', 'PENDAMPINGAN')),
  catatan_tl    TEXT,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE assessments ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'assessments' AND policyname = 'as_guru_select') THEN
    CREATE POLICY as_guru_select ON assessments FOR SELECT TO authenticated
      USING (fn_is_classroom_owner(classroom_id));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'assessments' AND policyname = 'as_guru_insert') THEN
    CREATE POLICY as_guru_insert ON assessments FOR INSERT TO authenticated
      WITH CHECK (teacher_id = fn_current_profile_id() AND fn_is_classroom_owner(classroom_id));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'assessments' AND policyname = 'as_guru_update') THEN
    CREATE POLICY as_guru_update ON assessments FOR UPDATE TO authenticated
      USING (teacher_id = fn_current_profile_id() AND fn_is_classroom_owner(classroom_id));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'assessments' AND policyname = 'as_guru_delete') THEN
    CREATE POLICY as_guru_delete ON assessments FOR DELETE TO authenticated
      USING (teacher_id = fn_current_profile_id() AND fn_is_classroom_owner(classroom_id));
  END IF;
END $$;

-- ============================================================
-- Bagian 3: Alter student_grades — tambah assessment_id + constraint baru
-- ============================================================

ALTER TABLE student_grades
  ADD COLUMN IF NOT EXISTS assessment_id UUID REFERENCES assessments(id) ON DELETE CASCADE;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'uq_student_grades_assessment'
      AND table_name = 'student_grades'
  ) THEN
    ALTER TABLE student_grades
      ADD CONSTRAINT uq_student_grades_assessment
      UNIQUE (classroom_id, student_id, assessment_id);
  END IF;
END $$;

-- ============================================================
-- Bagian 4: Tabel assessment_kktp_results
-- Keputusan arsitektur: teacher_id disimpan di baris agar RLS INSERT
-- dapat memakai `teacher_id = fn_current_profile_id()` tanpa JOIN ke
-- tabel assessments — lebih bersih, tidak perlu subquery SECURITY DEFINER.
-- ============================================================

CREATE TABLE IF NOT EXISTS assessment_kktp_results (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  student_id    UUID NOT NULL REFERENCES profiles(id),
  kktp_id       UUID NOT NULL REFERENCES assessment_items(id) ON DELETE CASCADE,
  classroom_id  UUID NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
  teacher_id    UUID NOT NULL REFERENCES profiles(id),
  tercapai      BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE (assessment_id, student_id, kktp_id)
);

ALTER TABLE assessment_kktp_results ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'assessment_kktp_results' AND policyname = 'akr_guru_select') THEN
    CREATE POLICY akr_guru_select ON assessment_kktp_results FOR SELECT TO authenticated
      USING (fn_is_classroom_owner(classroom_id));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'assessment_kktp_results' AND policyname = 'akr_guru_insert') THEN
    CREATE POLICY akr_guru_insert ON assessment_kktp_results FOR INSERT TO authenticated
      WITH CHECK (teacher_id = fn_current_profile_id() AND fn_is_classroom_owner(classroom_id));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'assessment_kktp_results' AND policyname = 'akr_guru_update') THEN
    CREATE POLICY akr_guru_update ON assessment_kktp_results FOR UPDATE TO authenticated
      USING (teacher_id = fn_current_profile_id() AND fn_is_classroom_owner(classroom_id));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'assessment_kktp_results' AND policyname = 'akr_guru_delete') THEN
    CREATE POLICY akr_guru_delete ON assessment_kktp_results FOR DELETE TO authenticated
      USING (teacher_id = fn_current_profile_id() AND fn_is_classroom_owner(classroom_id));
  END IF;
END $$;

COMMIT;
