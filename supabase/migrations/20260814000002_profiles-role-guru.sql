-- Tambah kolom peran guru ke tabel profiles
-- MAPEL = guru mata pelajaran (SMP/SMA/SMK)
-- WALI_KELAS_SD = wali kelas SD (semua mapel satu kelas)
-- Nullable — guru lama tanpa nilai dianggap MAPEL

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS role_guru text
  CHECK (role_guru IN ('MAPEL', 'WALI_KELAS_SD'));
