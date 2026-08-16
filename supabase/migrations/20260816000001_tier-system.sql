-- Tier system: TRIAL / GURU_GO / GURU_PRO
-- Tambah kolom tier + tier_requested ke profiles
-- Update fn_guru_trial_status() untuk include tier dan tier_requested
-- Set akun guru existing ke GURU_GO (dua akun testing)

BEGIN;

-- 1. Tambah kolom tier (default TRIAL, NOT NULL)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS tier TEXT NOT NULL DEFAULT 'TRIAL'
    CONSTRAINT profiles_tier_check CHECK (tier IN ('TRIAL','GURU_GO','GURU_PRO'));

-- 2. Tambah kolom tier_requested (nullable)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS tier_requested TEXT
    CONSTRAINT profiles_tier_requested_check CHECK (tier_requested IN ('GURU_GO','GURU_PRO'));

-- 3. Set akun guru existing ke GURU_GO untuk testing
UPDATE profiles SET tier = 'GURU_GO' WHERE role = 'GURU';

-- 4. Update fn_guru_trial_status — tambahkan field tier dan tier_requested
CREATE OR REPLACE FUNCTION fn_guru_trial_status()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile  RECORD;
  v_tersisa  INT;
  v_status   TEXT;
BEGIN
  SELECT id, is_active, trial_started_at, activated_at, expires_at, tier, tier_requested
  INTO v_profile
  FROM profiles
  WHERE user_id = auth.uid()
    AND role = 'GURU';

  IF NOT FOUND THEN
    RETURN JSON_BUILD_OBJECT('error', 'profil guru tidak ditemukan');
  END IF;

  -- Lazy deactivation: jika sudah melewati expires_at tapi is_active masih true
  IF v_profile.expires_at IS NOT NULL
     AND v_profile.expires_at < NOW()
     AND v_profile.is_active = true
  THEN
    UPDATE profiles
    SET is_active = false
    WHERE id = v_profile.id;

    v_profile.is_active := false;
  END IF;

  -- Hitung hari tersisa
  IF v_profile.expires_at IS NOT NULL AND v_profile.expires_at > NOW() THEN
    v_tersisa := GREATEST(0, EXTRACT(DAY FROM (v_profile.expires_at - NOW()))::INT);
  ELSE
    v_tersisa := 0;
  END IF;

  -- Tentukan status
  IF v_profile.trial_started_at IS NULL THEN
    v_status := 'belum_trial';
  ELSIF v_profile.is_active AND v_profile.activated_at IS NOT NULL THEN
    v_status := 'AKTIF';
  ELSIF v_profile.is_active THEN
    v_status := 'TRIAL';
  ELSE
    v_status := 'EXPIRED';
  END IF;

  RETURN JSON_BUILD_OBJECT(
    'is_active',        v_profile.is_active,
    'trial_started_at', v_profile.trial_started_at,
    'activated_at',     v_profile.activated_at,
    'expires_at',       v_profile.expires_at,
    'hari_tersisa',     v_tersisa,
    'status',           v_status,
    'tier',             v_profile.tier,
    'tier_requested',   v_profile.tier_requested
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION fn_guru_trial_status() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fn_guru_trial_status() FROM anon;
GRANT  EXECUTE ON FUNCTION fn_guru_trial_status() TO authenticated;

COMMIT;
