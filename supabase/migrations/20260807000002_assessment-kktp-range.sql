-- Migration: 20260807000002_assessment-kktp-range.sql
-- Tujuan: Tambah batas_bawah + batas_atas ke assessment_items untuk KKTP
-- Idempotent: ADD COLUMN IF NOT EXISTS

ALTER TABLE assessment_items
  ADD COLUMN IF NOT EXISTS batas_bawah NUMERIC(5,2)
    CHECK (batas_bawah IS NULL OR batas_bawah BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS batas_atas NUMERIC(5,2)
    CHECK (batas_atas IS NULL OR batas_atas BETWEEN 0 AND 100);

-- Constraint: batas_atas harus lebih besar dari batas_bawah jika keduanya diisi
ALTER TABLE assessment_items
  ADD CONSTRAINT chk_kktp_range
  CHECK (
    batas_bawah IS NULL OR batas_atas IS NULL OR batas_atas > batas_bawah
  );

-- RLS: tidak ada perubahan — semua policy lama tetap valid
