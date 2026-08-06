-- Migration: 20260807000001_assessment-hierarchy.sql
-- Tujuan: Tambah parent_id ke assessment_items (relasi child KKTP dalam TP)
--         Tambah 4 kolom ke student_grades (assessment_item_id, tanggal_penilaian,
--         tipe_penilaian, bobot) untuk arsitektur accordion hierarkis penilaian
-- Idempotent: IF NOT EXISTS, constraint nama eksplisit
-- Prereq: 20260806000006_assessment-revisi.sql (tabel sudah ada + RLS aktif)

-- ============================================================
-- Bagian 1: assessment_items — tambah parent_id
-- Self-referential FK: child (KKTP) → parent (TP)
-- ON DELETE CASCADE: hapus parent otomatis hapus semua child
-- ============================================================
ALTER TABLE assessment_items
  ADD COLUMN IF NOT EXISTS parent_id UUID
    REFERENCES assessment_items(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_ai_parent ON assessment_items(parent_id);

-- ============================================================
-- Bagian 2: student_grades — tambah 4 kolom baru
-- assessment_item_id: link nilai ke TP/KKTP tertentu (nullable)
-- tanggal_penilaian: tanggal pelaksanaan penilaian (nullable)
-- tipe_penilaian: label bebas mis. "Formatif", "Sumatif" (nullable)
-- bobot: persentase bobot nilai 0-100 (nullable)
-- ON DELETE SET NULL: item dihapus → nilai tetap ada, link = NULL
-- ============================================================
ALTER TABLE student_grades
  ADD COLUMN IF NOT EXISTS assessment_item_id UUID
    REFERENCES assessment_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tanggal_penilaian DATE,
  ADD COLUMN IF NOT EXISTS tipe_penilaian TEXT,
  ADD COLUMN IF NOT EXISTS bobot NUMERIC(5,2)
    CHECK (bobot IS NULL OR bobot BETWEEN 0 AND 100);

CREATE INDEX IF NOT EXISTS idx_sg_item ON student_grades(assessment_item_id);

-- ============================================================
-- RLS: tidak ada perubahan policy
-- Semua kolom baru nullable — tidak mengubah logika isolasi
-- Policy lama (ai_guru_*, ai_siswa_*, sg_guru_*, sg_siswa_*, sg_ortu_*)
-- tetap valid tanpa modifikasi
-- ============================================================
