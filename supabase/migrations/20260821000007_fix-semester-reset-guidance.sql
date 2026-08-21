-- 20260821000007_fix-semester-reset-guidance.sql
-- Sesi pembinaan ikut dihapus saat reset semester.
--
-- fn_semester_reset melewatkan guidance_sessions sejak awal. Akibatnya catatan
-- sesi pembinaan semester lama tertinggal di kelas yang sudah dikosongkan:
-- guru memulai semester baru dengan daftar siswa yang sama, membuka Pembinaan,
-- dan menemukan riwayat yang seharusnya sudah tertutup — termasuk untuk siswa
-- yang tahun ini bukan lagi tanggung jawabnya.
--
-- Modal konfirmasi di portal guru menjanjikan seluruh data kelas terhapus, dan
-- guidance_sessions termasuk di dalamnya. Kelalaian ini membuat janji itu tidak
-- ditepati untuk salah satu data paling sensitif di aplikasi.
--
-- Tidak ada tabel yang menunjuk ke guidance_sessions (nol FK masuk), jadi
-- posisinya dalam urutan penghapusan bebas. Ditaruh bersebelahan dengan
-- student_notes karena keduanya sama-sama catatan guru tentang siswa.
--
-- Selebihnya badan fungsi ini identik dengan 20260821000005 — CREATE OR REPLACE,
-- jadi hak akses yang sudah dipasang di sana tetap berlaku, dan REVOKE/GRANT
-- diulang di bawah agar migrasi ini tetap benar bila dijalankan sendirian.

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
$$;

-- Hanya Edge Function (service_role) yang boleh memanggil. Guru tidak memanggil
-- langsung dari browser: fungsinya SECURITY DEFINER dan menerima teacher_id
-- sebagai argumen, jadi akses dari klien berarti guru mana pun bisa mereset
-- data guru lain hanya dengan mengganti satu uuid.
REVOKE EXECUTE ON FUNCTION fn_semester_reset(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fn_semester_reset(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION fn_semester_reset(uuid) FROM authenticated;
GRANT  EXECUTE ON FUNCTION fn_semester_reset(uuid) TO service_role;
