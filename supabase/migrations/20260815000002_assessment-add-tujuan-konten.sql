-- Tambah kolom tujuan dan konten ke tabel assessments
-- tujuan: teks tujuan penilaian guru (opsional)
-- konten: JSON body instrumen (rubrik/checklist/aspek, dsb.) — opsional

BEGIN;

ALTER TABLE assessments
  ADD COLUMN IF NOT EXISTS tujuan text,
  ADD COLUMN IF NOT EXISTS konten text;

COMMIT;
