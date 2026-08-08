-- Migration: 20260808000011_assessment-publish.sql
-- Tujuan: Tambah kolom is_published ke tabel assessments
-- Idempotent: ADD COLUMN IF NOT EXISTS

BEGIN;

ALTER TABLE assessments
  ADD COLUMN IF NOT EXISTS is_published BOOLEAN NOT NULL DEFAULT false;

COMMIT;
