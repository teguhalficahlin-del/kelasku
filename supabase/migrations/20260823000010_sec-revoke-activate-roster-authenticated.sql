-- 20260823000010_sec-revoke-activate-roster-authenticated.sql
-- Cabut akses authenticated dari fn_activate_roster.
--
-- Fungsi ini SECURITY DEFINER dan menulis:
--
--   UPDATE classroom_roster SET profile_id = p_profile_id
--    WHERE id = p_roster_id AND profile_id IS NULL;
--
-- Tidak ada pemeriksaan bahwa pemanggil berhak atas baris roster itu, dan
-- tidak ada pemeriksaan bahwa p_profile_id adalah pemanggilnya sendiri. Karena
-- SECURITY DEFINER melewati RLS, GRANT ke authenticated berarti setiap
-- pengguna yang sudah masuk -- termasuk siswa dan ortu -- dapat mengikat profil
-- sembarang ke baris roster mana pun, di kelas guru mana pun. Lintas tenant,
-- lewat satu panggilan PostgREST.
--
-- Guard 'profile_id IS NULL' menahan pembajakan siswa yang sudah aktif, dan
-- policy baca roster masih menuntut dua syarat sekaligus (profile_id ==
-- pemanggil DAN keanggotaan kelas), sehingga mengklaim satu baris belum
-- memberi akses baca. Yang tersisa tetap serius: slot siswa yang sah menjadi
-- tidak bisa diaktifkan selamanya, tanpa gurunya punya cara melihat kenapa.
--
-- Perbaikannya bukan menambah pemeriksaan di dalam fungsi, melainkan mencabut
-- hak yang memang tidak pernah dibutuhkan. Satu-satunya pemanggilnya adalah
-- Edge Function generate-akun (supabase/functions/generate-akun/index.ts:161)
-- lewat klien service_role, dan service_role sudah punya EXECUTE tersendiri:
--
--   {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
--
-- Pola yang sama sudah dipakai fn_semester_reset dan fn_tahun_ajaran_reset:
-- fungsi yang menerima identitas sebagai argumen hanya boleh dipanggil
-- service_role, tidak pernah dari browser.
--
-- Idempoten: REVOKE atas hak yang sudah tidak ada bukan error.

REVOKE EXECUTE ON FUNCTION fn_activate_roster(uuid, uuid) FROM authenticated;

-- Diikutkan juga sebagai jaring pengaman; keduanya sudah bersih hari ini.
REVOKE EXECUTE ON FUNCTION fn_activate_roster(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fn_activate_roster(uuid, uuid) FROM anon;

-- Verifikasi ikut di dalam transaksi migrasi: kalau haknya masih menempel,
-- migrasi ini harus gagal dan membatalkan diri, bukan lolos diam-diam.
DO $$
BEGIN
  IF has_function_privilege('authenticated', 'fn_activate_roster(uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'fn_activate_roster masih dapat dieksekusi authenticated -- REVOKE tidak berlaku';
  END IF;

  IF NOT has_function_privilege('service_role', 'fn_activate_roster(uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role kehilangan EXECUTE atas fn_activate_roster -- generate-akun akan rusak';
  END IF;
END;
$$;
