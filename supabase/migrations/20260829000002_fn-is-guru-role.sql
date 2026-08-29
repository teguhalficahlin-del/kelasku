-- Migration: fn_is_guru_role + policy guard GURU role
-- Dibuat: 29 Agustus 2026
-- Tujuan: mencegah SISWA/ORTU membuat ATP dan Modul Ajar

-- 1. Fungsi role check
CREATE OR REPLACE FUNCTION public.fn_is_guru_role()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (
      SELECT p.role = 'GURU'
      FROM public.profiles AS p
      WHERE p.id = public.fn_current_profile_id()
    ),
    false
  )
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_is_guru_role() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_is_guru_role() FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_is_guru_role() TO authenticated;

-- 2. Policy guard atp_induk INSERT
ALTER POLICY pol_atp_induk_insert ON public.atp_induk
  WITH CHECK (
    guru_id = public.fn_current_profile_id()
    AND public.fn_is_guru_role()
  );

-- 3. Policy guard atp_induk UPDATE USING
ALTER POLICY pol_atp_induk_update ON public.atp_induk
  USING (
    guru_id = public.fn_current_profile_id()
    AND public.fn_is_guru_role()
  )
  WITH CHECK (
    guru_id = public.fn_current_profile_id()
    AND public.fn_is_guru_role()
  );

-- 4. Policy guard modul_induk INSERT
ALTER POLICY pol_modul_induk_insert ON public.modul_induk
  WITH CHECK (
    guru_id = public.fn_current_profile_id()
    AND public.fn_is_guru_role()
  );

-- 5. Policy guard modul_induk UPDATE USING
ALTER POLICY pol_modul_induk_update ON public.modul_induk
  USING (
    guru_id = public.fn_current_profile_id()
    AND public.fn_is_guru_role()
  )
  WITH CHECK (
    guru_id = public.fn_current_profile_id()
    AND public.fn_is_guru_role()
  );
