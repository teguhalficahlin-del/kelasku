-- Fungsi aktivasi guru — dipanggil admin via Supabase SQL Editor
--
-- Cara penggunaan di SQL Editor Supabase Dashboard:
--
--   1. Temukan profile_id guru yang akan diaktivasi:
--      SELECT id, full_name, email, is_active, expires_at
--      FROM profiles
--      WHERE role = 'GURU' AND is_active = false;
--
--   2. Jalankan aktivasi:
--      SELECT fn_activate_guru('<profile_id>');
--
--   3. Verifikasi hasil:
--      SELECT id, full_name, is_active, activated_at, expires_at
--      FROM profiles WHERE id = '<profile_id>';

CREATE OR REPLACE FUNCTION fn_activate_guru(p_profile_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE profiles
  SET
    is_active    = true,
    activated_at = NOW(),
    expires_at   = NOW() + INTERVAL '1 year'
  WHERE id = p_profile_id
    AND role = 'GURU';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Guru dengan id % tidak ditemukan atau bukan role GURU', p_profile_id;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION fn_activate_guru(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fn_activate_guru(UUID) FROM anon;
GRANT  EXECUTE ON FUNCTION fn_activate_guru(UUID) TO authenticated;
