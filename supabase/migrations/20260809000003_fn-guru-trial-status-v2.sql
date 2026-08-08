-- Update fn_guru_trial_status:
-- 1. Status uppercase: TRIAL / AKTIF / EXPIRED / belum_trial
-- 2. Status AKTIF jika activated_at IS NOT NULL (admin-activated)
-- 3. Status TRIAL jika active tapi belum diaktifkan admin

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
  SELECT id, is_active, trial_started_at, activated_at, expires_at
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
    'status',           v_status
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION fn_guru_trial_status() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fn_guru_trial_status() FROM anon;
GRANT  EXECUTE ON FUNCTION fn_guru_trial_status() TO authenticated;
