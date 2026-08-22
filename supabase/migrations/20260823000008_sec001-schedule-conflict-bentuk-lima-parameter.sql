-- 20260823000008_sec001-schedule-conflict-bentuk-lima-parameter.sql
-- SEC-001, langkah 2 dari 3: bentuk lima parameter, tanpa p_teacher_id.
--
-- Langkah 1 (20260823000007) sudah menutup lubangnya: bentuk enam parameter
-- berhenti membaca p_teacher_id dan memakai fn_current_profile_id(). Yang
-- tersisa hanyalah kerapian — parameter mati yang masih dikirim klien.
--
-- Migrasi ini MENAMBAH bentuk lima parameter di sebelah yang lama, tidak
-- mengganti. Keduanya sengaja hidup berdampingan untuk sementara:
--
--   - Klien lama (JS yang masih tersaji dari cache GitHub Pages atau service
--     worker) tetap memanggil bentuk enam parameter, yang sudah aman.
--   - Klien baru memanggil bentuk lima parameter.
--
-- Tanpa masa tumpang tindih ini, ada jeda antara migrasi mendarat dan Pages
-- menyajikan JS baru — dan sepanjang jeda itu penyimpanan jadwal gagal total
-- dengan 404 'function not found'.
--
-- Langkah 3 (DROP bentuk enam parameter) menyusul sebagai migrasi tersendiri,
-- setelah JS baru terbukti tersaji.
--
-- p_classroom_id dipertahankan meski tidak dipakai badan fungsi — sama seperti
-- pendahulunya. Bentrok dinilai lintas SELURUH kelas milik guru yang sama,
-- bukan per kelas. Mengubah itu adalah keputusan produk tersendiri.

CREATE OR REPLACE FUNCTION fn_check_schedule_conflict(
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
DECLARE
  v_teacher_id UUID;
BEGIN
  v_teacher_id := fn_current_profile_id();

  IF v_teacher_id IS NULL THEN
    RAISE EXCEPTION 'Profil pemanggil tidak ditemukan';
  END IF;

  RETURN QUERY
  SELECT
    c.name::TEXT,
    s.day_of_week::TEXT,
    s.start_time,
    s.end_time
  FROM schedules s
  JOIN classrooms c ON c.id = s.classroom_id
  WHERE s.teacher_id  = v_teacher_id
    AND s.day_of_week = p_day_of_week
    AND s.is_active   = true
    AND (p_exclude_id IS NULL OR s.id <> p_exclude_id)
    AND s.start_time  < p_end_time
    AND s.end_time    > p_start_time;
END;
$$;

REVOKE EXECUTE ON FUNCTION fn_check_schedule_conflict(UUID,TEXT,TIME,TIME,UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fn_check_schedule_conflict(UUID,TEXT,TIME,TIME,UUID) FROM anon;
GRANT  EXECUTE ON FUNCTION fn_check_schedule_conflict(UUID,TEXT,TIME,TIME,UUID) TO authenticated;
