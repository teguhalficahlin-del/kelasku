-- 20260821000009_fix-ar-ortu-policy.sql
-- Ikat classroom pada akses orang tua ke hasil penilaian per siswa.
--
-- Lanjutan langsung dari 20260821000008, yang menutup lubang yang sama pada
-- grade_recap. Policy yang berlaku sebelum ini:
--
--   USING (
--     student_id IN (SELECT fn_child_roster_ids())
--     AND EXISTS (SELECT 1 FROM assessments a
--                 WHERE a.id = assessment_results.assessment_id
--                   AND a.is_visible_ortu = true)
--   )
--
-- Syarat pertamanya hanya berbunyi "baris ini milik salah satu anak saya", di
-- classroom mana pun — fn_child_roster_ids() meratakan seluruh anak di seluruh
-- kelas menjadi satu daftar.
--
-- Seberapa terbuka lubangnya perlu dinyatakan apa adanya, sebab lebih sempit
-- daripada yang ada di grade_recap. Subquery EXISTS di atas menyentuh
-- assessments, yang juga ber-RLS, sehingga ia dievaluasi dengan visibilitas si
-- pemanggil: orang tua yang bukan anggota classroom itu tidak dapat melihat
-- baris assessments-nya, dan barisnya gugur dengan sendirinya. Yang tersisa —
-- dan itulah yang ditutup di sini — adalah orang tua yang MEMANG anggota kedua
-- kelas, yaitu yang punya anak di lebih dari satu kelas. Bagi mereka, baris
-- ber-classroom_id kelas B dengan student_id anaknya yang di kelas A lolos
-- kedua syarat lama sekaligus.
--
-- Perbaikannya memakai fungsi yang sudah dipasang 20260821000008, sehingga
-- migrasi ini tidak menambah fungsi baru sama sekali. Gate is_visible_ortu
-- dipertahankan persis seperti semula: yang ditambahkan hanya pengikatan
-- classroom, bukan perubahan aturan visibilitas.
--
-- Catatan ruang uuid, sama seperti pada grade_recap: assessment_results
-- .student_id menunjuk classroom_roster(id) sejak 20260815000003, bukan
-- profiles(id). fn_child_profile_ids() dan fn_is_my_child_in_classroom() bekerja
-- di ruang profil dan tidak akan cocok satu baris pun di sini.

BEGIN;

DROP POLICY IF EXISTS ar_ortu_select ON assessment_results;
CREATE POLICY ar_ortu_select ON assessment_results
  FOR SELECT TO authenticated
  USING (
    fn_is_my_child_roster_in_classroom(classroom_id, student_id)
    AND EXISTS (
      SELECT 1 FROM assessments a
      WHERE a.id = assessment_results.assessment_id
        AND a.is_visible_ortu = true
    )
  );

COMMIT;

-- EXISTS mentah di atas sengaja dibiarkan apa adanya, bukan dipindah ke fungsi
-- SECURITY DEFINER seperti yang diminta CLAUDE.md §11. Alasannya: di sini
-- penyaringan oleh RLS assessments justru menguntungkan dan sudah menjadi
-- perilaku yang berlaku — menggantinya mengubah semantik gate visibilitas,
-- bukan sekadar merapikan bentuk, dan itu keputusan tersendiri di luar cakupan
-- perbaikan ini.
