-- 20260821000008_fix-grade-recap-policy.sql
-- Ikat classroom pada akses orang tua ke rekap nilai.
--
-- Policy yang berlaku sebelum ini (20260820000002) berbunyi:
--
--   USING (student_id IN (SELECT fn_child_roster_ids()))
--
-- Satu-satunya syaratnya adalah "baris ini milik salah satu anak saya", tanpa
-- menyebut classroom sama sekali. fn_child_roster_ids() meratakan seluruh anak
-- di seluruh kelas menjadi satu daftar, sehingga orang tua dengan anak di kelas
-- A dan kelas B dapat membaca baris rekap ber-classroom_id A yang student_id-nya
-- anaknya yang di B. Ini lubang yang sama persis dengan yang sudah didiagnosis
-- untuk parent_messages di 20260821000006, hanya pada tabel yang berbeda.
--
-- Bandingkan dengan policy siswa di tabel yang sama, yang sudah menyertakan
-- fn_is_classroom_member(classroom_id) — padanan untuk orang tua memang
-- tertinggal saat itu.
--
-- CATATAN STRUKTUR — penting, karena rancangan awal perbaikan ini mengasumsikan
-- sebaliknya: grade_recap TIDAK punya kolom assessment_id. Tabel ini tidak
-- pernah terhubung ke assessments; kaitannya ke tp_kktp, dan classroom_id-nya
-- tersimpan langsung sebagai kolom NOT NULL sejak 20260815000001. Jadi
-- pengikatan classroom tidak perlu menempuh assessments sama sekali — cukup
-- classroom_id yang sudah ada di barisnya.
--
-- Ruang uuid juga perlu dijaga. grade_recap.student_id menunjuk
-- classroom_roster(id) sejak 20260816000002, BUKAN profiles(id). Karena itu
-- fn_child_profile_ids() dan fn_is_my_child_in_classroom() tidak dapat dipakai
-- di sini: keduanya bekerja di ruang profil dan tidak akan cocok satu baris pun,
-- yang akibatnya justru menutup akses orang tua ke rekap anaknya sendiri.
--
-- Maka dibuat padanannya di ruang roster. Sesuai CLAUDE.md §11 dan
-- AGENT_WORKING_RULES §5, pemeriksaan lintas tabel ini ditempatkan di fungsi
-- SECURITY DEFINER, bukan EXISTS mentah di dalam policy — classroom_roster dan
-- classroom_members sama-sama ber-RLS, sehingga subquery biasa akan ikut
-- tertahan RLS tabel itu.

BEGIN;

-- Benarkah baris roster p_roster_id adalah anak saya, DI classroom p_classroom_id?
--
-- Ketiga syaratnya diikat satu sama lain, bukan diperiksa sendiri-sendiri:
--   - baris rosternya memang berada di classroom yang ditanyakan
--   - pemanggil tertaut sebagai ORTU ke profil pemilik baris roster itu
--   - tautan itu tercatat di classroom yang sama, bukan di kelas lain
--
-- Baris ORTU di classroom_members hanya ada bagi orang tua, jadi tidak perlu
-- pemeriksaan peran terpisah untuk pemanggil.
CREATE OR REPLACE FUNCTION fn_is_my_child_roster_in_classroom(
  p_classroom_id uuid,
  p_roster_id    uuid
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM classroom_roster r
    JOIN classroom_members cm
      ON cm.linked_student_id = r.profile_id
     AND cm.classroom_id      = r.classroom_id
    WHERE r.id           = p_roster_id
      AND r.classroom_id = p_classroom_id
      AND cm.profile_id  = fn_current_profile_id()
      AND cm.member_role = 'ORTU'::member_role
  );
$$;

REVOKE EXECUTE ON FUNCTION fn_is_my_child_roster_in_classroom(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fn_is_my_child_roster_in_classroom(uuid, uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION fn_is_my_child_roster_in_classroom(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS gr_ortu_select ON grade_recap;
CREATE POLICY gr_ortu_select ON grade_recap
  FOR SELECT TO authenticated
  USING (fn_is_my_child_roster_in_classroom(classroom_id, student_id));

COMMIT;

-- Cakupan yang sengaja dibatasi:
--
-- gr_siswa_select tidak diubah. Ia sudah memeriksa fn_is_classroom_member
-- (classroom_id) bersama student_id IN fn_current_roster_ids(), dan seorang
-- siswa hanya memiliki satu baris roster per classroom — kombinasi itu tidak
-- membuka celah yang sama.
--
-- ar_ortu_select pada assessment_results MASIH berlubang dengan cara yang
-- persis sama (USING student_id IN (SELECT fn_child_roster_ids()) saja, tanpa
-- classroom). Menutupnya cukup dengan memanggil fungsi yang baru dibuat di atas,
-- tetapi tabel itu berada di luar cakupan perbaikan ini dan dibiarkan apa adanya
-- agar perubahan ini tetap satu pokok.
