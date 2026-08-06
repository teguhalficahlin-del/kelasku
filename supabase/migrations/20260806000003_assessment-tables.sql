-- Migration: 20260806000003_assessment-tables.sql
-- Tujuan: Buat 5 tabel penilaian + 2 trigger guard
-- Idempotent: CREATE IF NOT EXISTS, DO...EXCEPTION
-- Prereq: 20260806000001 (schema core), classrooms, profiles sudah ada

-- ============================================================
-- 1. learning_objectives
-- ============================================================
CREATE TABLE IF NOT EXISTS learning_objectives (
  learning_objective_id UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id          UUID        NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
  teacher_id            UUID        NOT NULL REFERENCES profiles(id),
  academic_year         VARCHAR(9)  NOT NULL,
  semester              INTEGER     NOT NULL CHECK (semester IN (1,2)),
  kode_tp               VARCHAR(30) NOT NULL,
  deskripsi_tp          TEXT        NOT NULL,
  urutan                INTEGER     NOT NULL DEFAULT 1,
  element_id            UUID        REFERENCES core.cp_elements(element_id) ON DELETE SET NULL,
  is_active             BOOLEAN     NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (classroom_id, teacher_id, academic_year, semester, kode_tp)
);

-- ============================================================
-- 2. assessment_criteria
-- ============================================================
CREATE TABLE IF NOT EXISTS assessment_criteria (
  criterion_id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  learning_objective_id     UUID        NOT NULL REFERENCES learning_objectives(learning_objective_id) ON DELETE CASCADE,
  classroom_id              UUID        NOT NULL REFERENCES classrooms(id),
  batas_bawah               NUMERIC(5,2) NOT NULL,
  batas_atas                NUMERIC(5,2) NOT NULL,
  predikat                  TEXT        NOT NULL,
  keterangan                TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 3. grading_settings
-- ============================================================
CREATE TABLE IF NOT EXISTS grading_settings (
  grading_setting_id    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id          UUID        NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
  teacher_id            UUID        NOT NULL REFERENCES profiles(id),
  academic_year         VARCHAR(9)  NOT NULL,
  semester              INTEGER     NOT NULL CHECK (semester IN (1,2)),
  is_formatif_included  BOOLEAN     NOT NULL DEFAULT true,
  metode_formatif       VARCHAR(20) NOT NULL DEFAULT 'BOBOT'
                          CHECK (metode_formatif IN ('BOBOT','KONTEKS_SAJA')),
  bobot_formatif        INTEGER     NOT NULL DEFAULT 40,
  bobot_sumatif         INTEGER     NOT NULL DEFAULT 60,
  is_auto_calculate     BOOLEAN     NOT NULL DEFAULT true,
  is_published          BOOLEAN     NOT NULL DEFAULT false,
  published_at          TIMESTAMPTZ,
  locked_at             TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (classroom_id, teacher_id, academic_year, semester)
);

-- ============================================================
-- 4. tp_assessments
-- ============================================================
CREATE TABLE IF NOT EXISTS tp_assessments (
  assessment_id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id              UUID        NOT NULL REFERENCES classrooms(id),
  learning_objective_id     UUID        NOT NULL REFERENCES learning_objectives(learning_objective_id) ON DELETE CASCADE,
  student_id                UUID        NOT NULL REFERENCES profiles(id),
  teacher_id                UUID        NOT NULL REFERENCES profiles(id),
  tipe                      VARCHAR(20) NOT NULL CHECK (tipe IN ('FORMATIF','SUMATIF')),
  judul                     TEXT,
  nilai_angka               NUMERIC(5,2) NOT NULL CHECK (nilai_angka BETWEEN 0 AND 100),
  nilai_kualitatif          TEXT,
  is_void                   BOOLEAN     NOT NULL DEFAULT false,
  void_reason               TEXT,
  tanggal                   DATE        NOT NULL DEFAULT CURRENT_DATE,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now()
  -- Tidak ada UNIQUE — satu siswa boleh punya banyak nilai per TP
);

-- ============================================================
-- 5. grade_summaries
-- ============================================================
CREATE TABLE IF NOT EXISTS grade_summaries (
  grade_summary_id      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id          UUID        NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
  student_id            UUID        NOT NULL REFERENCES profiles(id),
  teacher_id            UUID        NOT NULL REFERENCES profiles(id),
  academic_year         VARCHAR(9)  NOT NULL,
  semester              INTEGER     NOT NULL CHECK (semester IN (1,2)),
  nilai_akhir           NUMERIC(5,2),
  predikat              TEXT,
  deskripsi_naratif     TEXT,
  is_auto_calculate     BOOLEAN     NOT NULL DEFAULT true,
  last_calculated_at    TIMESTAMPTZ,
  published_at          TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (classroom_id, student_id, academic_year, semester)
);

-- ============================================================
-- INDEX
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_lo_classroom      ON learning_objectives(classroom_id);
CREATE INDEX IF NOT EXISTS idx_lo_teacher        ON learning_objectives(teacher_id);
CREATE INDEX IF NOT EXISTS idx_tpa_classroom     ON tp_assessments(classroom_id);
CREATE INDEX IF NOT EXISTS idx_tpa_student       ON tp_assessments(student_id);
CREATE INDEX IF NOT EXISTS idx_tpa_lo            ON tp_assessments(learning_objective_id);
CREATE INDEX IF NOT EXISTS idx_gs_classroom      ON grade_summaries(classroom_id);
CREATE INDEX IF NOT EXISTS idx_gs_student        ON grade_summaries(student_id);

-- ============================================================
-- TRIGGER 1: guard tp_assessment — hanya is_void + void_reason boleh diubah
-- ============================================================
CREATE OR REPLACE FUNCTION fn_guard_tp_assessment_update()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF (
    NEW.classroom_id            IS DISTINCT FROM OLD.classroom_id OR
    NEW.learning_objective_id   IS DISTINCT FROM OLD.learning_objective_id OR
    NEW.student_id              IS DISTINCT FROM OLD.student_id OR
    NEW.teacher_id              IS DISTINCT FROM OLD.teacher_id OR
    NEW.tipe                    IS DISTINCT FROM OLD.tipe OR
    NEW.judul                   IS DISTINCT FROM OLD.judul OR
    NEW.nilai_angka             IS DISTINCT FROM OLD.nilai_angka OR
    NEW.nilai_kualitatif        IS DISTINCT FROM OLD.nilai_kualitatif OR
    NEW.tanggal                 IS DISTINCT FROM OLD.tanggal OR
    NEW.created_at              IS DISTINCT FROM OLD.created_at
  ) THEN
    RAISE EXCEPTION 'Hanya is_void dan void_reason yang dapat diubah pada tp_assessments';
  END IF;
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  CREATE TRIGGER trg_guard_tp_assessment_update
    BEFORE UPDATE ON tp_assessments
    FOR EACH ROW EXECUTE FUNCTION fn_guard_tp_assessment_update();
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ============================================================
-- TRIGGER 2: no-overlap assessment_criteria per learning_objective
-- ============================================================
CREATE OR REPLACE FUNCTION fn_check_assessment_criteria_no_overlap()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM assessment_criteria
    WHERE learning_objective_id = NEW.learning_objective_id
      AND criterion_id IS DISTINCT FROM NEW.criterion_id
      AND batas_bawah < NEW.batas_atas
      AND batas_atas  > NEW.batas_bawah
  ) THEN
    RAISE EXCEPTION 'Range KKTP tumpang tindih dengan kriteria lain';
  END IF;
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  CREATE TRIGGER trg_assessment_criteria_no_overlap
    BEFORE INSERT OR UPDATE ON assessment_criteria
    FOR EACH ROW EXECUTE FUNCTION fn_check_assessment_criteria_no_overlap();
EXCEPTION WHEN duplicate_object THEN null;
END $$;
