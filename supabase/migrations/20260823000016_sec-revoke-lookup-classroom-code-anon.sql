-- 20260823000016_sec-revoke-lookup-classroom-code-anon.sql
-- Cabut akses anon dari fn_lookup_classroom_code.
--
-- Nomor 20260823000015 sudah terpakai (sec-fn-lookup-profile-name-restrict),
-- jadi migrasi ini memakai nomor kosong berikutnya.
--
-- Fungsi ini tidak lagi dipanggil klien mana pun sejak alur masuk siswa dan
-- ortu pindah ke ADR-003 (fn_validate_roster_login dan fn_validate_ortu_login).
-- Nol pemanggil di seluruh JS, TS, dan HTML -- sudah diperiksa dua kali.
--
-- Yang dicabut hanya haknya, fungsinya dipertahankan: kalau suatu saat fitur
-- bergabung lewat kode kelas dibangun lagi, badan fungsinya sudah benar dan
-- tinggal dipasangi GRANT yang sesuai.
--
-- Sisa risikonya kecil tapi nyata selama anon masih memegangnya: siapa pun
-- tanpa kredensial dapat menukar kode kelas -- delapan karakter heksadesimal,
-- dibagikan luas lewat tautan dan QR -- menjadi classroom_id beserta nama
-- kelasnya. Sesudah 20260823000012 dan 20260823000013 nilai itu tidak lagi bisa
-- dirangkai menjadi serangan, tetapi ia tetap permukaan tanpa pengguna. Pola
-- yang sama sudah ditempuh untuk fn_activate_roster (20260823000010): hak yang
-- tidak dibutuhkan siapa pun dicabut, bukan dibiarkan menunggu.
--
-- authenticated SENGAJA dipertahankan. Guru yang sudah masuk memang berhak
-- menukar kode kelas menjadi identitas kelas, dan mempertahankannya berarti
-- kebangkitan fitur join tidak perlu menyentuh hak akses lagi.
--
-- Idempoten: REVOKE atas hak yang sudah tidak ada bukan error.

REVOKE EXECUTE ON FUNCTION fn_lookup_classroom_code(text) FROM anon;

-- Verifikasi dua arah di dalam transaksi migrasi: yang harus hilang benar-benar
-- hilang, dan yang harus tetap ada tidak ikut tercabut.
DO $$
BEGIN
  IF has_function_privilege('anon', 'fn_lookup_classroom_code(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon masih bisa mengeksekusi fn_lookup_classroom_code -- REVOKE tidak berlaku';
  END IF;

  IF NOT has_function_privilege('authenticated', 'fn_lookup_classroom_code(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated kehilangan EXECUTE atas fn_lookup_classroom_code';
  END IF;
END;
$$;
