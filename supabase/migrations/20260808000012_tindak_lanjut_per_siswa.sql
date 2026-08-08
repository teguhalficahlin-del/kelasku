-- Migration: 20260808000012_tindak_lanjut_per_siswa.sql
-- Tujuan: Tambah kolom tindak_lanjut per siswa ke student_grades
-- Idempotent: ADD COLUMN IF NOT EXISTS

BEGIN;

ALTER TABLE student_grades
  ADD COLUMN IF NOT EXISTS tindak_lanjut TEXT
  CHECK (tindak_lanjut IN ('PENGAYAAN', 'PENGUATAN', 'PENDAMPINGAN'));

COMMIT;
