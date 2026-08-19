-- Perbaikan fn_handle_new_user: peran dibaca dari metadata, bukan dipatok 'GURU'.
--
-- Masalah: trigger on_auth_user_created (dipasang 20260814000003) menyala untuk
-- SETIAP baris baru di auth.users dan selalu menulis role='GURU'. Akun siswa dan
-- ortu yang dibuat Edge Function generate-akun ikut terkena, sehingga:
--   1. profil siswa lahir dengan role='GURU', nama kosong, nis NULL
--   2. INSERT milik generate-akun bentrok dengan unique (user_id), errornya tidak
--      ditangkap, siswaProfileId menjadi null, dan EF melempar exception → HTTP 500
--
-- Akibatnya generate akun siswa rusak sejak 14 Agustus 2026. Akun siswa yang
-- berhasil sebelumnya (3–5 Agustus) dibuat sebelum trigger ini ada.
--
-- generate-akun sudah mengirim role di user_metadata ('SISWA' / 'ORTU'), jadi
-- trigger cukup membacanya. Nilai di luar daftar yang dikenal jatuh ke 'GURU'
-- agar metadata sembarangan tidak dapat menciptakan peran yang tidak sah.

BEGIN;

CREATE OR REPLACE FUNCTION fn_handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_name text;
BEGIN
  v_role := COALESCE(NEW.raw_user_meta_data->>'role', 'GURU');
  IF v_role NOT IN ('GURU', 'SISWA', 'ORTU') THEN
    v_role := 'GURU';
  END IF;

  -- signUp guru mengirim 'full_name'; generate-akun mengirim 'nama'
  v_name := COALESCE(
    NULLIF(NEW.raw_user_meta_data->>'full_name', ''),
    NULLIF(NEW.raw_user_meta_data->>'nama', ''),
    ''
  );

  INSERT INTO public.profiles (user_id, full_name, role, email, is_active)
  VALUES (
    NEW.id,
    v_name,
    v_role,
    NEW.email,
    -- Guru menunggu konfirmasi email; siswa/ortu dibuat guru dan langsung aktif
    CASE WHEN v_role = 'GURU' THEN false ELSE true END
  )
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION fn_handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fn_handle_new_user() FROM anon;

COMMIT;

-- Trigger on_auth_user_created tidak perlu dibuat ulang — ia menunjuk fungsi ini
-- berdasarkan nama, sehingga CREATE OR REPLACE sudah cukup.
