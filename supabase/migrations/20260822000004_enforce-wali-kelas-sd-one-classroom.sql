-- 20260822000004_enforce-wali-kelas-sd-one-classroom.sql
-- Tegakkan invariant "WALI_KELAS_SD maksimal 1 classroom" di database.
--
-- Sampai sekarang batas ini hanya hidup di guru/js/guru.js baris 487, sebagai
-- pengecekan atas cachedClassrooms sebelum modal dikirim. Siapa pun yang memanggil
-- PostgREST langsung dengan JWT-nya sendiri melewatinya tanpa hambatan:
-- pol_classrooms_guru_all hanya menuntut teacher_id = fn_current_profile_id(),
-- dan tidak ada constraint maupun trigger yang menghitung jumlah classroom.
--
-- KENAPA BUKAN PARTIAL UNIQUE INDEX. Bentuk yang paling ringan untuk aturan
-- "maksimal satu baris per teacher_id" adalah
--   CREATE UNIQUE INDEX ... ON classrooms (teacher_id) WHERE <role = WALI_KELAS_SD>
-- tetapi predikat index harus IMMUTABLE dan hanya boleh menyebut kolom tabel itu
-- sendiri. role_guru ada di profiles, bukan di classrooms, sehingga predikatnya
-- akan menuntut subquery — dan subquery dilarang di predikat index. Menyalin
-- role_guru ke classrooms sebagai kolom snapshot memang membuat index itu mungkin,
-- tetapi menciptakan denormalisasi yang harus dijaga sinkron setiap kali peran guru
-- berubah; harganya lebih mahal daripada masalah yang dipecahkan. Karena itu
-- trigger.
--
-- KENAPA MENGUNCI BARIS profiles. Trigger yang sekadar menjalankan EXISTS tidak
-- aman terhadap dua INSERT bersamaan: di READ COMMITTED, keduanya membaca keadaan
-- sebelum lawannya commit, keduanya lolos, dan guru berakhir dengan dua classroom.
-- SELECT ... FOR UPDATE atas baris profiles milik guru itu membuat transaksi kedua
-- menunggu sampai yang pertama selesai, lalu membaca hasilnya. Penguncian ini
-- sekaligus menutup TOCTOU pada role_guru: peran tidak dapat berubah antara saat
-- dibaca dan saat barisnya masuk.
--
-- CAKUPAN. Hitungan mencakup classroom terarsip, sama seperti klien: getClassrooms()
-- di guru/js/api.js tidak menyaring is_archived, jadi cachedClassrooms.length juga
-- menghitungnya. Menyamakan keduanya mencegah keadaan di mana tombol tampak
-- tersedia tetapi database menolak, atau sebaliknya. Kalau kelak diputuskan bahwa
-- classroom terarsip tidak lagi dihitung, keduanya harus diubah bersama.
--
-- ERRCODE. RAISE memakai ERRCODE 23514 (check_violation) supaya PostgREST
-- menerjemahkannya menjadi HTTP 400, bukan 500 — klien membacanya sebagai
-- penolakan validasi, bukan kegagalan server.
--
-- Keadaan data sebelum migrasi (diperiksa di proyek tertaut): satu profil
-- WALI_KELAS_SD, memiliki tepat 1 classroom. Dua guru yang memegang 2 classroom
-- keduanya GURU_MAPEL_UMUM_SMK, dan tidak tersentuh aturan ini. Tidak ada baris
-- yang melanggar.

BEGIN;

CREATE OR REPLACE FUNCTION fn_enforce_wali_kelas_sd_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  -- Kunci baris guru lebih dulu, baru baca perannya. Urutan ini yang membuat
  -- pemeriksaan di bawah bermakna di bawah konkurensi.
  SELECT role_guru INTO v_role
  FROM profiles
  WHERE id = NEW.teacher_id
  FOR UPDATE;

  IF v_role IS DISTINCT FROM 'WALI_KELAS_SD' THEN
    RETURN NEW;
  END IF;

  -- id IS DISTINCT FROM NEW.id membuat UPDATE atas baris yang sudah ada tidak
  -- menghitung dirinya sendiri sebagai pesaing.
  IF EXISTS (
    SELECT 1 FROM classrooms
    WHERE teacher_id = NEW.teacher_id
      AND id IS DISTINCT FROM NEW.id
  ) THEN
    RAISE EXCEPTION
      'Wali Kelas SD hanya dapat memiliki 1 kelas'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION fn_enforce_wali_kelas_sd_limit() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fn_enforce_wali_kelas_sd_limit() FROM anon;

DROP TRIGGER IF EXISTS trg_wali_kelas_sd_limit ON classrooms;
CREATE TRIGGER trg_wali_kelas_sd_limit
  BEFORE INSERT OR UPDATE OF teacher_id ON classrooms
  FOR EACH ROW
  EXECUTE FUNCTION fn_enforce_wali_kelas_sd_limit();

-- Verifikasi: trigger terpasang, dan tidak ada guru WALI_KELAS_SD yang melanggar.
DO $$
DECLARE
  v_trigger_ada int;
  v_pelanggar   int;
BEGIN
  SELECT COUNT(*) INTO v_trigger_ada
  FROM pg_trigger
  WHERE tgrelid = 'classrooms'::regclass
    AND tgname  = 'trg_wali_kelas_sd_limit'
    AND NOT tgisinternal;

  IF v_trigger_ada <> 1 THEN
    RAISE EXCEPTION 'Trigger trg_wali_kelas_sd_limit tidak terpasang — ROLLBACK';
  END IF;

  SELECT COUNT(*) INTO v_pelanggar
  FROM (
    SELECT c.teacher_id
    FROM classrooms c
    JOIN profiles p ON p.id = c.teacher_id
    WHERE p.role_guru = 'WALI_KELAS_SD'
    GROUP BY c.teacher_id
    HAVING COUNT(*) > 1
  ) t;

  IF v_pelanggar > 0 THEN
    RAISE EXCEPTION
      '% guru WALI_KELAS_SD sudah punya lebih dari 1 classroom — ROLLBACK', v_pelanggar;
  END IF;
END $$;

COMMIT;

-- Cakupan yang sengaja dibatasi:
--
-- Trigger hanya dipasang untuk INSERT dan UPDATE OF teacher_id. UPDATE atas kolom
-- lain (nama, jenjang, mapel_key) tidak mengubah jumlah classroom siapa pun, jadi
-- tidak perlu ikut membayar biaya penguncian baris profiles.
--
-- Perubahan role_guru guru yang sudah punya banyak classroom menjadi WALI_KELAS_SD
-- TIDAK dicegah di sini — trigger ini hidup di classrooms, bukan di profiles.
-- Keadaan itu hanya dapat tercipta lewat perubahan peran manual, dan peran dikunci
-- setelah onboarding (profiles.role_locked_at). Kalau kelak jalur ubah peran
-- dibuka untuk pengguna, aturan pasangannya perlu ditambahkan di sisi profiles.
