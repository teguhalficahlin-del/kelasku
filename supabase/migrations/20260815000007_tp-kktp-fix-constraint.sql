-- Migration: 20260815000006_tp-kktp-fix-constraint.sql
-- Tujuan: Perbarui unique constraint uq_assessment_items di tp_kktp
--         agar menyertakan kolom mapel dan tipe.
-- Root cause: mapel ditambahkan (migration 20260815000003) tapi constraint
--             belum diperbarui — guru tidak bisa tambah CP dengan judul
--             sama untuk mapel berbeda.
-- Fix: DROP + recreate constraint dengan kolom (classroom_id, teacher_id,
--      academic_year, semester, tipe, mapel, judul, parent_id)

BEGIN;

ALTER TABLE tp_kktp
  DROP CONSTRAINT IF EXISTS uq_assessment_items;

ALTER TABLE tp_kktp
  ADD CONSTRAINT uq_assessment_items
  UNIQUE NULLS NOT DISTINCT
    (classroom_id, teacher_id, academic_year, semester, tipe, mapel, judul, parent_id);

COMMIT;
