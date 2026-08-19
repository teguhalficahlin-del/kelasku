-- Revisi tier: hapus GURU_GO, sisakan dua tier.
--
--   TRIAL     = free tier, trial 30 hari, semua tab KECUALI tab Rancang
--   GURU_PRO  = semua tab tanpa kecuali
--
-- Akun yang sebelumnya GURU_GO dipromosikan ke GURU_PRO agar tidak kehilangan
-- akses yang sudah dipakai. Nilai GURU_GO hanya pernah disetel oleh migration
-- testing 20260816000003.
--
-- Catatan: trigger fn_protect_profile_security_fields hanya memblokir perubahan
-- tier bila current_user adalah 'authenticated'/'anon'. Migration berjalan
-- sebagai owner, sehingga UPDATE di bawah tidak terhalang.

BEGIN;

-- 1. Promosikan akun GURU_GO ke GURU_PRO sebelum CHECK diperketat
UPDATE profiles SET tier = 'GURU_PRO' WHERE tier = 'GURU_GO';
UPDATE profiles SET tier_requested = 'GURU_PRO' WHERE tier_requested = 'GURU_GO';

-- 2. Perketat CHECK tier — GURU_GO tidak lagi nilai yang sah
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_tier_check;
ALTER TABLE profiles
  ADD CONSTRAINT profiles_tier_check CHECK (tier IN ('TRIAL','GURU_PRO'));

-- 3. Perketat CHECK tier_requested — satu-satunya upgrade yang mungkin
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_tier_requested_check;
ALTER TABLE profiles
  ADD CONSTRAINT profiles_tier_requested_check CHECK (tier_requested IN ('GURU_PRO'));

COMMIT;

-- Rollback consideration: mengembalikan GURU_GO ke CHECK tidak memulihkan
-- pemilik tier lamanya, karena langkah 1 sudah menimpanya. Catat daftar
-- profile_id yang terdampak sebelum menjalankan ini bila pemulihan diperlukan.
