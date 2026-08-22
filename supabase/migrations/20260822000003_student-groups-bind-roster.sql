-- 20260822000003_student-groups-bind-roster.sql
-- Ikat student_id ke classroom pada jalur tulis student_groups.
--
-- Ini menutup catatan penutup 20260821000012, yang menyebut student_groups punya
-- bentuk cacat serupa assessment_results tetapi sengaja ditinggalkan agar
-- perubahan waktu itu tetap satu pokok.
--
-- Yang SUDAH benar dan tidak perlu disentuh: kepemilikan classroom. Ketiga policy
-- tulis guru (sgrp_guru_insert/update/delete) sudah memanggil
-- fn_is_classroom_owner(classroom_id), jadi student_groups TIDAK punya celah
-- BUG-SEC-1. Baris tidak dapat disisipkan ke classroom guru lain.
--
-- Yang kurang: student_id menunjuk classroom_roster(id) dan dikirim mentah dari
-- klien — lihat upsertStudentGroup() di guru/js/api.js baris 439, yang meneruskan
-- classroom_id, student_id, dan grup apa adanya. Tidak ada satupun yang
-- diturunkan server. Akibatnya guru dapat menyimpan baris ber-classroom_id
-- miliknya sendiri yang student_id-nya baris roster kelas lain.
--
-- Dampaknya polusi, bukan paparan: sgrp_siswa_select menuntut
-- fn_is_classroom_member(classroom_id) DAN student_id = pemanggil, sedangkan
-- sgrp_ortu_select menuntut baris classroom_members yang cocok classroom sekaligus
-- anaknya. Siswa kelas lain bukan anggota classroom itu, jadi baris yatimnya tidak
-- terbaca siapa pun. Yang rusak adalah data guru itu sendiri: barisnya ikut
-- terhitung di pengelompokan dan rekap, menunjuk siswa yang bukan muridnya.
--
-- CATATAN RUANG UUID: student_groups.student_id menunjuk classroom_roster(id),
-- BUKAN profiles(id) — lihat student_groups_student_id_fkey. Pemeriksaan di bawah
-- karena itu menempuh classroom_roster, sama seperti fn_guru_may_write_result.
--
-- Keadaan data sebelum migrasi (diperiksa di proyek tertaut): student_groups
-- berisi 0 baris, 0 di antaranya melanggar syarat baru. Tidak ada baris lama yang
-- mendadak terkunci.

BEGIN;

-- Bolehkah pemanggil menyimpan pengelompokan dengan kombinasi ini?
--
-- Kedua syaratnya diikat pada satu classroom yang sama, bukan diperiksa
-- sendiri-sendiri:
--   - pemanggil adalah guru pemilik classroom itu
--   - baris rosternya memang berada di classroom itu
--
-- Digabung dalam satu fungsi, bukan dipecah menjadi "roster ada di classroom"
-- yang berdiri sendiri, dengan alasan yang sama seperti fn_guru_may_write_result:
-- fungsi terpisah semacam itu menjawab pertanyaan struktural bagi SIAPA PUN yang
-- memegang dua uuid, dan itu memberi setiap pengguna authenticated orakel untuk
-- menguji keanggotaan roster kelas orang lain. Dengan digabung, pemeriksaan
-- kepemilikan ikut menjaga pintunya: bukan pemilik selalu memperoleh false.
CREATE OR REPLACE FUNCTION fn_guru_may_write_group(
  p_classroom_id uuid,
  p_roster_id    uuid
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
         );
$$;

REVOKE EXECUTE ON FUNCTION fn_guru_may_write_group(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fn_guru_may_write_group(uuid, uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION fn_guru_may_write_group(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS sgrp_guru_insert ON student_groups;
CREATE POLICY sgrp_guru_insert ON student_groups
  FOR INSERT TO authenticated
  WITH CHECK (fn_guru_may_write_group(classroom_id, student_id));

-- USING dipertahankan seperti semula: baris mana yang boleh disentuh tetap
-- ditentukan kepemilikan classroom. Yang ditambahkan adalah WITH CHECK yang
-- eksplisit.
--
-- Policy UPDATE lama tidak menuliskan WITH CHECK sama sekali. Di PostgreSQL itu
-- BUKAN berarti tanpa pemeriksaan — bila WITH CHECK dihilangkan pada policy
-- UPDATE, ekspresi USING dipakai ulang untuk menguji baris hasilnya. Jadi
-- menggeser classroom_id ke kelas orang lain memang sudah tertutup sejak dulu.
-- Yang belum tertutup adalah menggeser student_id ke baris roster kelas lain,
-- dan itulah yang ditambahkan di sini.
DROP POLICY IF EXISTS sgrp_guru_update ON student_groups;
CREATE POLICY sgrp_guru_update ON student_groups
  FOR UPDATE TO authenticated
  USING      (fn_is_classroom_owner(classroom_id))
  WITH CHECK (fn_guru_may_write_group(classroom_id, student_id));

-- Verifikasi: hitung yang SUDAH terpasang dan tuntut tepat dua.
DO $$
DECLARE
  ok_count int;
BEGIN
  SELECT COUNT(*) INTO ok_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename  = 'student_groups'
    AND policyname IN ('sgrp_guru_insert','sgrp_guru_update')
    AND with_check LIKE '%fn_guru_may_write_group%';

  IF ok_count <> 2 THEN
    RAISE EXCEPTION
      'Hanya % dari 2 policy student_groups yang terikat roster — ROLLBACK', ok_count;
  END IF;
END $$;

COMMIT;

-- Cakupan yang sengaja dibatasi:
--
-- sgrp_guru_select dan sgrp_guru_delete tidak diubah. Keduanya hanya membaca dan
-- menghapus baris yang classroom_id-nya sudah milik guru bersangkutan; tidak ada
-- nilai baru yang masuk lewat sana.
--
-- sgrp_siswa_select dan sgrp_ortu_select tidak disentuh — sudah mengikat student
-- dan classroom sekaligus.
--
-- Jalur klien satu-satunya adalah upsert PostgREST (onConflict
-- 'classroom_id,student_id'), yang di PostgreSQL menjadi
-- INSERT ... ON CONFLICT DO UPDATE. Bentuk itu menuntut WITH CHECK milik INSERT
-- untuk baris barunya DAN USING serta WITH CHECK milik UPDATE untuk baris yang
-- bentrok, jadi kedua policy di atas memang harus sejalan — dan di sini keduanya
-- memakai fungsi gate yang sama persis.
