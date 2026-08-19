-- Validasi login berbasis roster untuk siswa DAN ortu.
--
-- Latar: ADR-003 K1 mendefinisikan login siswa sebagai Kode Kelas + Nama + NIS,
-- tetapi portal siswa tidak pernah memvalidasi nama — form mengumpulkannya lalu
-- membuangnya. Portal ortu sudah memvalidasi lewat fn_validate_ortu_login.
-- Fungsi ini menyatukan logikanya agar hanya ada satu sumber kebenaran.
--
-- Nilai kembali sengaja kasar, bukan rinci:
--   'OK'                    — kode, NIS, dan nama cocok
--   'KELAS_TIDAK_DITEMUKAN' — kode kelas tidak ada atau kelas diarsipkan
--   'DATA_TIDAK_COCOK'      — NIS tidak terdaftar ATAU nama tidak cocok
--
-- Sengaja TIDAK dibedakan antara "NIS tidak terdaftar" dan "nama tidak cocok":
-- fungsi ini dapat dipanggil anon, dan membedakannya akan memungkinkan siapa pun
-- yang memegang kode kelas menebak NIS yang valid satu per satu. Kode kelas
-- sendiri memang dibagikan terbuka, jadi aman disebut secara spesifik.

BEGIN;

CREATE OR REPLACE FUNCTION fn_validate_roster_login(
  p_classroom_code TEXT,
  p_nis            TEXT,
  p_nama           TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_classroom_id uuid;
  v_full_name    text;
BEGIN
  SELECT id INTO v_classroom_id
  FROM classrooms
  WHERE classroom_code = upper(trim(p_classroom_code))
    AND is_archived = false;

  IF v_classroom_id IS NULL THEN
    RETURN 'KELAS_TIDAK_DITEMUKAN';
  END IF;

  SELECT full_name INTO v_full_name
  FROM classroom_roster
  WHERE classroom_id = v_classroom_id
    AND nis = trim(p_nis);

  IF v_full_name IS NULL THEN
    RETURN 'DATA_TIDAK_COCOK';
  END IF;

  IF lower(trim(v_full_name)) <> lower(trim(p_nama)) THEN
    RETURN 'DATA_TIDAK_COCOK';
  END IF;

  RETURN 'OK';
END;
$$;

REVOKE EXECUTE ON FUNCTION fn_validate_roster_login(TEXT,TEXT,TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION fn_validate_roster_login(TEXT,TEXT,TEXT) TO anon;
GRANT  EXECUTE ON FUNCTION fn_validate_roster_login(TEXT,TEXT,TEXT) TO authenticated;

-- fn_validate_ortu_login dipertahankan sebagai pembungkus tipis agar portal ortu
-- yang sudah berjalan tidak perlu diubah, sekaligus menghapus duplikasi logika.
CREATE OR REPLACE FUNCTION fn_validate_ortu_login(
  p_classroom_code TEXT,
  p_nis            TEXT,
  p_nama_anak      TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT fn_validate_roster_login(p_classroom_code, p_nis, p_nama_anak) = 'OK';
$$;

REVOKE EXECUTE ON FUNCTION fn_validate_ortu_login(TEXT,TEXT,TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION fn_validate_ortu_login(TEXT,TEXT,TEXT) TO anon;
GRANT  EXECUTE ON FUNCTION fn_validate_ortu_login(TEXT,TEXT,TEXT) TO authenticated;

COMMIT;

-- Catatan penting: pemeriksaan ini berjalan di klien sebelum signInWithPassword.
-- Karena kredensial siswa masih deterministik (email dan password diturunkan dari
-- kode kelas + NIS, lihat ADR-003), pemeriksaan nama TIDAK dapat dianggap kontrol
-- keamanan — ia dapat dilewati dengan memanggil signInWithPassword langsung.
-- Nilainya: memenuhi ADR-003 K1 dan mencegah siswa masuk ke akun yang salah.
-- Penguatan sesungguhnya menuntut kredensial yang tidak deterministik.
