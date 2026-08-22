-- 20260823000013_sec-lookup-classroom-code-drop-teacher-id.sql
-- Hentikan fn_lookup_classroom_code menyerahkan teacher_id kepada anon.
--
-- Fungsi ini SECURITY DEFINER dan di-GRANT ke anon -- memang disengaja, supaya
-- kode kelas bisa ditukar menjadi identitas kelas sebelum siapa pun login. Yang
-- tidak perlu ada di sana adalah teacher_id: itu identitas internal guru, dan
-- tidak dibutuhkan untuk mengenali sebuah kelas.
--
-- Bahayanya baru terlihat bila dirangkai. Kode kelas hanya delapan karakter
-- heksadesimal (init-schema.sql:42) dan memang dibagikan luas lewat tautan dan
-- QR. Satu kode yang bocor, dipakai anon tanpa kredensial apa pun, sebelumnya
-- menghasilkan classroom_id BESERTA teacher_id asli -- persis dua nilai yang
-- dibutuhkan untuk menyusun baris palsu di classroom_members lewat celah
-- SEC-002. Celah itu ditutup 20260823000012; migrasi ini mencabut langkah
-- pengintaiannya.
--
-- CATATAN TEKNIS -- kenapa DROP, bukan CREATE OR REPLACE:
--
-- Menghapus satu kolom dari RETURNS TABLE mengubah tipe kembalian fungsi, dan
-- PostgreSQL menolak CREATE OR REPLACE yang melakukannya ('cannot change return
-- type of existing function'). Satu-satunya jalan adalah DROP lalu CREATE.
--
-- DROP juga menghanguskan seluruh ACL, jadi GRANT harus dipasang ulang di bawah.
-- Tanpa itu fungsinya tetap ada tetapi tidak terpanggil oleh siapa pun. Nilai
-- yang dipasang ulang persis sama dengan sebelumnya:
--   {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres,anon=X/postgres}
--
-- Diperiksa sebelum apply: nol pemanggil di seluruh JS, TS, dan HTML. Riwayat
-- git menunjukkan portal siswa dan ortu pernah memakainya (f8fb30f), tetapi alur
-- login sekarang menempuh ADR-003 lewat fn_validate_roster_login dan
-- fn_validate_ortu_login. Jadi tidak ada klien yang kehilangan kolom ini.
--
-- Idempoten: DROP ... IF EXISTS diikuti CREATE.

DROP FUNCTION IF EXISTS fn_lookup_classroom_code(text);

CREATE FUNCTION fn_lookup_classroom_code(p_code text)
RETURNS TABLE (
  id             uuid,
  name           text,
  classroom_code text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT id, name, classroom_code
  FROM classrooms
  WHERE classroom_code = upper(p_code)
    AND is_archived = false
  LIMIT 1;
$function$;

-- ACL dipasang ulang persis seperti sebelum DROP. anon memang berhak: itulah
-- alasan fungsi ini ada -- menukar kode kelas menjadi identitas kelas tanpa login.
REVOKE EXECUTE ON FUNCTION fn_lookup_classroom_code(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION fn_lookup_classroom_code(text) TO anon;
GRANT  EXECUTE ON FUNCTION fn_lookup_classroom_code(text) TO authenticated;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'fn_lookup_classroom_code'
      AND pg_get_function_result(p.oid) ILIKE '%teacher_id%'
  ) THEN
    RAISE EXCEPTION 'fn_lookup_classroom_code masih mengembalikan teacher_id';
  END IF;

  IF NOT has_function_privilege('anon', 'fn_lookup_classroom_code(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon kehilangan EXECUTE atas fn_lookup_classroom_code -- lookup kode kelas tanpa login akan rusak';
  END IF;
END;
$$;
