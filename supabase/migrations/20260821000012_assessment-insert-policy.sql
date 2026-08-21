-- 20260821000012_assessment-insert-policy.sql
-- Ikat student_id dan assessment_id ke classroom pada jalur tulis hasil penilaian.
--
-- Policy yang berlaku sebelum ini (20260815000001, belum pernah diubah):
--
--   ar_guru_insert  WITH CHECK (teacher_id = fn_current_profile_id()
--                               AND fn_is_classroom_owner(classroom_id))
--   ar_guru_update  USING      (teacher_id = fn_current_profile_id()
--                               AND fn_is_classroom_owner(classroom_id))
--
-- Keduanya memeriksa "pengirim adalah guru pemilik classroom ini" dan berhenti
-- di situ. student_id dan assessment_id tidak disebut sama sekali, padahal
-- keduanya dikirim mentah dari klien — lihat upsertAssessmentResult() di
-- guru/js/api.js, yang meneruskan classroom_id, teacher_id, assessment_id, dan
-- student_id apa adanya tanpa satupun diturunkan server.
--
-- Akibatnya guru pemilik kelas A dapat menyimpan baris ber-classroom_id A yang
-- student_id-nya baris roster kelas B, atau yang assessment_id-nya penilaian
-- milik kelasnya yang lain. Barisnya memang tidak akan terbaca siswa/ortu —
-- ar_siswa_select dan ar_ortu_select sama-sama menuntut roster DAN classroom
-- cocok — tetapi tulisannya lolos dan mengotori tabel dengan baris yatim yang
-- ikut terhitung di rekap guru.
--
-- ar_guru_update punya cacat kedua yang lebih tajam: ia hanya punya USING,
-- TANPA WITH CHECK. Di PostgreSQL, USING menyaring baris mana yang boleh
-- disentuh, sedangkan WITH CHECK menguji baris HASILNYA. Tanpa WITH CHECK,
-- guru boleh mengambil baris sahnya sendiri lalu mengubah student_id, atau
-- bahkan classroom_id, menjadi apa pun — termasuk milik guru lain. Pengikatan
-- di INSERT saja tidak menutup apa-apa selama pintu UPDATE ini terbuka.
--
-- CATATAN RUANG UUID: assessment_results.student_id menunjuk
-- classroom_roster(id) sejak 20260815000003, BUKAN profiles(id). Pemeriksaan di
-- bawah karena itu menempuh classroom_roster, bukan profiles maupun
-- classroom_members.
--
-- Keadaan data sebelum migrasi ini (diperiksa di proyek tertaut): 6 baris di
-- assessment_results, 0 di antaranya melanggar salah satu dari tiga syarat baru.
-- Tidak ada baris lama yang mendadak terkunci oleh WITH CHECK di UPDATE.

BEGIN;

-- Bolehkah pemanggil menyimpan hasil penilaian dengan kombinasi ini?
--
-- Ketiga syaratnya diikat pada satu classroom yang sama, bukan diperiksa
-- sendiri-sendiri:
--   - pemanggil adalah guru pemilik classroom itu
--   - baris rosternya memang berada di classroom itu
--   - penilaiannya memang milik classroom itu
--
-- Sengaja dibuat satu fungsi gabungan, bukan dua fungsi terpisah "roster ada di
-- classroom" dan "assessment ada di classroom". Fungsi terpisah semacam itu
-- menjawab pertanyaan struktural untuk SIAPA PUN yang memegang dua uuid, dan
-- itu berarti memberi setiap pengguna authenticated sebuah orakel untuk menguji
-- keanggotaan roster kelas orang lain. Dengan digabung, pemeriksaan kepemilikan
-- ikut menjaga pintunya: bukan pemilik classroom selalu memperoleh false.
--
-- Sesuai CLAUDE.md §11 dan AGENT_WORKING_RULES §5, pemeriksaan lintas tabel ini
-- ditempatkan di fungsi SECURITY DEFINER, bukan EXISTS mentah di dalam policy —
-- classroom_roster dan assessments sama-sama ber-RLS, sehingga subquery biasa
-- akan dievaluasi dengan visibilitas si pemanggil, bukan aturan yang dimaksud.
CREATE OR REPLACE FUNCTION fn_guru_may_write_result(
  p_classroom_id  uuid,
  p_assessment_id uuid,
  p_roster_id     uuid
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT fn_is_classroom_owner(p_classroom_id)
     AND EXISTS (
           SELECT 1 FROM classroom_roster r
           WHERE r.id           = p_roster_id
             AND r.classroom_id = p_classroom_id
         )
     AND EXISTS (
           SELECT 1 FROM assessments a
           WHERE a.id           = p_assessment_id
             AND a.classroom_id = p_classroom_id
         );
$$;

REVOKE EXECUTE ON FUNCTION fn_guru_may_write_result(uuid, uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fn_guru_may_write_result(uuid, uuid, uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION fn_guru_may_write_result(uuid, uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS ar_guru_insert ON assessment_results;
CREATE POLICY ar_guru_insert ON assessment_results
  FOR INSERT TO authenticated
  WITH CHECK (
    teacher_id = fn_current_profile_id()
    AND fn_guru_may_write_result(classroom_id, assessment_id, student_id)
  );

-- USING dipertahankan seperti semula: baris mana yang boleh disentuh tetap
-- ditentukan kepemilikan classroom. Yang ditambahkan adalah WITH CHECK, yang
-- menguji baris hasilnya dengan syarat yang sama persis dengan INSERT — supaya
-- UPDATE tidak dapat dipakai untuk mencapai keadaan yang ditolak INSERT.
--
-- Jalur klien satu-satunya adalah upsert PostgREST (onConflict
-- 'assessment_id,student_id'), yang di PostgreSQL menjadi
-- INSERT ... ON CONFLICT DO UPDATE. Bentuk itu menuntut WITH CHECK milik INSERT
-- untuk baris barunya DAN USING serta WITH CHECK milik UPDATE untuk baris yang
-- bentrok, jadi kedua policy di bawah memang harus sejalan.
DROP POLICY IF EXISTS ar_guru_update ON assessment_results;
CREATE POLICY ar_guru_update ON assessment_results
  FOR UPDATE TO authenticated
  USING (
    teacher_id = fn_current_profile_id()
    AND fn_is_classroom_owner(classroom_id)
  )
  WITH CHECK (
    teacher_id = fn_current_profile_id()
    AND fn_guru_may_write_result(classroom_id, assessment_id, student_id)
  );

COMMIT;

-- Cakupan yang sengaja dibatasi:
--
-- ar_guru_select dan ar_guru_delete tidak diubah. Keduanya hanya membaca dan
-- menghapus baris yang classroom_id-nya sudah milik guru bersangkutan; tidak
-- ada nilai baru yang masuk lewat sana, jadi tidak ada yang perlu diikat.
--
-- ar_siswa_select dan ar_ortu_select tidak disentuh. Gate visibilitasnya sudah
-- dipasang 20260820000006 dan pengikatan classroom-nya 20260821000009.
--
-- student_groups punya bentuk cacat yang serupa (student_id dikirim klien,
-- policy-nya hanya memeriksa kepemilikan classroom), tetapi tabel itu di luar
-- cakupan perbaikan ini agar perubahan ini tetap satu pokok.
