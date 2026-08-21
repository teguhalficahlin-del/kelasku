-- 20260821000011_drop-rubrik-warisan.sql
-- Hapus tiga tabel sisa skema penilaian lama.
--
-- assessment_rubric_criteria, assessment_rubric_results, dan
-- assessment_kktp_results dibuat oleh 20260808000002 dan 20260808000003. Ketika
-- 20260815000001 mengganti arsitektur penilaian, ia men-DROP CASCADE assessments
-- lama dan student_grades, tetapi ketiga tabel ini tertinggal — tidak ikut
-- dihapus, dan tidak pernah dipakai lagi sesudahnya.
--
-- Keadaan sebelum penghapusan, diperiksa langsung di remote:
--   - nol baris di ketiganya
--   - nol rujukan di seluruh repo: guru/, siswa/, ortu/, shared/, admin/,
--     supabase/functions/, dan tests/ (grep atas *.js, *.ts, *.html, *.json, *.md)
--   - nol foreign key MASUK dari tabel lain
--   - nol view yang mengeksposnya
--   - satu-satunya objek DB yang menyebutnya adalah fn_semester_reset
--
-- Alasan menghapus, bukan membiarkan: ketiganya masih ber-RLS dan ber-FK ke
-- profiles(id) untuk kolom student_id — ruang uuid yang sudah ditinggalkan
-- tabel penilaian aktif sejak 20260815000003 dan 20260816000002, yang kini
-- memakai classroom_roster(id). Tabel mati yang membawa asumsi usang seperti itu
-- adalah jebakan bagi siapa pun yang kelak menghidupkannya kembali; sudah tiga
-- kali dalam pengerjaan ini sebuah policy nyaris ditulis di ruang uuid yang
-- salah karena percampuran tersebut.
--
-- Urutan DROP mengikuti arah FK: assessment_rubric_results menunjuk
-- assessment_rubric_criteria lewat criteria_id, jadi anak dihapus lebih dulu.
-- CASCADE sengaja TIDAK dipakai — kalau ternyata ada dependensi yang belum
-- terdeteksi, migrasi ini harus gagal dengan jelas, bukan diam-diam ikut
-- menghapus objek lain.

BEGIN;

DROP TABLE IF EXISTS assessment_rubric_results;
DROP TABLE IF EXISTS assessment_kktp_results;
DROP TABLE IF EXISTS assessment_rubric_criteria;

-- fn_semester_reset ditulis ulang tanpa ketiga tabel itu. Definisi di bawah
-- disalin dari pg_get_functiondef(oid) milik remote, bukan disusun dari ingatan,
-- lalu tiga blok DELETE beserta pencatatan hitungannya dibuang. Sisanya —
-- urutan, komentar, dan perilaku — dipertahankan apa adanya.
--
-- Kunci jsonb 'assessment_rubric_results', 'assessment_kktp_results', dan
-- 'assessment_rubric_criteria' otomatis hilang dari laporan 'dihapus'. Tidak ada
-- pemanggil yang membacanya per kunci: Edge Function semester-reset meneruskan
-- seluruh objek apa adanya.
CREATE OR REPLACE FUNCTION public.fn_semester_reset(p_teacher_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_classrooms uuid[];
  v_hasil      jsonb := '{}'::jsonb;
  v_n          bigint;
BEGIN
  IF p_teacher_id IS NULL THEN
    RAISE EXCEPTION 'p_teacher_id wajib diisi';
  END IF;

  -- Sasaran harus profil GURU. Tanpa penyaringan ini, satu id siswa atau ortu
  -- akan diterima diam-diam dan menghapus nol baris — gagal tanpa suara,
  -- yang lebih buruk daripada gagal dengan jelas.
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = p_teacher_id AND role = 'GURU'
  ) THEN
    RAISE EXCEPTION 'Profil % bukan GURU atau tidak ditemukan', p_teacher_id;
  END IF;

  SELECT coalesce(array_agg(id), ARRAY[]::uuid[])
    INTO v_classrooms
    FROM classrooms
   WHERE teacher_id = p_teacher_id;

  -- Guru tanpa classroom tetap sah melakukan reset: tidak ada yang dihapus,
  -- tapi last_reset_at tetap dicatat supaya bannernya berhenti muncul.
  IF array_length(v_classrooms, 1) IS NOT NULL THEN

    DELETE FROM attendance                WHERE classroom_id = ANY(v_classrooms);
    GET DIAGNOSTICS v_n = ROW_COUNT; v_hasil := v_hasil || jsonb_build_object('attendance', v_n);

    DELETE FROM assessment_results        WHERE classroom_id = ANY(v_classrooms);
    GET DIAGNOSTICS v_n = ROW_COUNT; v_hasil := v_hasil || jsonb_build_object('assessment_results', v_n);

    DELETE FROM grade_recap               WHERE classroom_id = ANY(v_classrooms);
    GET DIAGNOSTICS v_n = ROW_COUNT; v_hasil := v_hasil || jsonb_build_object('grade_recap', v_n);

    DELETE FROM assessments               WHERE classroom_id = ANY(v_classrooms);
    GET DIAGNOSTICS v_n = ROW_COUNT; v_hasil := v_hasil || jsonb_build_object('assessments', v_n);

    DELETE FROM tp_kktp                   WHERE classroom_id = ANY(v_classrooms);
    GET DIAGNOSTICS v_n = ROW_COUNT; v_hasil := v_hasil || jsonb_build_object('tp_kktp', v_n);

    DELETE FROM schedules                 WHERE classroom_id = ANY(v_classrooms);
    GET DIAGNOSTICS v_n = ROW_COUNT; v_hasil := v_hasil || jsonb_build_object('schedules', v_n);

    DELETE FROM student_notes             WHERE classroom_id = ANY(v_classrooms);
    GET DIAGNOSTICS v_n = ROW_COUNT; v_hasil := v_hasil || jsonb_build_object('student_notes', v_n);

    DELETE FROM guidance_sessions         WHERE classroom_id = ANY(v_classrooms);
    GET DIAGNOSTICS v_n = ROW_COUNT; v_hasil := v_hasil || jsonb_build_object('guidance_sessions', v_n);

    DELETE FROM student_groups            WHERE classroom_id = ANY(v_classrooms);
    GET DIAGNOSTICS v_n = ROW_COUNT; v_hasil := v_hasil || jsonb_build_object('student_groups', v_n);

    DELETE FROM parent_messages           WHERE classroom_id = ANY(v_classrooms);
    GET DIAGNOSTICS v_n = ROW_COUNT; v_hasil := v_hasil || jsonb_build_object('parent_messages', v_n);

    -- forum_comments ikut lewat FK post_id ON DELETE CASCADE.
    DELETE FROM forum_posts               WHERE classroom_id = ANY(v_classrooms);
    GET DIAGNOSTICS v_n = ROW_COUNT; v_hasil := v_hasil || jsonb_build_object('forum_posts', v_n);

  END IF;

  UPDATE profiles
     SET last_reset_at = now()
   WHERE id = p_teacher_id;

  RETURN jsonb_build_object(
    'success',    true,
    'classrooms', coalesce(array_length(v_classrooms, 1), 0),
    'dihapus',    v_hasil
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION fn_semester_reset(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fn_semester_reset(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION fn_semester_reset(uuid) FROM authenticated;
GRANT  EXECUTE ON FUNCTION fn_semester_reset(uuid) TO service_role;

COMMIT;

-- Hak akses di atas ditegaskan ulang, bukan diubah: CREATE OR REPLACE tidak
-- menyentuh privilege yang sudah ada, tetapi menuliskannya kembali membuat
-- maksudnya terbaca dari migrasi ini. Fungsi ini hanya boleh dipanggil
-- service_role lewat Edge Function semester-reset — pemeriksaan sebelumnya
-- mengonfirmasi authenticated dan anon memang tidak punya EXECUTE.
