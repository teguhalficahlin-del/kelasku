-- 20260823000011_sec-search-path-security-definer.sql
-- Pasang SET search_path = public pada delapan fungsi SECURITY DEFINER yang
-- belum memilikinya.
--
-- Fungsi SECURITY DEFINER berjalan dengan hak pemiliknya. Tanpa search_path
-- yang dipaku, nama tabel dan fungsi tak berkualifikasi di dalamnya
-- diselesaikan memakai search_path PEMANGGIL. Siapa pun yang bisa membuat
-- skema lalu menaruh objek bernama sama di sana dapat membelokkan badan fungsi
-- ke objek miliknya sendiri, yang lalu dieksekusi dengan hak pemilik fungsi.
--
-- Di Supabase, role authenticated normalnya tidak bisa CREATE SCHEMA, jadi ini
-- pengerasan -- bukan lubang yang dapat dieksploitasi hari ini. Tetapi tiga
-- dari delapan fungsi ini adalah fondasi SELURUH RLS aplikasi:
--
--   fn_current_profile_id   -- dipakai hampir setiap policy
--   fn_is_classroom_owner   -- gerbang tulis guru
--   fn_is_classroom_member  -- gerbang baca siswa/ortu
--
-- Kalau ketiganya bisa dibelokkan, seluruh isolasi tenant ikut runtuh. Justru
-- di sinilah pengerasan yang "belum bisa dieksploitasi" paling layak dipasang,
-- sebelum satu perubahan hak di kemudian hari membuatnya bisa.
--
-- CATATAN TEKNIS:
--
--   1. Badan dan signature disalin apa adanya dari pg_get_functiondef() di
--      database live -- BUKAN dari migrasi lama, yang beberapa di antaranya
--      sudah usang. Satu-satunya yang ditambahkan adalah baris SET search_path.
--      Tidak ada logika, tipe kembalian, maupun nama parameter yang berubah.
--
--   2. CREATE OR REPLACE mempertahankan ACL yang sudah ada, jadi seluruh
--      GRANT/REVOKE tetap berlaku -- termasuk REVOKE atas fn_activate_roster
--      yang baru dipasang 20260823000010. Blok verifikasi di bawah memastikan
--      itu benar-benar terjadi.
--
--   3. auth.uid() di fn_current_profile_id sudah berkualifikasi skema, jadi
--      tetap terselesaikan meski search_path dipersempit ke public.
--
-- Idempoten: seluruhnya CREATE OR REPLACE.

CREATE OR REPLACE FUNCTION public.fn_activate_roster(p_roster_id uuid, p_profile_id uuid)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path = public
AS $function$
  UPDATE classroom_roster
  SET profile_id = p_profile_id
  WHERE id = p_roster_id
    AND profile_id IS NULL;
$function$;

CREATE OR REPLACE FUNCTION public.fn_current_profile_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path = public
AS $function$
  SELECT id FROM profiles WHERE user_id = auth.uid()
$function$;

CREATE OR REPLACE FUNCTION public.fn_is_classroom_member(p_classroom_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path = public
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM classroom_members
    WHERE classroom_id = p_classroom_id
      AND profile_id = fn_current_profile_id()
  )
$function$;

CREATE OR REPLACE FUNCTION public.fn_is_classroom_owner(p_classroom_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path = public
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM classrooms
    WHERE id = p_classroom_id
      AND teacher_id = fn_current_profile_id()
  )
$function$;

CREATE OR REPLACE FUNCTION public.fn_lookup_classroom_code(p_code text)
 RETURNS TABLE(id uuid, name text, classroom_code text, teacher_id uuid)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path = public
AS $function$
  SELECT id, name, classroom_code, teacher_id
  FROM classrooms
  WHERE classroom_code = upper(p_code)
    AND is_archived = false
  LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.fn_lookup_profile_name(p_profile_id uuid)
 RETURNS text
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path = public
AS $function$
  SELECT full_name
  FROM profiles
  WHERE id = p_profile_id
  LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.fn_lookup_roster_by_name_nis(p_classroom_id uuid, p_full_name text, p_nis text)
 RETURNS TABLE(id uuid, full_name text, nis text, profile_id uuid)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path = public
AS $function$
  SELECT id, full_name, nis, profile_id
  FROM classroom_roster
  WHERE classroom_id = p_classroom_id
    AND lower(full_name) = lower(p_full_name)
    AND nis = p_nis
  LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.fn_lookup_roster_by_nis(p_classroom_id uuid, p_nis text)
 RETURNS TABLE(id uuid, full_name text, nis text, profile_id uuid)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path = public
AS $function$
  SELECT id, full_name, nis, profile_id
  FROM classroom_roster
  WHERE classroom_id = p_classroom_id
    AND nis = p_nis
  LIMIT 1;
$function$;

-- Verifikasi di dalam transaksi: nol fungsi SECURITY DEFINER yang terjangkau
-- authenticated/anon boleh tersisa tanpa search_path, dan REVOKE dari migrasi
-- sebelumnya harus tetap utuh setelah kedelapan CREATE OR REPLACE di atas.
DO $$
DECLARE
  v_sisa int;
BEGIN
  SELECT count(*) INTO v_sisa
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prosecdef
    AND (p.proconfig IS NULL OR NOT EXISTS (
          SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%'))
    AND (has_function_privilege('authenticated', p.oid, 'EXECUTE')
         OR has_function_privilege('anon', p.oid, 'EXECUTE'));

  IF v_sisa > 0 THEN
    RAISE EXCEPTION 'Masih ada % fungsi SECURITY DEFINER tanpa search_path yang terjangkau authenticated/anon', v_sisa;
  END IF;

  IF has_function_privilege('authenticated', 'fn_activate_roster(uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'CREATE OR REPLACE mengembalikan hak authenticated atas fn_activate_roster';
  END IF;
END;
$$;
