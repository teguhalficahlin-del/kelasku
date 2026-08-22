-- 20260823000012_sec002-drop-cm-self-insert-policies.sql
-- SEC-002: cabut policy yang mengizinkan pendaftaran-diri lintas tenant.
--
-- Kedua policy hanya mensyaratkan "barisnya tentang saya sendiri":
--
--   pol_cm_siswa_insert  WITH CHECK (profile_id = fn_current_profile_id()
--                                    AND member_role = 'SISWA')
--   pol_cm_ortu_insert   WITH CHECK (profile_id = fn_current_profile_id()
--                                    AND member_role = 'ORTU'
--                                    AND linked_student_id IS NOT NULL)
--
-- Tidak ada satu pun klausa yang menanyakan KELAS MANA. Akibatnya setiap
-- pengguna terautentikasi dapat menyisipkan dirinya ke classroom mana pun milik
-- guru mana pun:
--
--   sebagai SISWA -> fn_is_classroom_member() menjadi true untuk kelas itu,
--                    membuka jadwal, forum, nilai terbit, dan catatan yang
--                    bertanda terlihat-untuk-siswa;
--   sebagai ORTU  -> linked_student_id boleh diisi uuid siswa MANA PUN, karena
--                    CHECK di tabel hanya menuntut kolom itu tidak NULL. Satu
--                    baris cukup untuk menjadikan seseorang "orang tua" atas
--                    anak orang lain, lalu membaca nilai dan catatan anak itu.
--
-- trial_guard_insert yang RESTRICTIVE tidak menahannya. Badan fn_guru_is_active()
-- membuka jalan itu secara sadar -- 'p.role <> GURU OR ...' meloloskan siswa dan
-- ortu tanpa syarat, karena penjaga itu memang dirancang untuk masa trial guru,
-- bukan untuk isolasi tenant.
--
-- Yang dicabut, bukan diperketat. Seluruh penyisipan sah ke tabel ini dilakukan
-- Edge Function generate-akun lewat service_role, yang melewati RLS sepenuhnya
-- (generate-akun/index.ts:175 dan :249). Nol klien menulis ke classroom_members
-- -- portal siswa dan ortu hanya membaca. Kedua policy ini adalah permukaan
-- serang tanpa pengguna.
--
-- Kalau suatu saat siswa boleh bergabung sendiri lewat kode kelas, bentuk yang
-- benar adalah RPC SECURITY DEFINER yang memverifikasi kodenya lalu menyusun
-- barisnya sendiri -- bukan mengizinkan klien menulis langsung ke tabel dan
-- berharap WITH CHECK cukup lengkap.
--
-- Diperiksa sebelum apply: nol baris dengan teacher_id menyimpang dari pemilik
-- kelasnya, jadi celah ini belum pernah dipakai.
--
-- Idempoten: DROP POLICY IF EXISTS.

DROP POLICY IF EXISTS pol_cm_siswa_insert ON classroom_members;
DROP POLICY IF EXISTS pol_cm_ortu_insert  ON classroom_members;

-- Verifikasi di dalam transaksi migrasi: tidak boleh ada lagi policy INSERT
-- permisif untuk authenticated. trial_guard_insert dikecualikan -- ia RESTRICTIVE
-- dan tidak pernah bisa MEMBERI izin, hanya membatasi.
DO $$
DECLARE
  v_sisa int;
BEGIN
  SELECT count(*) INTO v_sisa
  FROM pg_policies
  WHERE tablename  = 'classroom_members'
    AND cmd        = 'INSERT'
    AND permissive = 'PERMISSIVE'
    AND roles @> ARRAY['authenticated']::name[];

  IF v_sisa > 0 THEN
    RAISE EXCEPTION 'Masih ada % policy INSERT permisif untuk authenticated di classroom_members', v_sisa;
  END IF;
END;
$$;
