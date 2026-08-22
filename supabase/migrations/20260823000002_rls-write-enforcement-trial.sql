-- 20260823000002_rls-write-enforcement-trial.sql
-- Migration B dari docs/TIER-AND-LIFECYCLE.md §6 — enforcement tulis saat masa
-- berlaku habis.
--
-- Migration A menetapkan expires_at untuk setiap guru, tetapi nilai itu belum
-- menahan apa pun: RLS tidak pernah membacanya, sehingga guru yang masa
-- berlakunya lewat masih dapat menulis dengan memukul PostgREST langsung
-- memakai JWT-nya. Migrasi ini yang menjadikan expires_at sebuah pagar.
--
-- Aturan yang ditegakkan: guru aktif boleh baca dan tulis; guru dalam grace
-- period (H+0–H+7) boleh baca tetapi tidak boleh tulis; siswa dan ortu tidak
-- tersentuh sama sekali.
--
-- KENAPA POLICY RESTRICTIVE, BUKAN MENYUNTING POLICY YANG ADA.
-- Sepuluh policy yang ada memakai cmd = ALL, yang melayani baca dan tulis
-- sekaligus. Pada policy semacam itu `qual` dipakai bersama oleh SELECT dan
-- DELETE, sehingga menambahkan syarat "masih aktif" ke `qual` demi memblokir
-- DELETE akan ikut memblokir SELECT — persis yang dilarang keputusan produk.
-- Policy RESTRICTIVE di-AND-kan dengan seluruh policy permisif yang ada tanpa
-- satu pun di antaranya disunting, dan karena ia dipasang hanya untuk INSERT,
-- UPDATE, dan DELETE, kata SELECT tidak pernah muncul. Sifat read-only pada
-- grace period karena itu bersifat struktural: bukan karena kami hati-hati
-- menulisnya, melainkan karena perintahnya tidak ada di sana untuk dilanggar.
--
-- Konsekuensi lain yang sama pentingnya: fn_is_classroom_owner tidak diubah dan
-- tidak satu pun policy lama disunting, jadi risiko regresi pada jalur baca dan
-- pada isolasi antar-classroom nol menurut konstruksi.
--
-- KENAPA expires_at DIBACA LANGSUNG, BUKAN is_active SAJA.
-- is_active baru berubah menjadi false ketika fn_guru_trial_status dipanggil —
-- lazy deactivation. Fungsi itu hanya menyala kalau portal memanggilnya, dan
-- penyerang yang memukul PostgREST langsung tidak pernah memanggilnya. Pada
-- jalur ancaman yang justru ingin ditutup, is_active adalah nilai basi yang
-- bertahan true selamanya setelah masa berlaku lewat. Karena itu fungsi di
-- bawah mensyaratkan keduanya: is_active menangkap penonaktifan manual oleh
-- Romo, expires_at > NOW() menangkap kedaluwarsa yang belum sempat tercatat.
-- fn_guru_trial_status tetap dibiarkan apa adanya — perannya sebagai penyaji
-- status untuk banner UI masih sah, ia hanya tidak lagi menjadi penjaga.
--
-- CAKUPAN 19 TABEL. Setiap tabel yang punya policy tulis untuk role
-- authenticated mendapat penjaga, termasuk profiles — lihat catatan panjang di
-- bagian 2 tentang kenapa profiles tidak boleh dikecualikan.
--
-- Keadaan data sebelum migrasi (diperiksa di proyek tertaut, 23 Agustus 2026):
--   26 profil GURU, seluruhnya is_active = true dengan expires_at di masa
--   depan — 1 GURU_PRO dan 25 TRIAL. Nol guru ber-expires_at NULL. Artinya
--   tidak seorang pun kehilangan hak tulis pada saat migrasi ini dipasang;
--   pagar ini baru menggigit ketika masa berlaku seseorang benar-benar lewat.
--   Nol policy RESTRICTIVE terpasang sebelumnya, jadi tidak ada yang ditimpa.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. fn_guru_is_active()
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_guru_is_active()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  -- Bentuk 'role <> GURU OR ...' disengaja: siswa dan ortu selalu lolos,
  -- sehingga penjaga ini bisa dipasang pada tabel yang juga ditulis non-guru
  -- tanpa memblokir mereka. Ada lima policy tulis milik non-guru yang akan
  -- ikut melewatinya — pol_cm_siswa_insert, pol_cm_ortu_insert,
  -- pol_comments_member_insert, pm_ortu_insert, pm_ortu_update_read.
  --
  -- COALESCE(..., false) menutup kasus pemanggil tanpa baris profiles: tidak
  -- ada profil berarti tidak ada hak tulis. Arah default ini aman — kegagalan
  -- menemukan profil tidak pernah membuka pintu, dan pengguna semacam itu toh
  -- tidak bisa lolos policy permisif mana pun karena semuanya bersandar pada
  -- fn_current_profile_id().
  SELECT COALESCE(
    (SELECT p.role <> 'GURU'
         OR (p.is_active
             AND p.expires_at IS NOT NULL
             AND p.expires_at > NOW())
     FROM profiles p
     WHERE p.user_id = auth.uid()),
    false)
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_guru_is_active() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_guru_is_active() FROM anon;
GRANT  EXECUTE ON FUNCTION public.fn_guru_is_active() TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Policy RESTRICTIVE pada setiap tabel tulis
-- ---------------------------------------------------------------------------

-- KENAPA profiles IKUT DIJAGA, MESKI ADA HARGANYA.
--
-- Godaan untuk mengecualikan profiles besar: pol_profiles_self adalah satu-
-- satunya jalan guru menyunting profilnya sendiri, dan di situ pula
-- tier_requested ditulis — jalur guru mengajukan upgrade. Menjaganya berarti
-- guru yang sudah kedaluwarsa tidak bisa lagi mengajukan upgrade sendiri.
--
-- Tetapi mengecualikannya akan membatalkan seluruh migrasi ini. Trigger
-- trg_profiles_protect_security_fields hanya menahan perubahan role_guru,
-- role_locked_at, role_lock_version, dan tier dari role authenticated — ia
-- TIDAK menahan is_active maupun expires_at. Tanpa penjaga di profiles, guru
-- yang kedaluwarsa cukup mengirim satu PATCH ke PostgREST:
--
--     PATCH /rest/v1/profiles?user_id=eq.<dirinya>  { "expires_at": "2099-01-01" }
--
-- dan ia aktif kembali selamanya. Pagar di 18 tabel lain menjadi hiasan.
-- Karena itu profiles ikut dijaga.
--
-- Harga yang ditanggung: selama grace period, permintaan upgrade harus lewat
-- Romo. Itu bukan jalan buntu — aktivasi memang sudah manual sejak awal
-- (fn_activate_guru hanya untuk service_role), dan guru masih bisa mengajukan
-- upgrade kapan saja SEBELUM masa berlakunya habis. Kalau kelak pengajuan
-- mandiri saat grace dikehendaki, bentuk yang benar bukan mencabut penjaga ini
-- melainkan menambah satu RPC SECURITY DEFINER yang hanya boleh menulis kolom
-- tier_requested. Itu pokok tersendiri.

DO $$
DECLARE
  v_tabel text;
  v_daftar text[] := ARRAY[
    'assessment_results',
    'assessments',
    'attendance',
    'classroom_members',
    'classroom_roster',
    'classrooms',
    'forum_comments',
    'forum_posts',
    'grade_recap',
    'guidance_sessions',
    'parent_messages',
    'profiles',
    'rancang_dokumen',
    'rancang_profil',
    'rancang_settings',
    'schedules',
    'student_groups',
    'student_notes',
    'tp_kktp'
  ];
BEGIN
  FOREACH v_tabel IN ARRAY v_daftar LOOP
    -- DROP dulu supaya migrasi idempotent: dijalankan ulang tidak menggandakan
    -- policy dan tidak gagal karena nama bentrok.
    EXECUTE format('DROP POLICY IF EXISTS trial_guard_insert ON public.%I', v_tabel);
    EXECUTE format('DROP POLICY IF EXISTS trial_guard_update ON public.%I', v_tabel);
    EXECUTE format('DROP POLICY IF EXISTS trial_guard_delete ON public.%I', v_tabel);

    EXECUTE format(
      'CREATE POLICY trial_guard_insert ON public.%I AS RESTRICTIVE
         FOR INSERT TO authenticated
         WITH CHECK (fn_guru_is_active())', v_tabel);

    EXECUTE format(
      'CREATE POLICY trial_guard_update ON public.%I AS RESTRICTIVE
         FOR UPDATE TO authenticated
         USING (fn_guru_is_active())
         WITH CHECK (fn_guru_is_active())', v_tabel);

    EXECUTE format(
      'CREATE POLICY trial_guard_delete ON public.%I AS RESTRICTIVE
         FOR DELETE TO authenticated
         USING (fn_guru_is_active())', v_tabel);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Verifikasi — gagal berarti seluruh transaksi dibatalkan
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_n int;
BEGIN
  -- 1. Fungsi terpasang sebagai STABLE + SECURITY DEFINER
  SELECT COUNT(*) INTO v_n
  FROM pg_proc
  WHERE proname      = 'fn_guru_is_active'
    AND pronamespace = 'public'::regnamespace
    AND prosecdef                      -- SECURITY DEFINER
    AND provolatile = 's';             -- STABLE
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'fn_guru_is_active tidak terpasang sebagai STABLE SECURITY DEFINER — ROLLBACK';
  END IF;

  -- 2. authenticated wajib bisa mengeksekusinya, kalau tidak seluruh tulis mati
  IF NOT has_function_privilege(
       'authenticated', 'public.fn_guru_is_active()', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated tidak dapat memanggil fn_guru_is_active — ROLLBACK';
  END IF;

  -- 3. anon tidak boleh
  IF has_function_privilege('anon', 'public.fn_guru_is_active()', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon masih dapat memanggil fn_guru_is_active — ROLLBACK';
  END IF;

  -- 4. Tepat 3 penjaga × 19 tabel
  SELECT COUNT(*) INTO v_n
  FROM pg_policies
  WHERE schemaname = 'public'
    AND permissive = 'RESTRICTIVE'
    AND policyname LIKE 'trial_guard_%';
  IF v_n <> 57 THEN
    RAISE EXCEPTION 'Jumlah policy trial_guard harus 57, ditemukan % — ROLLBACK', v_n;
  END IF;

  -- 5. Tidak satu pun penjaga menyentuh SELECT. Ini inti jaminan read-only
  --    pada grace period, jadi ia diperiksa, bukan sekadar dipercaya.
  SELECT COUNT(*) INTO v_n
  FROM pg_policies
  WHERE schemaname = 'public'
    AND policyname LIKE 'trial_guard_%'
    AND cmd NOT IN ('INSERT', 'UPDATE', 'DELETE');
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Ada % policy trial_guard yang menyentuh perintah selain tulis — ROLLBACK', v_n;
  END IF;

  -- 6. Tidak ada tabel bertulis yang terlewat
  SELECT COUNT(*) INTO v_n
  FROM (
    SELECT DISTINCT tablename
    FROM pg_policies
    WHERE schemaname = 'public'
      AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
      AND roles = '{authenticated}'
      AND policyname NOT LIKE 'trial_guard_%'
  ) t
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_policies g
    WHERE g.schemaname = 'public'
      AND g.tablename  = t.tablename
      AND g.policyname = 'trial_guard_insert'
  );
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Ada % tabel bertulis tanpa penjaga trial_guard — ROLLBACK', v_n;
  END IF;

  -- 7. Tidak seorang guru aktif pun kehilangan hak tulis hari ini
  SELECT COUNT(*) INTO v_n
  FROM profiles
  WHERE role = 'GURU'
    AND is_active = true
    AND (expires_at IS NULL OR expires_at <= NOW());
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Ada % guru aktif yang akan langsung terblokir — ROLLBACK', v_n;
  END IF;
END $$;

COMMIT;

-- Cakupan yang sengaja dibatasi:
--
-- Edge Function tidak tersentuh. Dua belas dari tiga belas Edge Function
-- memakai SERVICE_ROLE, yang melewati RLS sepenuhnya — termasuk
-- phase2c-generate, phase2-material, phase2a-planning, runtime-sync, dan
-- generate-akun. Pagar ini nyata untuk pemanggilan PostgREST langsung, tetapi
-- guru kedaluwarsa masih dapat menulis lewat jalur Edge Function. Gate di
-- dalam Edge Function adalah pekerjaan tersendiri, dan tanpa itu enforcement
-- ini baru separuh jadi.
--
-- Klien tidak diubah. Portal belum menampilkan apa pun yang berbeda saat guru
-- masuk grace period; tombol-tombol tulis masih terlihat dan akan gagal dengan
-- galat RLS, bukan dengan pesan yang ramah. Banner grace period adalah
-- pekerjaan klien, memakai status yang sudah disediakan fn_guru_trial_status.
--
-- Pengajuan upgrade saat grace period belum ada jalannya. Lihat catatan panjang
-- di bagian 2: penjaga di profiles menutup jalur tier_requested bagi guru yang
-- sudah kedaluwarsa. Kalau pengajuan mandiri saat grace dikehendaki, tambahkan
-- RPC SECURITY DEFINER yang hanya boleh menulis kolom tier_requested — jangan
-- cabut penjaganya.
--
-- Hard delete belum ada. Guru yang melewati H+8 tidak dihapus oleh apa pun; ia
-- hanya kehilangan hak tulis dan tetap begitu selamanya. Itu Item C, dan
-- menurut docs/TIER-AND-LIFECYCLE.md §7 ia baru boleh dikerjakan setelah jalur
-- notifikasi email terbukti berjalan.
