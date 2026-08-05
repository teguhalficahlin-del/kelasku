-- Migration: 20260805000001_schedules-jadwal.sql
-- Tambah kolom is_active + inactive_reason ke tabel schedules
-- Tambah fn_check_schedule_conflict untuk validasi anti bentrok server-side

BEGIN;

-- Tambah dua kolom baru ke schedules
ALTER TABLE schedules
  ADD COLUMN IF NOT EXISTS is_active       BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS inactive_reason TEXT;

-- Anti bentrok: cek overlap waktu dalam satu classroom ATAU lintas classroom
-- milik guru yang sama, pada hari yang sama.
-- p_exclude_id: UUID jadwal yang sedang diedit (agar tidak bentrok dengan dirinya sendiri)
CREATE OR REPLACE FUNCTION fn_check_schedule_conflict(
  p_teacher_id    UUID,
  p_classroom_id  UUID,
  p_day_of_week   TEXT,
  p_start_time    TIME,
  p_end_time      TIME,
  p_exclude_id    UUID DEFAULT NULL
)
RETURNS TABLE (
  conflict_classroom_name TEXT,
  conflict_day            TEXT,
  conflict_start          TIME,
  conflict_end            TIME
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.name::TEXT,
    s.day_of_week::TEXT,
    s.start_time,
    s.end_time
  FROM schedules s
  JOIN classrooms c ON c.id = s.classroom_id
  WHERE s.teacher_id  = p_teacher_id
    AND s.day_of_week = p_day_of_week
    AND s.is_active   = true
    AND (p_exclude_id IS NULL OR s.id <> p_exclude_id)
    AND s.start_time  < p_end_time
    AND s.end_time    > p_start_time;
END;
$$;

REVOKE EXECUTE ON FUNCTION fn_check_schedule_conflict(UUID,UUID,TEXT,TIME,TIME,UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fn_check_schedule_conflict(UUID,UUID,TEXT,TIME,TIME,UUID) FROM anon;
GRANT  EXECUTE ON FUNCTION fn_check_schedule_conflict(UUID,UUID,TEXT,TIME,TIME,UUID) TO authenticated;

COMMIT;
