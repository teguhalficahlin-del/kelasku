-- 20260823000005_guard-semester-reset-guru-go-only.sql
-- Reset semester dibatasi ke tier GURU_GO.
--
-- Nomor 20260823000003 dan 000004 sudah terpakai (notifikasi-trial-idempotency
-- dan cron-notifikasi-trial), jadi migrasi ini memakai nomor kosong berikutnya.
--
-- Model tier di docs/TIER-AND-LIFECYCLE.md:
--   TRIAL    -> tidak boleh reset apa pun; akhir trial = hard delete
--   GURU_GO  -> reset semester, 2x setahun
--   GURU_PRO -> reset tahun ajaran, 1x setahun (fn_tahun_ajaran_reset)
--
-- Tanpa penjaga ini, satu guru GURU_PRO yang menekan "Mulai Semester Baru" --
-- atau memanggil Edge Function semester-reset langsung -- kehilangan seluruh
-- data operasionalnya di tengah tahun ajaran, dua kali lebih sering daripada
-- yang ia beli. Penjaga di UI saja tidak cukup: Edge Function memakai
-- service_role dan tidak melihat DOM.
--
-- Badan fungsi disalin dari 20260821000011 (definisi terakhir yang berlaku --
-- assessment_rubric_results, assessment_kktp_results, dan
-- assessment_rubric_criteria sudah di-DROP di sana, jadi ketiganya tidak boleh
-- muncul lagi). Satu-satunya tambahan adalah blok penjaga tier, diletakkan
-- tepat setelah pemeriksaan role = GURU supaya profil non-GURU tetap ditolak
-- dengan pesan lamanya, bukan dengan pesan tentang tier.

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
  v_tier       text;
BEGIN
  IF p_teacher_id IS NULL THEN
    RAISE EXCEPTION 'p_teacher_id wajib diisi';
  END IF;

  -- Sasaran harus profil GURU. Tanpa penyaringan ini, satu id siswa atau ortu
  -- akan diterima diam-diam dan menghapus nol baris -- gagal tanpa suara,
  -- yang lebih buruk daripada gagal dengan jelas.
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = p_teacher_id AND role = 'GURU'
  ) THEN
    RAISE EXCEPTION 'Profil % bukan GURU atau tidak ditemukan', p_teacher_id;
  END IF;

  SELECT tier INTO v_tier FROM profiles WHERE id = p_teacher_id;

  IF v_tier = 'GURU_PRO' THEN
    RAISE EXCEPTION 'Reset semester hanya tersedia untuk GURU_GO';
  ELSIF v_tier = 'TRIAL' THEN
    RAISE EXCEPTION 'Reset semester tidak tersedia untuk TRIAL';
  ELSIF v_tier IS DISTINCT FROM 'GURU_GO' THEN
    -- Tier di luar tiga nilai yang dikenal seharusnya mustahil (ada CHECK di
    -- profiles), tapi menolak adalah satu-satunya kegagalan yang aman untuk
    -- operasi yang menghapus data.
    RAISE EXCEPTION 'Tier % tidak berhak melakukan reset semester', coalesce(v_tier, 'NULL');
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
