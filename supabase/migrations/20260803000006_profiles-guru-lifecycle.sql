-- Tambah kolom lifecycle guru ke tabel profiles (nullable, hanya diisi untuk role GURU)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS activated_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS expires_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_active        BOOLEAN NOT NULL DEFAULT false;
