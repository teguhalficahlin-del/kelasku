-- Migration: batasi fn_lookup_profile_name ke relasi kelas yang sah
--
-- Masalah (audit SEC — lookup profil lintas tenant):
-- fn_lookup_profile_name di-GRANT ke authenticated dan mengembalikan
-- full_name profil SIAPAPUN kepada SIAPAPUN yang punya UUID-nya.
-- Tidak ada pemeriksaan apakah pemanggil punya hubungan kelas dengan
-- profil yang ditanya.
--
-- Kenapa tidak cukup satu self-join classroom_members:
-- guru BUKAN anggota classroom_members (member_role hanya SISWA/ORTU).
-- Guru terhubung ke classroom lewat classrooms.teacher_id. Self-join
-- polos akan memutus justru pemanggil sah yang ada sekarang —
-- siswa/dashboard.js dan ortu/dashboard.js yang menanya nama guru.
--
-- Karena itu tiga cabang, satu per jalur relasi yang sah.

CREATE OR REPLACE FUNCTION fn_lookup_profile_name(p_profile_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.full_name
  FROM profiles p
  WHERE p.id = p_profile_id
    AND (
      -- (a) profil yang ditanya adalah GURU pemilik salah satu
      --     classroom yang diikuti pemanggil (siswa/ortu → guru)
      EXISTS (
        SELECT 1
        FROM classroom_members cm
        JOIN classrooms c ON c.id = cm.classroom_id
        WHERE cm.profile_id = fn_current_profile_id()
          AND c.teacher_id  = p_profile_id
      )
      -- (b) profil yang ditanya adalah SISWA di classroom
      --     yang sama dengan pemanggil — ORTU siswa lain
      --     tidak termasuk (member_role = SISWA saja)
      OR EXISTS (
        SELECT 1
        FROM classroom_members cm1
        JOIN classroom_members cm2 ON cm2.classroom_id = cm1.classroom_id
        WHERE cm1.profile_id    = fn_current_profile_id()
          AND cm2.profile_id    = p_profile_id
          AND cm2.member_role   = 'SISWA'
      )
      -- (c) pemanggil adalah GURU pemilik classroom yang
      --     diikuti profil yang ditanya (guru → siswa/ortu)
      OR EXISTS (
        SELECT 1
        FROM classroom_members cm
        JOIN classrooms c ON c.id = cm.classroom_id
        WHERE cm.profile_id = p_profile_id
          AND c.teacher_id  = fn_current_profile_id()
      )
    );
$$;

-- GRANT tidak diubah — CREATE OR REPLACE mempertahankan ACL yang ada,
-- authenticated tetap bisa memanggil. REVOKE dua lapis sudah dipasang
-- di 20260803000005 dan ikut terbawa.

-- ---------------------------------------------------------------------------
-- VERIFIKASI
-- ---------------------------------------------------------------------------

DO $$
DECLARE v_def text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO v_def
  FROM pg_proc
  WHERE proname = 'fn_lookup_profile_name';

  IF v_def NOT LIKE '%member_role%' THEN
    RAISE EXCEPTION
      'fn_lookup_profile_name tidak mengandung filter member_role — migration gagal';
  END IF;

  IF v_def NOT LIKE '%teacher_id%' THEN
    RAISE EXCEPTION
      'fn_lookup_profile_name tidak mengandung cabang teacher_id — migration gagal';
  END IF;
END;
$$;

-- Pastikan GRANT authenticated benar-benar masih ada setelah REPLACE.
DO $$
BEGIN
  IF NOT has_function_privilege(
       'authenticated',
       'fn_lookup_profile_name(uuid)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION
      'GRANT EXECUTE ke authenticated hilang pada fn_lookup_profile_name';
  END IF;
END;
$$;
