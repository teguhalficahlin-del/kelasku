-- Migration: 20260806000006_assessment-revisi.sql
-- Tujuan: Revisi arsitektur penilaian — DROP 3 tabel lama, ALTER+RENAME 2 tabel,
--         RLS baru untuk assessment_items + student_grades
-- Idempotent: IF EXISTS, IF NOT EXISTS, OR REPLACE, DO...EXCEPTION
-- Prereq: 20260806000003-005 (tabel + RLS + RPC lama sudah ada)

-- ============================================================
-- Bagian 1: DROP tabel yang tidak dipakai
-- CASCADE menghapus FK, trigger, policy, index yang dependen
-- ============================================================
DROP TABLE IF EXISTS tp_assessments CASCADE;
DROP TABLE IF EXISTS assessment_criteria CASCADE;
DROP TABLE IF EXISTS grading_settings CASCADE;

-- ============================================================
-- Bagian 2: DROP fungsi RPC + helper lama (eksplisit)
-- DROP TABLE CASCADE hanya hapus trigger, BUKAN fungsi trigger
-- ============================================================
DROP FUNCTION IF EXISTS fn_calculate_grade_summary(UUID, VARCHAR, INTEGER) CASCADE;
DROP FUNCTION IF EXISTS fn_get_grade_summary(UUID, VARCHAR, INTEGER) CASCADE;
DROP FUNCTION IF EXISTS fn_get_cp_for_subject(VARCHAR, SMALLINT) CASCADE;
DROP FUNCTION IF EXISTS fn_check_element_duplicate(UUID, UUID, UUID) CASCADE;
DROP FUNCTION IF EXISTS fn_is_my_lo(UUID) CASCADE;
DROP FUNCTION IF EXISTS fn_lo_in_my_classroom(UUID) CASCADE;
DROP FUNCTION IF EXISTS fn_grading_is_published(UUID, UUID) CASCADE;
DROP FUNCTION IF EXISTS fn_grade_published_for_me(UUID) CASCADE;
DROP FUNCTION IF EXISTS fn_grade_published_for_child(UUID, UUID) CASCADE;
DROP FUNCTION IF EXISTS fn_guard_tp_assessment_update() CASCADE;
DROP FUNCTION IF EXISTS fn_check_assessment_criteria_no_overlap() CASCADE;

-- ============================================================
-- Bagian 3: DROP schema core CASCADE
-- Menghapus 11 tabel CP + FK learning_objectives.element_id
-- Aman: hanya berisi tabel dari Migration 1 (sudah diverifikasi)
-- ============================================================
DROP SCHEMA IF EXISTS core CASCADE;

-- ============================================================
-- Bagian 4: ALTER + RENAME learning_objectives → assessment_items
-- ============================================================

-- DROP kolom lama
ALTER TABLE learning_objectives
  DROP COLUMN IF EXISTS kode_tp,
  DROP COLUMN IF EXISTS deskripsi_tp,
  DROP COLUMN IF EXISTS element_id;

-- ADD kolom baru
ALTER TABLE learning_objectives
  ADD COLUMN IF NOT EXISTS judul TEXT,
  ADD COLUMN IF NOT EXISTS tipe VARCHAR(20) NOT NULL DEFAULT 'LAINNYA',
  ADD COLUMN IF NOT EXISTS konten TEXT,
  ADD COLUMN IF NOT EXISTS is_visible_siswa BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_visible_ortu BOOLEAN NOT NULL DEFAULT false;

-- Isi judul (safety net — tabel kemungkinan kosong di lingkungan dev)
UPDATE learning_objectives SET judul = 'Item Penilaian' WHERE judul IS NULL;

-- Set NOT NULL setelah semua baris terisi
ALTER TABLE learning_objectives ALTER COLUMN judul SET NOT NULL;

-- ADD CHECK constraint tipe
ALTER TABLE learning_objectives
  ADD CONSTRAINT chk_assessment_items_tipe
  CHECK (tipe IN ('CP','TP','KKTP','NILAI','LAINNYA'));

-- DROP UNIQUE lama (nama aktual dikonfirmasi via pg_constraint)
ALTER TABLE learning_objectives
  DROP CONSTRAINT IF EXISTS "learning_objectives_classroom_id_teacher_id_academic_year_s_key";

-- ADD UNIQUE baru
ALTER TABLE learning_objectives
  ADD CONSTRAINT uq_assessment_items
  UNIQUE (classroom_id, teacher_id, academic_year, semester, judul);

-- RENAME kolom PK
ALTER TABLE learning_objectives
  RENAME COLUMN learning_objective_id TO id;

-- RENAME tabel
ALTER TABLE learning_objectives RENAME TO assessment_items;

-- ============================================================
-- Bagian 5: ALTER + RENAME grade_summaries → student_grades
-- ============================================================

-- DROP policy yang mereferensi published_at sebelum DROP COLUMN
-- (tanpa ini ALTER TABLE ... DROP COLUMN published_at akan gagal)
DROP POLICY IF EXISTS gsum_siswa_select ON grade_summaries;
DROP POLICY IF EXISTS gsum_ortu_select  ON grade_summaries;

-- DROP kolom lama
ALTER TABLE grade_summaries
  DROP COLUMN IF EXISTS nilai_akhir,
  DROP COLUMN IF EXISTS predikat,
  DROP COLUMN IF EXISTS is_auto_calculate,
  DROP COLUMN IF EXISTS last_calculated_at,
  DROP COLUMN IF EXISTS published_at;

-- ADD kolom baru
ALTER TABLE grade_summaries
  ADD COLUMN IF NOT EXISTS judul TEXT NOT NULL DEFAULT 'Nilai',
  ADD COLUMN IF NOT EXISTS nilai_angka NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS is_published BOOLEAN NOT NULL DEFAULT false;

-- ADD CHECK constraint nilai_angka
ALTER TABLE grade_summaries
  ADD CONSTRAINT chk_student_grades_nilai
  CHECK (nilai_angka IS NULL OR nilai_angka BETWEEN 0 AND 100);

-- RENAME kolom deskripsi
ALTER TABLE grade_summaries
  RENAME COLUMN deskripsi_naratif TO deskripsi;

-- DROP UNIQUE lama (nama aktual dikonfirmasi via pg_constraint)
ALTER TABLE grade_summaries
  DROP CONSTRAINT IF EXISTS "grade_summaries_classroom_id_student_id_academic_year_semes_key";

-- ADD UNIQUE baru (tambah judul — satu siswa boleh punya banyak nilai)
ALTER TABLE grade_summaries
  ADD CONSTRAINT uq_student_grades
  UNIQUE (classroom_id, student_id, academic_year, semester, judul);

-- RENAME kolom PK
ALTER TABLE grade_summaries
  RENAME COLUMN grade_summary_id TO id;

-- RENAME kolom deskripsi sudah dilakukan di atas sebelum PK rename
-- RENAME tabel
ALTER TABLE grade_summaries RENAME TO student_grades;

-- ============================================================
-- Bagian 6: RLS baru untuk assessment_items
-- RLS sudah enabled dari Migration 4 — tidak perlu enable ulang
-- Drop policy lama (sekarang ada di tabel assessment_items setelah rename)
-- ============================================================
DROP POLICY IF EXISTS lo_guru_select  ON assessment_items;
DROP POLICY IF EXISTS lo_guru_insert  ON assessment_items;
DROP POLICY IF EXISTS lo_guru_update  ON assessment_items;
DROP POLICY IF EXISTS lo_guru_delete  ON assessment_items;
DROP POLICY IF EXISTS lo_siswa_select ON assessment_items;
DROP POLICY IF EXISTS lo_ortu_select  ON assessment_items;

DO $$ BEGIN
  CREATE POLICY "ai_guru_select" ON assessment_items
    FOR SELECT TO authenticated
    USING (fn_is_classroom_owner(classroom_id));
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "ai_guru_insert" ON assessment_items
    FOR INSERT TO authenticated
    WITH CHECK (
      teacher_id = fn_current_profile_id()
      AND fn_is_classroom_owner(classroom_id)
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "ai_guru_update" ON assessment_items
    FOR UPDATE TO authenticated
    USING (
      teacher_id = fn_current_profile_id()
      AND fn_is_classroom_owner(classroom_id)
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "ai_guru_delete" ON assessment_items
    FOR DELETE TO authenticated
    USING (
      teacher_id = fn_current_profile_id()
      AND fn_is_classroom_owner(classroom_id)
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "ai_siswa_select" ON assessment_items
    FOR SELECT TO authenticated
    USING (
      fn_is_classroom_member(classroom_id)
      AND is_visible_siswa = true
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "ai_ortu_select" ON assessment_items
    FOR SELECT TO authenticated
    USING (
      fn_is_classroom_member(classroom_id)
      AND is_visible_ortu = true
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ============================================================
-- Bagian 7: RLS baru untuk student_grades
-- ============================================================
DROP POLICY IF EXISTS gsum_guru_select  ON student_grades;
DROP POLICY IF EXISTS gsum_guru_update  ON student_grades;
DROP POLICY IF EXISTS gsum_siswa_select ON student_grades;
DROP POLICY IF EXISTS gsum_ortu_select  ON student_grades;

DO $$ BEGIN
  CREATE POLICY "sg_guru_select" ON student_grades
    FOR SELECT TO authenticated
    USING (fn_is_classroom_owner(classroom_id));
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "sg_guru_insert" ON student_grades
    FOR INSERT TO authenticated
    WITH CHECK (
      teacher_id = fn_current_profile_id()
      AND fn_is_classroom_owner(classroom_id)
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "sg_guru_update" ON student_grades
    FOR UPDATE TO authenticated
    USING (
      teacher_id = fn_current_profile_id()
      AND fn_is_classroom_owner(classroom_id)
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "sg_guru_delete" ON student_grades
    FOR DELETE TO authenticated
    USING (
      teacher_id = fn_current_profile_id()
      AND fn_is_classroom_owner(classroom_id)
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "sg_siswa_select" ON student_grades
    FOR SELECT TO authenticated
    USING (
      fn_is_classroom_member(classroom_id)
      AND student_id = fn_current_profile_id()
      AND is_published = true
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "sg_ortu_select" ON student_grades
    FOR SELECT TO authenticated
    USING (
      is_published = true
      AND EXISTS (
        SELECT 1 FROM classroom_members cm
        WHERE cm.profile_id        = fn_current_profile_id()
          AND cm.member_role       = 'ORTU'
          AND cm.linked_student_id = student_grades.student_id
          AND cm.classroom_id      = student_grades.classroom_id
      )
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;
