-- Trigger: isi trial_started_at saat guru membuat classroom PERTAMA
-- Dipanggil AFTER INSERT ON classrooms (per-row)

CREATE OR REPLACE FUNCTION fn_guru_trial_start()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT;
BEGIN
  -- Hitung berapa classroom yang sudah dimiliki guru ini
  SELECT COUNT(*) INTO v_count
  FROM classrooms
  WHERE teacher_id = NEW.teacher_id;

  -- Jika ini classroom pertama (COUNT = 1 karena NEW sudah ter-INSERT)
  -- Guard WHERE trial_started_at IS NULL mencegah overwrite jika dua INSERT race
  IF v_count = 1 THEN
    UPDATE profiles
    SET
      trial_started_at = NOW(),
      expires_at       = NOW() + INTERVAL '30 days',
      is_active        = true
    WHERE id = NEW.teacher_id
      AND trial_started_at IS NULL;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION fn_guru_trial_start() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fn_guru_trial_start() FROM anon;

DROP TRIGGER IF EXISTS trg_guru_trial_start ON classrooms;
CREATE TRIGGER trg_guru_trial_start
  AFTER INSERT ON classrooms
  FOR EACH ROW
  EXECUTE FUNCTION fn_guru_trial_start();
