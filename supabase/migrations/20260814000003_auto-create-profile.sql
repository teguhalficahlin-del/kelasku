-- Trigger: auto-create profile segera setelah guru mendaftar (INSERT auth.users)
-- full_name dibaca dari raw_user_meta_data yang dikirim client saat signUp
-- is_active=false karena email belum dikonfirmasi
-- trial_started_at tetap NULL — fn_guru_trial_start set nilainya saat classroom pertama dibuat

BEGIN;

CREATE OR REPLACE FUNCTION fn_handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, role, email, is_active)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    'GURU',
    NEW.email,
    false
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION fn_handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fn_handle_new_user() FROM anon;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION fn_handle_new_user();

COMMIT;
