-- 20260822000001_standardize-role-guru-wali-kelas-sd.sql
-- Satukan istilah peran wali kelas menjadi 'WALI_KELAS_SD' di seluruh sistem.
--
-- Sebelum ini ada dua ejaan untuk satu konsep yang sama. Constraint lama
-- menerima keduanya ('WALI_KELAS' dan 'WALI_KELAS_SD'), sehingga tidak ada
-- yang memaksa konsistensi: kartu onboarding di guru/dashboard.html menulis
-- 'WALI_KELAS', sementara classroom-rancang.js membandingkan dengan
-- 'WALI_KELAS_SD'. Guru yang mendaftar lewat onboarding karena itu tidak
-- pernah dikenali sebagai wali kelas oleh tab Rancang Pembelajaran.
--
-- Migrasi ini menutup celahnya di sisi data: satu ejaan yang diterima, dan
-- baris yang ada dipindahkan ke ejaan itu. Perbaikan sisi klien menyusul di
-- commit yang sama (dashboard.html, classroom-assessment.js, guru.js).
--
-- Nilai yang dihapus dari constraint:
--   'WALI_KELAS' — diserap ke 'WALI_KELAS_SD' oleh UPDATE di bawah.
--   'MAPEL'      — warisan, 0 baris di proyek tertaut dan tidak punya kartu
--                  onboarding. Chip data-value="MAPEL" di classroom-rancang.js
--                  baris 869 adalah pilihan wizard Step 0 yang tidak pernah
--                  ditulis ke profiles.role_guru, jadi tidak terpengaruh.
--
-- 'GURU_MAPEL_SDSMP_SMA' DIPERTAHANKAN meski 0 baris: kartunya masih aktif di
-- onboarding, jadi nol di sini berarti belum ada guru SD/SMP/SMA yang
-- mendaftar, bukan bahwa nilainya mati.
--
-- Keadaan data sebelum migrasi (diperiksa di proyek tertaut):
--   GURU_MAPEL_UMUM_SMK  15
--   WALI_KELAS            1
--   NULL                 31

BEGIN;

-- 1. Pindahkan data ke ejaan tunggal
UPDATE profiles
SET role_guru = 'WALI_KELAS_SD'
WHERE role_guru = 'WALI_KELAS';

-- 2. Lepas constraint lama
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_guru_check;

-- 3. Constraint baru — empat peran valid MiClass
ALTER TABLE profiles
  ADD CONSTRAINT profiles_role_guru_check
  CHECK (
    role_guru IS NULL OR role_guru IN (
      'WALI_KELAS_SD',
      'GURU_MAPEL_SDSMP_SMA',
      'GURU_MAPEL_UMUM_SMK',
      'GURU_MAPEL_PRODUKTIF_SMK'
    )
  );

-- 4. Jaring pengaman. ALTER TABLE ... ADD CONSTRAINT sudah memvalidasi seluruh
--    baris yang ada, jadi blok ini memang berlebihan pada jalur normal. Ia
--    dipertahankan agar kegagalan tetap terbaca sebagai pesan yang menjelaskan
--    apa yang salah, bukan sebagai violation mentah.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM profiles
    WHERE role_guru IS NOT NULL
      AND role_guru NOT IN (
        'WALI_KELAS_SD','GURU_MAPEL_SDSMP_SMA',
        'GURU_MAPEL_UMUM_SMK','GURU_MAPEL_PRODUKTIF_SMK'
      )
  ) THEN
    RAISE EXCEPTION 'Masih ada role_guru di luar nilai yang diizinkan — ROLLBACK';
  END IF;
END $$;

COMMIT;
