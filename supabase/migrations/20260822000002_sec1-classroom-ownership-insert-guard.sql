-- 20260822000002_sec1-classroom-ownership-insert-guard.sql
-- BUG-SEC-1: ikat classroom_id ke kepemilikan pemanggil pada tujuh policy tulis guru.
--
-- Ketujuh policy ini FOR ALL dengan WITH CHECK yang hanya berbunyi
-- "teacher_id = fn_current_profile_id()". classroom_id dikirim mentah dari klien
-- dan tidak diuji sama sekali. Guru authenticated mana pun karena itu dapat
-- menulis baris ber-classroom_id milik guru lain, asalkan kolom teacher_id-nya
-- diisi profil dirinya sendiri.
--
-- Yang TIDAK bisa dilakukan lewat celah ini: membaca, mengubah, atau menghapus
-- baris guru lain — USING (teacher_id = fn_current_profile_id()) sudah menutup
-- itu. Jadi bentuk kerusakannya injeksi, bukan pencurian.
--
-- Dampak terberat ada di forum_posts, schedules, dan forum_comments: policy
-- SELECT anggotanya hanya menuntut fn_is_classroom_member(classroom_id), tanpa
-- ikatan ke penulis. Baris sisipan tampil kepada seluruh siswa classroom korban,
-- sementara guru pemilik classroom itu tidak dapat melihat maupun menghapusnya —
-- USING miliknya mengunci ke teacher_id si penyisip. Di classroom_roster
-- bentuknya berbeda: UNIQUE (classroom_id, nis) membuat baris sisipan memblokir
-- pendaftaran siswa ber-NIS itu oleh guru yang sah, tanpa ia tahu penyebabnya.
--
-- Karena policy-nya FOR ALL, satu WITH CHECK melayani INSERT sekaligus UPDATE.
-- Menguatkannya di sini otomatis menutup juga jalur "ambil baris sah milik
-- sendiri, lalu geser classroom_id ke milik korban".
--
-- USING sengaja tidak disentuh. Ia menentukan baris mana yang boleh dilihat dan
-- disentuh, dan syarat itu sudah benar; yang kurang adalah pengujian atas baris
-- HASIL, dan itu ranah WITH CHECK.
--
-- fn_is_classroom_owner aman dipakai sebagai guard tunggal di sini dan tidak
-- menjadi orakel bagi penyerang: ia hanya menjawab "apakah AKU pemilik classroom
-- ini", bukan pertanyaan struktural tentang data milik orang lain.
--
-- Keadaan data sebelum migrasi (diperiksa di proyek tertaut): pada ketujuh tabel,
-- 0 baris yang teacher_id-nya berbeda dari pemilik classroom_id-nya. Tidak ada
-- baris lama yang mendadak terkunci dari UPDATE oleh WITH CHECK yang baru.

BEGIN;

ALTER POLICY pol_roster_guru_all ON classroom_roster
  USING      (teacher_id = fn_current_profile_id())
  WITH CHECK (teacher_id = fn_current_profile_id()
              AND fn_is_classroom_owner(classroom_id));

ALTER POLICY pol_attendance_guru_all ON attendance
  USING      (teacher_id = fn_current_profile_id())
  WITH CHECK (teacher_id = fn_current_profile_id()
              AND fn_is_classroom_owner(classroom_id));

ALTER POLICY pol_notes_guru_all ON student_notes
  USING      (teacher_id = fn_current_profile_id())
  WITH CHECK (teacher_id = fn_current_profile_id()
              AND fn_is_classroom_owner(classroom_id));

ALTER POLICY pol_guidance_guru_all ON guidance_sessions
  USING      (teacher_id = fn_current_profile_id())
  WITH CHECK (teacher_id = fn_current_profile_id()
              AND fn_is_classroom_owner(classroom_id));

ALTER POLICY pol_schedules_guru_all ON schedules
  USING      (teacher_id = fn_current_profile_id())
  WITH CHECK (teacher_id = fn_current_profile_id()
              AND fn_is_classroom_owner(classroom_id));

ALTER POLICY pol_posts_guru_all ON forum_posts
  USING      (teacher_id = fn_current_profile_id())
  WITH CHECK (teacher_id = fn_current_profile_id()
              AND fn_is_classroom_owner(classroom_id));

ALTER POLICY pol_comments_guru_all ON forum_comments
  USING      (teacher_id = fn_current_profile_id())
  WITH CHECK (teacher_id = fn_current_profile_id()
              AND fn_is_classroom_owner(classroom_id));

-- Verifikasi: hitung yang SUDAH terpasang dan tuntut tepat tujuh, bukan hitung
-- yang belum dan tuntut nol. Bentuk kedua lolos secara hampa kalau sebuah nama
-- policy berubah atau hilang di kemudian hari — nol baris yang cocok akan
-- terbaca sebagai "semua aman".
DO $$
DECLARE
  ok_count int;
BEGIN
  SELECT COUNT(*) INTO ok_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND policyname IN (
      'pol_roster_guru_all','pol_attendance_guru_all','pol_notes_guru_all',
      'pol_guidance_guru_all','pol_schedules_guru_all','pol_posts_guru_all',
      'pol_comments_guru_all'
    )
    AND with_check LIKE '%fn_is_classroom_owner%';

  IF ok_count <> 7 THEN
    RAISE EXCEPTION
      'Hanya % dari 7 policy yang punya fn_is_classroom_owner di WITH CHECK — ROLLBACK',
      ok_count;
  END IF;
END $$;

COMMIT;

-- Cakupan yang sengaja dibatasi:
--
-- pol_comments_member_insert tidak disentuh. Itu jalur siswa, dan WITH CHECK-nya
-- sudah benar sejak awal: author_id = fn_current_profile_id() AND
-- fn_is_classroom_member(classroom_id).
--
-- Policy SELECT siswa/ortu tidak diubah. Migrasi ini soal apa yang boleh masuk,
-- bukan apa yang boleh terbaca.
