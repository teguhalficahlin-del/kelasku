-- Migration: tambah kolom jumlah_murid ke rancang_settings
-- Digunakan oleh generate-modul V4.0 untuk merancang instrumen
-- mode bergantian/individual berdasarkan ukuran kelas aktual.

ALTER TABLE rancang_settings
  ADD COLUMN IF NOT EXISTS jumlah_murid integer
    CHECK (jumlah_murid IS NULL OR (jumlah_murid >= 1 AND jumlah_murid <= 60));
