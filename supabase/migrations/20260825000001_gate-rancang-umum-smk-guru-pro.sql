-- 20260825000001_gate-rancang-umum-smk-guru-pro.sql
-- Gate Tab Rancang Pembelajaran di lapisan database.
--
-- Sampai migrasi ini, Tab Rancang hanya dijaga di klien
-- (classroom-rancang.js:6137, cek tier saja). Siapa pun yang memegang JWT guru
-- aktif bisa melewati klien dan menulis langsung ke tabel rancang_*. Penjaga
-- yang sudah ada di ketiga tabel itu, trial_guard_* dari 20260823000002, hanya
-- menanyakan fn_guru_is_active() -- yaitu "akunnya masih berlaku?", bukan
-- "berhak memakai Rancang?". TRIAL yang masih di dalam 30 hari lolos penuh.
--
-- Aturan baru: Rancang butuh role_guru = 'GURU_MAPEL_UMUM_SMK' DAN
-- tier = 'GURU_PRO'. Ditulis sebagai allowlist supaya role atau tier baru apa
-- pun tertutup secara default, bukan terbuka -- sejalan dengan alasan yang
-- sudah ditulis di classroom-rancang.js:6135.
--
-- CAKUPAN: TIGA TABEL SAJA.
--   rancang_settings, rancang_dokumen, rancang_profil ditulis langsung oleh
--   klien sebagai role `authenticated`, jadi RLS memang jalur penjaganya.
--
--   rancang_planning_contexts dan seluruh tabel Phase2B (rancang_artifacts,
--   rancang_artifact_versions, dst.) SENGAJA TIDAK DISENTUH. Di sana
--   `authenticated` sudah kehilangan privilege tulis di level tabel
--   (20260818000003 baris 222, 20260818000005 baris 177) dan penulis
--   sebenarnya adalah `service_role`, yang bypass RLS. Policy RESTRICTIVE di
--   dua tabel itu tidak akan pernah dievaluasi -- ia hanya akan terlihat
--   seperti proteksi tanpa menjadi proteksi. Penjagaannya ada di Edge
--   Function, di commit yang sama dengan migrasi ini.
--
-- KENAPA POLICY BARU, BUKAN MENYUNTING trial_guard_*.
-- trial_guard_* menjawab pertanyaan yang berbeda dan berlaku untuk 19 tabel,
-- termasuk tabel yang ditulis siswa dan ortu. Menempelkan syarat Rancang ke
-- dalamnya akan mengunci non-guru dari tabelnya sendiri. Policy RESTRICTIVE
-- di-AND-kan satu sama lain, jadi menambah policy kedua sudah cukup: sebuah
-- tulisan ke rancang_* kini harus lolos trial_guard_* DAN rancang_eligible_*.
--
-- IDEMPOTEN: fungsi memakai OR REPLACE, policy di-DROP IF EXISTS sebelum
-- dibuat ulang. Tidak ada DML terhadap data existing di tabel rancang_*.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. fn_guru_rancang_eligible()
-- ---------------------------------------------------------------------------
-- Bentuknya meniru fn_guru_is_active() (20260823000002 baris 57): SQL, STABLE,
-- SECURITY DEFINER, search_path terkunci.
--
-- SECURITY DEFINER wajib di sini, bukan pilihan gaya. Fungsi ini membaca
-- profiles.role_guru dan profiles.tier milik si pemanggil, sementara ia sendiri
-- dipanggil dari dalam policy RLS di tabel lain. Tanpa DEFINER, pembacaan itu
-- tunduk pada RLS profiles milik pemanggil, sehingga hasilnya bergantung pada
-- policy yang kebetulan terpasang di profiles -- persis pola "EXISTS mentah"
-- yang dilarang AGENT_WORKING_RULES.md #5.
--
-- COALESCE(..., false) menutup pemanggil tanpa baris profiles: tidak ada profil
-- berarti tidak berhak. Arah default ini aman -- gagal menemukan profil tidak
-- pernah membuka pintu.
--
-- Lookup lewat fn_current_profile_id(), bukan auth.uid() langsung, sesuai
-- CLAUDE.md #11.
CREATE OR REPLACE FUNCTION public.fn_guru_rancang_eligible()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT p.role_guru = 'GURU_MAPEL_UMUM_SMK'
        AND p.tier      = 'GURU_PRO'
     FROM profiles p
     WHERE p.id = fn_current_profile_id()),
    false)
$function$;

GRANT  EXECUTE ON FUNCTION public.fn_guru_rancang_eligible() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_guru_rancang_eligible() FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_guru_rancang_eligible() FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- 2. Policy RESTRICTIVE pada tiga tabel tulis Rancang
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_tabel text;
  v_daftar text[] := ARRAY[
    'rancang_dokumen',
    'rancang_profil',
    'rancang_settings'
  ];
BEGIN
  FOREACH v_tabel IN ARRAY v_daftar LOOP
    EXECUTE format('DROP POLICY IF EXISTS rancang_eligible_insert ON public.%I', v_tabel);
    EXECUTE format('DROP POLICY IF EXISTS rancang_eligible_update ON public.%I', v_tabel);
    EXECUTE format('DROP POLICY IF EXISTS rancang_eligible_delete ON public.%I', v_tabel);

    EXECUTE format(
      'CREATE POLICY rancang_eligible_insert ON public.%I AS RESTRICTIVE
         FOR INSERT TO authenticated
         WITH CHECK (fn_guru_rancang_eligible())', v_tabel);

    EXECUTE format(
      'CREATE POLICY rancang_eligible_update ON public.%I AS RESTRICTIVE
         FOR UPDATE TO authenticated
         USING (fn_guru_rancang_eligible())
         WITH CHECK (fn_guru_rancang_eligible())', v_tabel);

    EXECUTE format(
      'CREATE POLICY rancang_eligible_delete ON public.%I AS RESTRICTIVE
         FOR DELETE TO authenticated
         USING (fn_guru_rancang_eligible())', v_tabel);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Verifikasi -- gagal berarti seluruh transaksi dibatalkan
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_n int;
BEGIN
  -- 3a. Fungsi terpasang dengan sifat yang benar.
  SELECT count(*) INTO v_n
  FROM pg_proc
  WHERE proname      = 'fn_guru_rancang_eligible'
    AND pronamespace = 'public'::regnamespace
    AND prosecdef                      -- SECURITY DEFINER
    AND provolatile = 's';             -- STABLE
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'fn_guru_rancang_eligible tidak terpasang sebagai STABLE SECURITY DEFINER -- ROLLBACK';
  END IF;

  -- 3b. Privilege eksekusi persis seperti yang diminta.
  IF NOT has_function_privilege('authenticated', 'public.fn_guru_rancang_eligible()', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated tidak dapat memanggil fn_guru_rancang_eligible -- ROLLBACK';
  END IF;
  IF has_function_privilege('anon', 'public.fn_guru_rancang_eligible()', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon masih dapat memanggil fn_guru_rancang_eligible -- ROLLBACK';
  END IF;

  -- 3c. Sembilan policy baru terpasang (3 tabel x 3 perintah tulis).
  SELECT count(*) INTO v_n
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('rancang_dokumen','rancang_profil','rancang_settings')
    AND policyname LIKE 'rancang_eligible_%';
  IF v_n <> 9 THEN
    RAISE EXCEPTION 'Jumlah policy rancang_eligible harus 9, ditemukan % -- ROLLBACK', v_n;
  END IF;

  -- 3d. Semuanya RESTRICTIVE dan hanya menyentuh perintah tulis. Policy
  --     PERMISSIVE akan justru MELONGGARKAN akses, dan cmd = 'ALL' akan ikut
  --     mencekik jalur baca -- keduanya kebalikan dari maksud migrasi ini.
  SELECT count(*) INTO v_n
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('rancang_dokumen','rancang_profil','rancang_settings')
    AND policyname LIKE 'rancang_eligible_%'
    AND (permissive <> 'RESTRICTIVE' OR cmd NOT IN ('INSERT','UPDATE','DELETE'));
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Ada % policy rancang_eligible yang tidak RESTRICTIVE atau menyentuh perintah baca -- ROLLBACK', v_n;
  END IF;

  -- 3e. trial_guard_* tidak tersentuh -- 57 policy dari 20260823000002 harus
  --     masih utuh. Migrasi ini menambah lapisan, bukan menggantikannya.
  SELECT count(*) INTO v_n
  FROM pg_policies
  WHERE schemaname = 'public'
    AND policyname LIKE 'trial_guard_%';
  IF v_n <> 57 THEN
    RAISE EXCEPTION 'Policy trial_guard_* berubah jumlahnya menjadi % (harus 57) -- ROLLBACK', v_n;
  END IF;
END $$;

COMMIT;

-- ---------------------------------------------------------------------------
-- CATATAN PASCA-MIGRASI
-- ---------------------------------------------------------------------------
-- 1. Data existing di rancang_* tidak disentuh sama sekali. Guru yang kehilangan
--    hak tulis tetap bisa MEMBACA perangkat ajar yang sudah ia buat -- policy
--    SELECT tidak diubah, dan tidak ada satu pun DELETE di migrasi ini.
--
-- 2. Menurut 20260822000001, sebaran role_guru saat migrasi itu ditulis adalah
--    GURU_MAPEL_UMUM_SMK 15, WALI_KELAS(_SD) 1, NULL 31. Jadi gate ini
--    menyempit pada dimensi tier, bukan role: mayoritas guru ber-role_guru
--    memang sudah GURU_MAPEL_UMUM_SMK.
--
-- 3. Ketujuh Edge Function pipeline Rancang masih memakai ejaan lama
--    'WALI_KELAS' di LOCKED_ROLES, sementara constraint DB sejak 20260822000001
--    hanya menerima 'WALI_KELAS_SD'. Itu cacat yang sudah ada sebelum migrasi
--    ini dan sengaja tidak diperbaiki di sini -- set LOCKED_ROLES disiapkan
--    untuk Rancang V2. Dampaknya nol terhadap gate ini, karena wali kelas
--    ditolak oleh syarat role_guru = 'GURU_MAPEL_UMUM_SMK' dengan atau tanpa
--    cacat ejaan tersebut.
