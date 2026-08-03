-- Fungsi: cek status trial guru + lazy deactivation jika sudah expired
-- Return JSON: { is_active, trial_started_at, expires_at, hari_tersisa, status }

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
  SELECT id, is_active, trial_started_at, expires_at
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

  -- Hitung hari tersisa (0 jika sudah expired atau belum mulai trial)
  IF v_profile.expires_at IS NOT NULL AND v_profile.expires_at > NOW() THEN
    v_tersisa := GREATEST(0, EXTRACT(DAY FROM (v_profile.expires_at - NOW()))::INT);
  ELSE
    v_tersisa := 0;
  END IF;

  -- Tentukan status
  IF v_profile.trial_started_at IS NULL THEN
    v_status := 'belum_trial';
  ELSIF v_profile.is_active THEN
    v_status := 'trial';
  ELSE
    v_status := 'expired';
  END IF;

  RETURN JSON_BUILD_OBJECT(
    'is_active',        v_profile.is_active,
    'trial_started_at', v_profile.trial_started_at,
    'expires_at',       v_profile.expires_at,
    'hari_tersisa',     v_tersisa,
    'status',           v_status
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION fn_guru_trial_status() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fn_guru_trial_status() FROM anon;
GRANT  EXECUTE ON FUNCTION fn_guru_trial_status() TO authenticated;
