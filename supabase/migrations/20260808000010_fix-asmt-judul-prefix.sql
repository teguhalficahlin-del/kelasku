-- Migration: 20260808000002_fix-asmt-judul-prefix.sql
-- Tujuan: Strip prefix jenis ("Diagnostik Non-Kognitif  Judul: ") dari kolom judul
--         yang tersimpan oleh kode versi lama sebelum sesi 2026-08-08.
-- Idempotent: WHERE clause memastikan hanya baris berprefix yang ter-affect;
--             menjalankan ulang tidak mengubah data yang sudah bersih.
-- Tidak ada DDL — hanya UPDATE data.

BEGIN;

UPDATE assessments
SET judul = regexp_replace(
  judul,
  '^(Diagnostik Non-Kognitif|Diagnostik Kognitif|Formatif|Sumatif)\s+Judul:\s*',
  '',
  'i'
)
WHERE judul ~* '^(Diagnostik Non-Kognitif|Diagnostik Kognitif|Formatif|Sumatif)\s+Judul:';

UPDATE student_grades
SET judul = regexp_replace(
  judul,
  '^(Diagnostik Non-Kognitif|Diagnostik Kognitif|Formatif|Sumatif)\s+Judul:\s*',
  '',
  'i'
)
WHERE assessment_id IS NOT NULL
  AND judul ~* '^(Diagnostik Non-Kognitif|Diagnostik Kognitif|Formatif|Sumatif)\s+Judul:';

COMMIT;
