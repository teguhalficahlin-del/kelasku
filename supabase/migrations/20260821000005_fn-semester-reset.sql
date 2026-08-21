-- 20260821000005_fn-semester-reset.sql
-- Reset semester sebagai satu transaksi database.
--
-- Sebelumnya penghapusan dilakukan Edge Function sebagai rangkaian request
-- service-role terpisah — satu request per tabel per classroom. Kegagalan di
-- tengah meninggalkan sebagian data terhapus dan sebagian utuh, tanpa jalan
-- pulih.
--
-- Itu bukan risiko teoretis. Sejak 20260815000001 (student_grades di-DROP,
-- assessment_items di-RENAME menjadi tp_kktp) Edge Function masih memanggil
-- kedua nama lama, sehingga SETIAP reset berhenti tepat setelah attendance,
-- student_notes, dan schedules terhapus. Guru melihat pesan gagal dan mengira
-- tidak terjadi apa-apa, padahal tiga tabel itu sudah lenyap permanen dan
-- last_reset_at tidak pernah terisi.
--
-- Sebagai satu fungsi, seluruh penghapusan berbagi satu transaksi: exception
-- apa pun di tengah jalan membatalkan semuanya, termasuk last_reset_at.
--
-- Urutan penghapusan mengikuti arah FK — anak dulu, induk belakangan:
--   attendance                → schedules (CASCADE)
--   assessment_results        → assessments, classroom_roster (CASCADE)
--   assessment_rubric_results → assessment_rubric_criteria (CASCADE)
--   assessment_kktp_results   → tp_kktp (CASCADE)
--   grade_recap               → tp_kktp, classroom_roster (CASCADE)
--   assessments               → tp_kktp (SET NULL)
--   forum_comments            → forum_posts (CASCADE, ikut terhapus sendiri)
-- Cakupannya sama untuk semua classroom milik guru yang bersangkutan.
--
-- Yang TIDAK disentuh: classrooms, classroom_roster, classroom_members, dan
-- profiles siswa/ortu — guru memulai semester baru dengan kelas dan daftar
-- siswa yang sama, hanya isinya yang kosong.

CREATE OR REPLACE FUNCTION fn_semester_reset(p_teacher_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

    DELETE FROM assessment_rubric_results WHERE classroom_id = ANY(v_classrooms);
    GET DIAGNOSTICS v_n = ROW_COUNT; v_hasil := v_hasil || jsonb_build_object('assessment_rubric_results', v_n);

    DELETE FROM assessment_kktp_results   WHERE classroom_id = ANY(v_classrooms);
    GET DIAGNOSTICS v_n = ROW_COUNT; v_hasil := v_hasil || jsonb_build_object('assessment_kktp_results', v_n);

    DELETE FROM grade_recap               WHERE classroom_id = ANY(v_classrooms);
    GET DIAGNOSTICS v_n = ROW_COUNT; v_hasil := v_hasil || jsonb_build_object('grade_recap', v_n);

    DELETE FROM assessments               WHERE classroom_id = ANY(v_classrooms);
    GET DIAGNOSTICS v_n = ROW_COUNT; v_hasil := v_hasil || jsonb_build_object('assessments', v_n);

    DELETE FROM assessment_rubric_criteria WHERE classroom_id = ANY(v_classrooms);
    GET DIAGNOSTICS v_n = ROW_COUNT; v_hasil := v_hasil || jsonb_build_object('assessment_rubric_criteria', v_n);

    DELETE FROM tp_kktp                   WHERE classroom_id = ANY(v_classrooms);
    GET DIAGNOSTICS v_n = ROW_COUNT; v_hasil := v_hasil || jsonb_build_object('tp_kktp', v_n);

    DELETE FROM schedules                 WHERE classroom_id = ANY(v_classrooms);
    GET DIAGNOSTICS v_n = ROW_COUNT; v_hasil := v_hasil || jsonb_build_object('schedules', v_n);

    DELETE FROM student_notes             WHERE classroom_id = ANY(v_classrooms);
    GET DIAGNOSTICS v_n = ROW_COUNT; v_hasil := v_hasil || jsonb_build_object('student_notes', v_n);

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
$$;

-- Hanya Edge Function (service_role) yang boleh memanggil. Guru tidak memanggil
-- langsung dari browser: fungsinya SECURITY DEFINER dan menerima teacher_id
-- sebagai argumen, jadi akses dari klien berarti guru mana pun bisa mereset
-- data guru lain hanya dengan mengganti satu uuid.
REVOKE EXECUTE ON FUNCTION fn_semester_reset(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fn_semester_reset(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION fn_semester_reset(uuid) FROM authenticated;
GRANT  EXECUTE ON FUNCTION fn_semester_reset(uuid) TO service_role;
