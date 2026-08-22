-- 20260823000001_tier-schema-guru-go.sql
-- Migration A dari docs/TIER-AND-LIFECYCLE.md — fondasi tier GURU_GO.
--
-- Empat hal dikerjakan sekaligus karena saling mengunci dan tidak bisa dipisah
-- tanpa meninggalkan database dalam keadaan setengah jadi:
--   1. Tier GURU_GO dibuka di kedua constraint.
--   2. Masa berlaku ditetapkan saat registrasi, bukan saat classroom pertama
--      dibuat — trigger lama karena itu dibongkar.
--   3. fn_activate_guru mulai menyetel tier, yang selama ini tidak disentuhnya.
--   4. Sepuluh guru warisan di-backfill agar tidak tertinggal tanpa masa
--      berlaku di bawah model baru.
--
-- KENAPA TRIGGER LAMA DIBONGKAR. trg_guru_trial_start menyalakan trial pada
-- AFTER INSERT ON classrooms — masa 30 hari mulai berjalan saat guru membuat
-- classroom pertamanya, bukan saat ia mendaftar. Di bawah model baru masa
-- berlaku ditetapkan saat registrasi, jadi trigger itu bukan sekadar tidak
-- terpakai: ia berbahaya. Ia menimpa expires_at dengan NOW() + 30 hari untuk
-- siapa pun yang trial_started_at-nya masih NULL — termasuk guru GURU_GO atau
-- GURU_PRO yang sudah membayar setahun dan kebetulan belum punya classroom.
-- Guru berbayar akan kehilangan 335 hari secara diam-diam pada saat ia membuat
-- classroom pertamanya.
--
-- KENAPA fn_activate_guru DI-DROP, BUKAN DI-REPLACE. CREATE OR REPLACE tidak
-- boleh mengubah daftar parameter, sedangkan fungsi ini harus menerima p_tier.
-- DROP aman di sini karena tidak ada yang bergantung padanya: nol policy, nol
-- trigger, nol pemanggilan di seluruh berkas .js/.ts/.html repo. Romo
-- memanggilnya manual lewat SQL editor.
--
-- HAK EKSEKUSI DIPERKETAT — INI PERUBAHAN KEAMANAN, BUKAN KOSMETIK.
-- fn_activate_guru yang lama memegang ACL 'authenticated=X'. Ia SECURITY
-- DEFINER dan tidak memeriksa siapa pemanggilnya, sehingga setiap pengguna yang
-- sudah login dapat memanggil fn_activate_guru(<profile_id siapa pun>) dan
-- memberi dirinya sendiri — atau orang lain — aktivasi satu tahun penuh tanpa
-- membayar. Versi baru hanya diberikan kepada service_role. Romo tetap bisa
-- memanggilnya sebagai postgres dari SQL editor; yang hilang hanyalah
-- kemampuan pengguna biasa memanggilnya, dan itu memang tidak pernah
-- dimaksudkan ada.
--
-- Keadaan data sebelum migrasi (diperiksa di proyek tertaut, 22 Agustus 2026):
--   26 profil GURU — 1 GURU_PRO aktif, 15 TRIAL aktif, 10 TRIAL non-aktif.
--   Kesepuluh yang non-aktif punya expires_at NULL DAN trial_started_at NULL:
--   mereka mendaftar 20 Agustus 2026 dan tidak pernah memulai apa pun.
--   Nol guru aktif ber-expires_at NULL, jadi backfill tidak menyentuh seorang
--   pun yang sedang bekerja.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Constraint tier
-- ---------------------------------------------------------------------------

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_tier_check;
ALTER TABLE profiles
  ADD CONSTRAINT profiles_tier_check
  CHECK (tier = ANY (ARRAY['TRIAL'::text, 'GURU_GO'::text, 'GURU_PRO'::text]));

-- Bentuk lama 'CHECK (tier_requested = ''GURU_PRO'')' menolak permintaan
-- upgrade ke GURU_GO. NULL tetap lolos pada kedua bentuk — CHECK yang bernilai
-- NULL dianggap terpenuhi — tetapi ditulis eksplisit di sini supaya pembaca
-- berikutnya tidak perlu mengingat aturan itu.
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_tier_requested_check;
ALTER TABLE profiles
  ADD CONSTRAINT profiles_tier_requested_check
  CHECK (tier_requested IS NULL
         OR tier_requested = ANY (ARRAY['GURU_GO'::text, 'GURU_PRO'::text]));

-- ---------------------------------------------------------------------------
-- 2. Bongkar trial-start berbasis classroom
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_guru_trial_start ON classrooms;
DROP FUNCTION IF EXISTS fn_guru_trial_start();

-- ---------------------------------------------------------------------------
-- 3. fn_activate_guru — konfirmasi pembayaran manual oleh Romo
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS fn_activate_guru(uuid);

CREATE OR REPLACE FUNCTION public.fn_activate_guru(
  p_profile_id uuid,
  p_tier       text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- TRIAL sengaja tidak diterima. Fungsi ini adalah jalur konfirmasi
  -- pembayaran; TRIAL tidak pernah dibayar dan disetel otomatis saat
  -- registrasi. Memperbolehkannya di sini akan membuka jalan memperpanjang
  -- trial berkali-kali secara manual tanpa jejak.
  IF p_tier NOT IN ('GURU_GO', 'GURU_PRO') THEN
    RAISE EXCEPTION 'Tier % tidak sah untuk aktivasi — hanya GURU_GO atau GURU_PRO', p_tier
      USING ERRCODE = '22023';
  END IF;

  -- Sisa durasi hangus: 365 hari penuh dihitung dari saat konfirmasi, bukan
  -- ditambahkan ke sisa masa lama. Lihat docs/TIER-AND-LIFECYCLE.md bagian 3.
  UPDATE profiles
  SET
    tier           = p_tier,
    is_active      = true,
    activated_at   = NOW(),
    expires_at     = NOW() + INTERVAL '365 days',
    tier_requested = NULL
  WHERE id = p_profile_id
    AND role = 'GURU';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Guru dengan id % tidak ditemukan atau bukan role GURU', p_profile_id;
  END IF;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_activate_guru(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_activate_guru(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_activate_guru(uuid, text) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_activate_guru(uuid, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 4. fn_handle_new_user — masa berlaku ditetapkan saat registrasi
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_role text;
  v_name text;
  v_tier text;
BEGIN
  v_role := COALESCE(NEW.raw_user_meta_data->>'role', 'GURU');
  IF v_role NOT IN ('GURU', 'SISWA', 'ORTU') THEN
    v_role := 'GURU';
  END IF;

  -- signUp guru mengirim 'full_name'; generate-akun mengirim 'nama'
  v_name := COALESCE(
    NULLIF(NEW.raw_user_meta_data->>'full_name', ''),
    NULLIF(NEW.raw_user_meta_data->>'nama', ''),
    ''
  );

  -- Tier dipilih guru saat mendaftar dan dikirim lewat metadata signUp.
  -- Nilai yang tidak dikenal — termasuk metadata tanpa kunci 'tier' sama
  -- sekali — jatuh ke TRIAL. Ini disengaja: klien belum mengirimkan kunci ini
  -- (perubahan klien di luar cakupan migrasi ini), jadi sampai ia dikirim,
  -- setiap registrasi berperilaku persis seperti sebelumnya kecuali kini
  -- membawa masa berlaku. Jatuh ke TRIAL juga arah default yang benar: ia
  -- gratis dan berdurasi terpendek, sehingga kegagalan membaca metadata tidak
  -- pernah membagikan tier berbayar.
  v_tier := COALESCE(NEW.raw_user_meta_data->>'tier', 'TRIAL');
  IF v_tier NOT IN ('TRIAL', 'GURU_GO', 'GURU_PRO') THEN
    v_tier := 'TRIAL';
  END IF;

  IF v_role <> 'GURU' THEN
    v_tier := 'TRIAL';
  END IF;

  INSERT INTO public.profiles (user_id, full_name, role, email, tier, is_active, expires_at)
  VALUES (
    NEW.id,
    v_name,
    v_role,
    NEW.email,
    v_tier,
    -- Guru TRIAL langsung aktif; guru berbayar menunggu konfirmasi pembayaran
    -- Romo lewat fn_activate_guru. Siswa/ortu dibuat oleh guru dan selalu
    -- aktif, tidak tersentuh model tier.
    CASE
      WHEN v_role <> 'GURU'    THEN true
      WHEN v_tier = 'TRIAL'    THEN true
      ELSE false
    END,
    CASE
      WHEN v_role = 'GURU' AND v_tier = 'TRIAL' THEN NOW() + INTERVAL '30 days'
      ELSE NULL
    END
  )
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 5. Backfill sepuluh guru warisan
-- ---------------------------------------------------------------------------

-- Predikat sengaja memakai ketiga syarat sekaligus. is_active = false saja
-- tidak cukup: di bawah model baru nilai itu juga dipakai guru berbayar yang
-- sedang menunggu konfirmasi pembayaran, dan mereka tidak boleh diberi trial
-- 30 hari. Kombinasi ketiganya hanya cocok pada guru warisan yang mendaftar di
-- bawah model lama dan tidak pernah memulai apa pun.
--
-- Trigger trg_profiles_protect_security_fields tidak menghalangi UPDATE ini:
-- ia hanya menolak perubahan tier/role_guru bila current_user adalah
-- 'authenticated' atau 'anon', sedangkan migrasi berjalan sebagai postgres.
-- Lagi pula tier tidak diubah di sini — kesepuluhnya sudah TRIAL.
UPDATE profiles
SET
  expires_at = NOW() + INTERVAL '30 days',
  is_active  = true
WHERE role             = 'GURU'
  AND expires_at       IS NULL
  AND is_active        = false
  AND trial_started_at IS NULL;

-- ---------------------------------------------------------------------------
-- 6. Verifikasi — gagal berarti seluruh transaksi dibatalkan
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_n int;
BEGIN
  -- 1. Kedua constraint mengenal GURU_GO
  SELECT COUNT(*) INTO v_n
  FROM pg_constraint
  WHERE conrelid = 'profiles'::regclass
    AND contype  = 'c'
    AND conname  IN ('profiles_tier_check', 'profiles_tier_requested_check')
    AND convalidated
    AND pg_get_constraintdef(oid) LIKE '%GURU_GO%';
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'Constraint tier belum mengenal GURU_GO (ditemukan %) — ROLLBACK', v_n;
  END IF;

  -- 2. Trigger dan fungsi trial-start benar-benar hilang
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_guru_trial_start') THEN
    RAISE EXCEPTION 'trg_guru_trial_start masih ada — ROLLBACK';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'fn_guru_trial_start' AND pronamespace = 'public'::regnamespace
  ) THEN
    RAISE EXCEPTION 'fn_guru_trial_start masih ada — ROLLBACK';
  END IF;

  -- 3. fn_activate_guru hanya ada dalam bentuk dua argumen
  SELECT COUNT(*) INTO v_n
  FROM pg_proc
  WHERE proname = 'fn_activate_guru' AND pronamespace = 'public'::regnamespace;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'fn_activate_guru harus tepat satu versi, ditemukan % — ROLLBACK', v_n;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'fn_activate_guru'
      AND pronamespace = 'public'::regnamespace
      AND pg_get_function_identity_arguments(oid) = 'p_profile_id uuid, p_tier text'
  ) THEN
    RAISE EXCEPTION 'Tanda tangan fn_activate_guru tidak sesuai — ROLLBACK';
  END IF;

  -- 4. authenticated tidak lagi boleh mengeksekusi fn_activate_guru
  IF has_function_privilege(
       'authenticated', 'public.fn_activate_guru(uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated masih dapat memanggil fn_activate_guru — ROLLBACK';
  END IF;

  -- 5. Tidak ada lagi guru tanpa masa berlaku yang tertinggal dari model lama
  SELECT COUNT(*) INTO v_n
  FROM profiles
  WHERE role = 'GURU' AND expires_at IS NULL AND trial_started_at IS NULL
    AND is_active = false AND tier = 'TRIAL';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Masih ada % guru warisan tanpa expires_at — ROLLBACK', v_n;
  END IF;

  -- 6. Backfill tidak boleh melukai siapa pun: nol guru aktif tanpa expires_at
  SELECT COUNT(*) INTO v_n
  FROM profiles
  WHERE role = 'GURU' AND is_active = true AND expires_at IS NULL;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Ada % guru aktif tanpa expires_at — ROLLBACK', v_n;
  END IF;
END $$;

COMMIT;

-- Cakupan yang sengaja dibatasi:
--
-- Klien tidak diubah. Halaman registrasi belum mengirim kunci 'tier' di
-- metadata signUp, jadi sampai perubahan klien dikerjakan, setiap registrasi
-- guru menghasilkan TRIAL 30 hari — sama seperti sebelumnya, hanya kini dengan
-- expires_at terisi. Penjualan GURU_GO belum bisa berjalan lewat jalur mandiri
-- sampai klien mengirimkan kunci itu; sementara ini Romo menyetel tier lewat
-- fn_activate_guru setelah pembayaran dikonfirmasi, dan jalur itu sudah utuh.
--
-- Enforcement tulis belum dipasang. Guru yang expires_at-nya lewat masih dapat
-- menulis lewat PostgREST — fn_guru_is_active() dan policy RESTRICTIVE adalah
-- Migration B. Tanpanya, expires_at yang ditetapkan di sini baru berfungsi
-- sebagai penanda status, belum sebagai pagar.
--
-- Grace period tidak diberi kolom. Batasnya expires_at + 8 hari, turunan murni.
-- Lihat docs/TIER-AND-LIFECYCLE.md bagian 4.
--
-- SATU HAL YANG PERLU KEPUTUSAN ROMO, DICATAT DI SINI AGAR TIDAK HILANG:
-- fn_handle_new_user dipanggil trigger on_auth_user_created, yaitu AFTER INSERT
-- ON auth.users — ia menyala saat pendaftaran, sebelum email dikonfirmasi.
-- Versi lama menyetel is_active = false untuk semua guru dengan komentar
-- "Guru menunggu konfirmasi email". Keputusan produk yang sudah dikunci
-- meminta guru TRIAL aktif otomatis saat registrasi, dan itulah yang
-- diterapkan di sini — konsekuensinya guru TRIAL kini aktif sebelum emailnya
-- terverifikasi. Kalau verifikasi email tetap dikehendaki sebagai syarat aktif,
-- yang perlu diubah bukan fungsi ini melainkan pengaturan Auth (wajibkan
-- konfirmasi email sebelum sesi diterbitkan), sebab tanpa sesi guru tidak bisa
-- berbuat apa-apa meski is_active = true.
