-- 20260823000018_item-c-fn-hard-delete-guru.sql
-- Item C — hard delete guru TRIAL yang melewati H+8.
--
-- KENAPA FUNGSI DATABASE, BUKAN RANGKAIAN PERINTAH DI EDGE FUNCTION.
-- docs/TIER-AND-LIFECYCLE.md §9 menutup pilihan itu dengan tegas: "Bungkus
-- seluruh STEP 1-6 dalam satu transaksi." Edge Function memakai supabase-js,
-- yang mengirim setiap DELETE sebagai permintaan HTTP tersendiri — setiap
-- statement menjadi transaksinya sendiri, dan kegagalan di langkah belakang
-- meninggalkan guru terhapus separuh. Itu persis pola yang merusak
-- semester-reset dan yang diperbaiki dengan memindahkannya ke fn_semester_reset.
--
-- SIFAT PENGAMAN UTAMA: karena semuanya satu transaksi, tabel pemblokir yang
-- TERLEWAT tidak merusak apa pun. DELETE FROM profiles di STEP 6 akan gagal
-- dengan pelanggaran FK, seluruh transaksi dibatalkan, dan gurunya tetap utuh.
-- Kegagalan di sini selalu berbentuk "tidak terjadi apa-apa", bukan "terhapus
-- separuh" — dan itulah yang membuatnya layak berjalan tanpa pengawasan.
--
-- CAKUPAN: TRIAL SAJA. Guru GURU_GO dan GURU_PRO juga punya expires_at, tetapi
-- akun yang pernah membayar tidak boleh kehilangan datanya permanen hanya
-- karena perpanjangan terlambat delapan hari. Keputusan produk, dikonfirmasi
-- sebelum fungsi ini ditulis.
--
-- DRY RUN ADALAH DEFAULT. Pemanggil yang lupa menyebutkannya mendapat laporan,
-- bukan kehilangan data. Ke-25 guru TRIAL di proyek ini habis masa berlakunya
-- serentak 18 September 2026, jadi eksekusi nyata pertama akan menyentuh
-- puluhan akun sekaligus; ia harus diperiksa dulu dalam bentuk daftar.

CREATE OR REPLACE FUNCTION fn_hard_delete_guru(
  p_teacher_id uuid,
  p_dry_run    boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_profil     RECORD;
  v_classrooms uuid[];
  v_korban     uuid[];
  v_pc         uuid[];
  v_atp        uuid[];
  v_artefak    uuid[];
  v_alokasi    uuid[];
  v_hasil      jsonb := '{}'::jsonb;
  v_n          bigint;
BEGIN
  IF p_teacher_id IS NULL THEN
    RAISE EXCEPTION 'p_teacher_id wajib diisi';
  END IF;

  -- Kelayakan diperiksa DI DALAM fungsi, bukan dipercaya dari pemanggil:
  -- daftar kandidat yang disusun beberapa detik lebih awal bisa sudah basi.
  SELECT id, role, tier, expires_at, full_name, email
    INTO v_profil FROM profiles WHERE id = p_teacher_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profil % tidak ditemukan', p_teacher_id;
  END IF;
  IF v_profil.role <> 'GURU' THEN
    RAISE EXCEPTION 'Profil % bukan GURU (role=%)', p_teacher_id, v_profil.role;
  END IF;
  IF v_profil.tier IS DISTINCT FROM 'TRIAL' THEN
    RAISE EXCEPTION 'Hard delete hanya untuk tier TRIAL, profil % bertier %',
      p_teacher_id, coalesce(v_profil.tier, 'NULL');
  END IF;
  IF v_profil.expires_at IS NULL OR v_profil.expires_at >= now() - interval '8 days' THEN
    RAISE EXCEPTION 'Profil % belum melewati H+8 (expires_at=%)',
      p_teacher_id, coalesce(v_profil.expires_at::text, 'NULL');
  END IF;

  SELECT coalesce(array_agg(id), ARRAY[]::uuid[]) INTO v_classrooms
    FROM classrooms WHERE teacher_id = p_teacher_id;

  -- STEP 1 — tandai siswa/ortu yang ikut dihapus. Hanya yang TIDAK punya
  -- keanggotaan di kelas guru lain yang masih aktif: satu siswa bisa terdaftar
  -- pada beberapa guru, dan menghapus akunnya karena satu gurunya kedaluwarsa
  -- akan memutus aksesnya ke guru lain yang masih membayar.
  SELECT coalesce(array_agg(DISTINCT cm.profile_id), ARRAY[]::uuid[])
    INTO v_korban
    FROM classroom_members cm
   WHERE cm.classroom_id = ANY(v_classrooms)
     AND cm.member_role IN ('SISWA', 'ORTU')
     AND NOT EXISTS (
           SELECT 1 FROM classroom_members lain
             JOIN classrooms c ON c.id = lain.classroom_id
             JOIN profiles   g ON g.id = c.teacher_id
            WHERE lain.profile_id = cm.profile_id
              AND c.teacher_id   <> p_teacher_id
              AND g.is_active     = true
              AND g.expires_at    > now());

  IF p_dry_run THEN
    RETURN jsonb_build_object(
      'dry_run',    true,
      'teacher_id', p_teacher_id,
      'nama',       v_profil.full_name,
      'email',      v_profil.email,
      'expires_at', v_profil.expires_at,
      'hari_lewat', floor(EXTRACT(EPOCH FROM (now() - v_profil.expires_at)) / 86400)::int,
      'classrooms', coalesce(array_length(v_classrooms, 1), 0),
      'akan_dihapus', jsonb_build_object(
        'profil_siswa_ortu', coalesce(array_length(v_korban, 1), 0),
        'attendance',        (SELECT count(*) FROM attendance        WHERE classroom_id = ANY(v_classrooms)),
        'student_notes',     (SELECT count(*) FROM student_notes     WHERE classroom_id = ANY(v_classrooms)),
        'guidance_sessions', (SELECT count(*) FROM guidance_sessions WHERE classroom_id = ANY(v_classrooms)),
        'parent_messages',   (SELECT count(*) FROM parent_messages   WHERE classroom_id = ANY(v_classrooms)),
        'classroom_roster',  (SELECT count(*) FROM classroom_roster  WHERE classroom_id = ANY(v_classrooms))));
  END IF;

  -- STEP 2 — rancang_* dan classroom_jp_policies (FK RESTRICT, memblokir).
  -- Himpunan induk dikumpulkan sebelum ada yang terhapus.
  SELECT coalesce(array_agg(id), ARRAY[]::uuid[]) INTO v_pc
    FROM rancang_planning_contexts WHERE profile_id = p_teacher_id;
  SELECT coalesce(array_agg(id), ARRAY[]::uuid[]) INTO v_atp
    FROM rancang_atp WHERE profile_id = p_teacher_id;
  SELECT coalesce(array_agg(id), ARRAY[]::uuid[]) INTO v_artefak
    FROM rancang_artifacts WHERE profile_id = p_teacher_id OR planning_context_id = ANY(v_pc);
  SELECT coalesce(array_agg(id), ARRAY[]::uuid[]) INTO v_alokasi
    FROM rancang_meeting_allocations
   WHERE confirmed_by_profile_id = p_teacher_id OR planning_context_id = ANY(v_pc);

  DELETE FROM rancang_artifact_events
   WHERE profile_id = p_teacher_id OR artifact_id = ANY(v_artefak);
  DELETE FROM rancang_artifact_selections
   WHERE selected_by = p_teacher_id OR artifact_id = ANY(v_artefak);
  DELETE FROM rancang_pipeline_state
   WHERE profile_id = p_teacher_id OR planning_context_id = ANY(v_pc);
  DELETE FROM rancang_artifact_versions
   WHERE profile_id = p_teacher_id OR created_by = p_teacher_id
      OR artifact_id = ANY(v_artefak) OR planning_context_id = ANY(v_pc);
  DELETE FROM rancang_artifacts                WHERE id = ANY(v_artefak);
  DELETE FROM rancang_meeting_allocation_items WHERE meeting_allocation_id = ANY(v_alokasi);
  DELETE FROM rancang_meeting_allocations      WHERE id = ANY(v_alokasi);
  DELETE FROM rancang_tp_revisions
   WHERE created_by = p_teacher_id
      OR tp_id IN (SELECT id FROM rancang_tp WHERE atp_id = ANY(v_atp));
  DELETE FROM rancang_atp_revisions       WHERE created_by = p_teacher_id OR atp_id = ANY(v_atp);
  DELETE FROM rancang_legacy_atp_mappings WHERE adopted_by = p_teacher_id OR atp_id = ANY(v_atp);
  DELETE FROM rancang_tp                  WHERE atp_id = ANY(v_atp);
  DELETE FROM rancang_atp                 WHERE id = ANY(v_atp);
  DELETE FROM rancang_planning_contexts   WHERE id = ANY(v_pc) OR classroom_id = ANY(v_classrooms);
  DELETE FROM classroom_jp_policies
   WHERE profile_id = p_teacher_id OR confirmed_by_profile_id = p_teacher_id
      OR classroom_id = ANY(v_classrooms);

  -- STEP 3 — parent_messages (teacher_id NO ACTION, memblokir)
  DELETE FROM parent_messages WHERE classroom_id = ANY(v_classrooms) OR teacher_id = p_teacher_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_hasil := v_hasil || jsonb_build_object('parent_messages', v_n);

  -- STEP 4 — seluruh data kelas. forum_comments sebelum forum_posts:
  -- forum_comments.classroom_id NO ACTION memblokir penghapusan classrooms.
  DELETE FROM attendance         WHERE classroom_id = ANY(v_classrooms);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_hasil := v_hasil || jsonb_build_object('attendance', v_n);
  DELETE FROM assessment_results WHERE classroom_id = ANY(v_classrooms);
  DELETE FROM grade_recap        WHERE classroom_id = ANY(v_classrooms);
  DELETE FROM assessments        WHERE classroom_id = ANY(v_classrooms);
  DELETE FROM tp_kktp            WHERE classroom_id = ANY(v_classrooms);
  DELETE FROM schedules          WHERE classroom_id = ANY(v_classrooms);
  DELETE FROM student_notes      WHERE classroom_id = ANY(v_classrooms);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_hasil := v_hasil || jsonb_build_object('student_notes', v_n);
  DELETE FROM guidance_sessions  WHERE classroom_id = ANY(v_classrooms);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_hasil := v_hasil || jsonb_build_object('guidance_sessions', v_n);
  DELETE FROM student_groups     WHERE classroom_id = ANY(v_classrooms);
  DELETE FROM forum_comments     WHERE classroom_id = ANY(v_classrooms);
  DELETE FROM forum_posts        WHERE classroom_id = ANY(v_classrooms);
  DELETE FROM rancang_dokumen    WHERE classroom_id = ANY(v_classrooms);
  DELETE FROM rancang_settings   WHERE classroom_id = ANY(v_classrooms);
  DELETE FROM teaching_context_classrooms WHERE classroom_id = ANY(v_classrooms);
  DELETE FROM wali_home_classrooms WHERE classroom_id = ANY(v_classrooms) OR profile_id = p_teacher_id;
  DELETE FROM classroom_members  WHERE classroom_id = ANY(v_classrooms);
  DELETE FROM classroom_roster   WHERE classroom_id = ANY(v_classrooms);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_hasil := v_hasil || jsonb_build_object('classroom_roster', v_n);
  DELETE FROM teaching_contexts          WHERE profile_id = p_teacher_id;
  DELETE FROM authorized_teaching_scopes WHERE profile_id = p_teacher_id;
  DELETE FROM classrooms         WHERE id = ANY(v_classrooms);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_hasil := v_hasil || jsonb_build_object('classrooms', v_n);

  -- STEP 5 — profil siswa/ortu yang ditandai. profiles.user_id -> auth.users
  -- ON DELETE CASCADE, jadi baris auth ikut terhapus.
  IF array_length(v_korban, 1) IS NOT NULL THEN
    DELETE FROM profiles WHERE id = ANY(v_korban);
    GET DIAGNOSTICS v_n = ROW_COUNT;
  ELSE
    v_n := 0;
  END IF;
  v_hasil := v_hasil || jsonb_build_object('profil_siswa_ortu', v_n);

  -- STEP 6 — profil guru. Kalau ada pemblokir yang terlewat, baris inilah yang
  -- gagal, dan seluruh transaksi dibatalkan bersamanya.
  DELETE FROM profiles WHERE id = p_teacher_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'Profil guru % tidak terhapus (baris=%) — membatalkan', p_teacher_id, v_n;
  END IF;

  RETURN jsonb_build_object(
    'dry_run',    false,
    'teacher_id', p_teacher_id,
    'nama',       v_profil.full_name,
    'email',      v_profil.email,
    'classrooms', coalesce(array_length(v_classrooms, 1), 0),
    'dihapus',    v_hasil);
END;
$fn$;

-- Hanya service_role. Fungsi ini SECURITY DEFINER dan menerima teacher_id
-- sebagai argumen: akses dari browser berarti siapa pun bisa menghapus akun
-- guru mana pun. Pola sama dengan fn_semester_reset dan fn_tahun_ajaran_reset.
REVOKE ALL ON FUNCTION fn_hard_delete_guru(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION fn_hard_delete_guru(uuid, boolean) FROM anon;
REVOKE ALL ON FUNCTION fn_hard_delete_guru(uuid, boolean) FROM authenticated;
GRANT EXECUTE ON FUNCTION fn_hard_delete_guru(uuid, boolean) TO service_role;

-- Daftar kandidat, dipakai penjadwal untuk tahu siapa yang perlu diproses.
CREATE OR REPLACE FUNCTION fn_list_guru_hard_delete()
RETURNS TABLE (
  teacher_id uuid,
  full_name  text,
  email      text,
  expires_at timestamptz,
  hari_lewat int
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT p.id, p.full_name, p.email, p.expires_at,
         floor(EXTRACT(EPOCH FROM (now() - p.expires_at)) / 86400)::int
  FROM profiles p
  WHERE p.role = 'GURU'
    AND p.tier = 'TRIAL'
    AND p.expires_at IS NOT NULL
    AND p.expires_at < now() - interval '8 days'
  ORDER BY p.expires_at;
$fn$;

REVOKE ALL ON FUNCTION fn_list_guru_hard_delete() FROM PUBLIC;
REVOKE ALL ON FUNCTION fn_list_guru_hard_delete() FROM anon;
REVOKE ALL ON FUNCTION fn_list_guru_hard_delete() FROM authenticated;
GRANT EXECUTE ON FUNCTION fn_list_guru_hard_delete() TO service_role;
