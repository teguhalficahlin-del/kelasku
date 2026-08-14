-- Migration: 20260815000001_penilaian-v2-schema.sql
-- Tujuan: Fase 2.1 Tahap 1 — Ganti schema penilaian ke arsitektur baru
--   1. DROP student_grades CASCADE
--   2. DROP assessments lama CASCADE (→ assessment_kktp_results,
--      assessment_rubric_criteria, assessment_rubric_results)
--   3. RENAME assessment_items → tp_kktp
--   4. CREATE assessments baru
--   5. CREATE assessment_results
--   6. CREATE student_groups
--   7. CREATE grade_recap
-- Idempotent: DROP IF EXISTS, CREATE IF NOT EXISTS, DO...EXCEPTION,
--             RENAME dijalankan hanya jika tabel lama masih ada

BEGIN;

-- ============================================================
-- Bagian 1: DROP student_grades CASCADE
-- Menghapus semua FK, index, policy yang dependen
-- ============================================================
DROP TABLE IF EXISTS student_grades CASCADE;

-- ============================================================
-- Bagian 2: DROP assessments lama CASCADE
-- Menghapus: assessment_kktp_results, assessment_rubric_criteria,
--            assessment_rubric_results (semua FK ON DELETE CASCADE)
-- ============================================================
DROP TABLE IF EXISTS assessments CASCADE;

-- ============================================================
-- Bagian 3: RENAME assessment_items → tp_kktp
-- Guard IF EXISTS agar idempotent (run ke-2 skip jika sudah rename)
-- FK self-referential (parent_id) dan semua index ikut otomatis
-- ============================================================
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'assessment_items'
  ) THEN
    ALTER TABLE assessment_items RENAME TO tp_kktp;
  END IF;
END $$;

-- ============================================================
-- Bagian 4: CREATE assessments (schema baru)
-- ============================================================
CREATE TABLE IF NOT EXISTS assessments (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id  UUID        NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
  teacher_id    UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  tp_kktp_id    UUID        REFERENCES tp_kktp(id) ON DELETE SET NULL,
  jenis         TEXT        NOT NULL
                              CHECK (jenis IN ('DIAGNOSTIK','FORMATIF','SUMATIF')),
  teknik        TEXT        CHECK (teknik IN (
                              'OBSERVASI','TES','PENUGASAN',
                              'PROYEK','PORTOFOLIO','UNJUK_KERJA'
                            )),
  instrumen     TEXT,
  refleksi_guru TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN ALTER TABLE assessments ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN others THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "as_guru_select" ON assessments FOR SELECT TO authenticated
    USING (fn_is_classroom_owner(classroom_id));
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "as_guru_insert" ON assessments FOR INSERT TO authenticated
    WITH CHECK (
      teacher_id = fn_current_profile_id()
      AND fn_is_classroom_owner(classroom_id)
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "as_guru_update" ON assessments FOR UPDATE TO authenticated
    USING (
      teacher_id = fn_current_profile_id()
      AND fn_is_classroom_owner(classroom_id)
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "as_guru_delete" ON assessments FOR DELETE TO authenticated
    USING (
      teacher_id = fn_current_profile_id()
      AND fn_is_classroom_owner(classroom_id)
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "as_siswa_select" ON assessments FOR SELECT TO authenticated
    USING (fn_is_classroom_member(classroom_id));
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "as_ortu_select" ON assessments FOR SELECT TO authenticated
    USING (EXISTS (
      SELECT 1 FROM classroom_members cm
      WHERE cm.profile_id        = fn_current_profile_id()
        AND cm.member_role       = 'ORTU'
        AND cm.linked_student_id IS NOT NULL
        AND cm.classroom_id      = assessments.classroom_id
    ));
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ============================================================
-- Bagian 5: CREATE assessment_results
-- classroom_id + teacher_id didenormalisasi untuk RLS efisien
-- (konsisten dengan pola tabel lain di proyek — setiap tabel
--  menyimpan teacher_id agar RLS INSERT tidak butuh subquery)
-- ============================================================
CREATE TABLE IF NOT EXISTS assessment_results (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id     UUID        NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  classroom_id      UUID        NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
  teacher_id        UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  student_id        UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status            TEXT        CHECK (status IN (
                                  'PAHAM','BELUM_PAHAM','PERLU_PERHATIAN'
                                )),
  catatan           TEXT,
  umpan_balik       TEXT,
  grup_diferensiasi TEXT        CHECK (grup_diferensiasi IN ('A','B','C')),
  nilai             NUMERIC,
  kktp_tercapai     BOOLEAN,
  tindak_lanjut     TEXT        CHECK (tindak_lanjut IN (
                                  'PENGAYAAN','PENGUATAN','PENDAMPINGAN'
                                )),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (assessment_id, student_id)
);

DO $$ BEGIN ALTER TABLE assessment_results ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN others THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "ar_guru_select" ON assessment_results FOR SELECT TO authenticated
    USING (fn_is_classroom_owner(classroom_id));
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "ar_guru_insert" ON assessment_results FOR INSERT TO authenticated
    WITH CHECK (
      teacher_id = fn_current_profile_id()
      AND fn_is_classroom_owner(classroom_id)
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "ar_guru_update" ON assessment_results FOR UPDATE TO authenticated
    USING (
      teacher_id = fn_current_profile_id()
      AND fn_is_classroom_owner(classroom_id)
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "ar_guru_delete" ON assessment_results FOR DELETE TO authenticated
    USING (
      teacher_id = fn_current_profile_id()
      AND fn_is_classroom_owner(classroom_id)
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "ar_siswa_select" ON assessment_results FOR SELECT TO authenticated
    USING (
      fn_is_classroom_member(classroom_id)
      AND student_id = fn_current_profile_id()
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "ar_ortu_select" ON assessment_results FOR SELECT TO authenticated
    USING (EXISTS (
      SELECT 1 FROM classroom_members cm
      WHERE cm.profile_id        = fn_current_profile_id()
        AND cm.member_role       = 'ORTU'
        AND cm.linked_student_id = assessment_results.student_id
        AND cm.classroom_id      = assessment_results.classroom_id
    ));
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ============================================================
-- Bagian 6: CREATE student_groups
-- Grup diferensiasi persisten per siswa per classroom
-- ============================================================
CREATE TABLE IF NOT EXISTS student_groups (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id UUID        NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
  student_id   UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  grup         TEXT        NOT NULL CHECK (grup IN ('A','B','C')),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (classroom_id, student_id)
);

DO $$ BEGIN ALTER TABLE student_groups ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN others THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "sgrp_guru_select" ON student_groups FOR SELECT TO authenticated
    USING (fn_is_classroom_owner(classroom_id));
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "sgrp_guru_insert" ON student_groups FOR INSERT TO authenticated
    WITH CHECK (fn_is_classroom_owner(classroom_id));
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "sgrp_guru_update" ON student_groups FOR UPDATE TO authenticated
    USING (fn_is_classroom_owner(classroom_id));
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "sgrp_guru_delete" ON student_groups FOR DELETE TO authenticated
    USING (fn_is_classroom_owner(classroom_id));
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "sgrp_siswa_select" ON student_groups FOR SELECT TO authenticated
    USING (
      fn_is_classroom_member(classroom_id)
      AND student_id = fn_current_profile_id()
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "sgrp_ortu_select" ON student_groups FOR SELECT TO authenticated
    USING (EXISTS (
      SELECT 1 FROM classroom_members cm
      WHERE cm.profile_id        = fn_current_profile_id()
        AND cm.member_role       = 'ORTU'
        AND cm.linked_student_id = student_groups.student_id
        AND cm.classroom_id      = student_groups.classroom_id
    ));
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ============================================================
-- Bagian 7: CREATE grade_recap
-- Rekap semester otomatis per siswa per TP/KKTP
-- ============================================================
CREATE TABLE IF NOT EXISTS grade_recap (
  id                UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id      UUID    NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
  student_id        UUID    NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  tp_kktp_id        UUID    NOT NULL REFERENCES tp_kktp(id) ON DELETE CASCADE,
  nilai_akhir       NUMERIC,
  kktp_tercapai     BOOLEAN,
  deskripsi_capaian TEXT,
  semester          TEXT,
  tahun_ajaran      TEXT,
  UNIQUE (classroom_id, student_id, tp_kktp_id, semester, tahun_ajaran)
);

DO $$ BEGIN ALTER TABLE grade_recap ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN others THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "gr_guru_select" ON grade_recap FOR SELECT TO authenticated
    USING (fn_is_classroom_owner(classroom_id));
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "gr_guru_insert" ON grade_recap FOR INSERT TO authenticated
    WITH CHECK (fn_is_classroom_owner(classroom_id));
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "gr_guru_update" ON grade_recap FOR UPDATE TO authenticated
    USING (fn_is_classroom_owner(classroom_id));
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "gr_guru_delete" ON grade_recap FOR DELETE TO authenticated
    USING (fn_is_classroom_owner(classroom_id));
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "gr_siswa_select" ON grade_recap FOR SELECT TO authenticated
    USING (
      fn_is_classroom_member(classroom_id)
      AND student_id = fn_current_profile_id()
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "gr_ortu_select" ON grade_recap FOR SELECT TO authenticated
    USING (EXISTS (
      SELECT 1 FROM classroom_members cm
      WHERE cm.profile_id        = fn_current_profile_id()
        AND cm.member_role       = 'ORTU'
        AND cm.linked_student_id = grade_recap.student_id
        AND cm.classroom_id      = grade_recap.classroom_id
    ));
EXCEPTION WHEN duplicate_object THEN null; END $$;

COMMIT;
