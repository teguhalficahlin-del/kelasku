-- 20260823000007_sec001-schedule-conflict-abaikan-teacher-id.sql
-- SEC-001: fn_check_schedule_conflict berhenti mempercayai p_teacher_id.
--
-- Bentuk lamanya SECURITY DEFINER dan menyaring WHERE s.teacher_id =
-- p_teacher_id, yaitu nilai yang datang dari pemanggil. Fungsi ini di-GRANT ke
-- authenticated, jadi guru mana pun yang mengetahui uuid guru lain memperoleh
-- nama kelas beserta seluruh jadwal mengajar guru itu — lintas tenant, hanya
-- dengan mengganti satu argumen. Tidak ada pemeriksaan bahwa p_teacher_id
-- adalah pemanggilnya sendiri.
--
-- Sekarang sasarannya diambil dari fn_current_profile_id(), yang bersandar
-- pada auth.uid() dan tidak bisa dipalsukan dari klien.
--
-- CATATAN — kenapa parameternya tidak sekalian dihapus:
--
-- PostgreSQL mengenali fungsi dari daftar argumennya. CREATE OR REPLACE dengan
-- lima parameter tidak akan mengganti yang enam parameter, melainkan membuat
-- overload BARU di sebelahnya — bentuk lama yang bocor tetap ada dan tetap
-- bisa dipanggil, sehingga lubangnya sama sekali tidak tertutup. Menghapusnya
-- butuh DROP eksplisit, dan DROP itu langsung mematahkan dua pemanggil di
-- guru/js/classroom-schedule.js dan guru/js/guru.js sampai keduanya ikut
-- ter-deploy ke GitHub Pages.
--
-- Migrasi ini karena itu sengaja mempertahankan signature-nya: lubangnya
-- tertutup sekarang juga, tanpa jendela waktu ketika penyimpanan jadwal rusak.
-- p_teacher_id menjadi parameter mati — masih diterima, tidak lagi dibaca.
-- Pembersihannya (DROP signature lama + pemakaian bentuk lima parameter di JS)
-- adalah langkah tersendiri yang harus mendarat berbarengan dengan JS-nya.
--
-- p_classroom_id juga tidak pernah dipakai di badan fungsi — memang begitu
-- sejak 20260805000001: bentrok jadwal dinilai lintas SELURUH kelas milik guru
-- yang sama, bukan per kelas. Dibiarkan apa adanya, di luar cakupan SEC-001.

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
DECLARE
  v_teacher_id UUID;
BEGIN
  -- p_teacher_id sengaja tidak dibaca. Lihat catatan di atas.
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

-- Diulang agar migrasi ini tetap benar bila dijalankan sendirian.
REVOKE EXECUTE ON FUNCTION fn_check_schedule_conflict(UUID,UUID,TEXT,TIME,TIME,UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fn_check_schedule_conflict(UUID,UUID,TEXT,TIME,TIME,UUID) FROM anon;
GRANT  EXECUTE ON FUNCTION fn_check_schedule_conflict(UUID,UUID,TEXT,TIME,TIME,UUID) TO authenticated;
