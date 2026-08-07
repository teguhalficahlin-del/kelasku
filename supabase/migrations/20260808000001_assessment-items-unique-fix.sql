-- Migration: 20260808000001_assessment-items-unique-fix.sql
-- Tujuan: Perbaiki UNIQUE constraint uq_assessment_items agar
--         menyertakan parent_id — KKTP dengan judul sama di TP
--         berbeda harus diizinkan
-- Root cause: constraint lama tidak menyertakan parent_id

-- Drop constraint lama
ALTER TABLE assessment_items
  DROP CONSTRAINT IF EXISTS uq_assessment_items;

-- Buat constraint baru yang include parent_id
-- NULLS NOT DISTINCT agar dua item tanpa parent (NULL) tetap
-- dibandingkan secara normal (tidak diabaikan)
ALTER TABLE assessment_items
  ADD CONSTRAINT uq_assessment_items
  UNIQUE NULLS NOT DISTINCT
    (classroom_id, teacher_id, academic_year, semester, judul, parent_id);
