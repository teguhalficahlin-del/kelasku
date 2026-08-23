-- 20260823000023_cleanup-fn-check-schedule-conflict.sql
--
-- p_classroom_id dihapus: parameter ini diterima tapi tidak
-- pernah dipakai di body fungsi. Pemanggil JS diperbarui
-- bersamaan di commit yang sama.
--
-- YANG PERLU DIPAHAMI SEBELUM MENYUNTING BERKAS INI.
--
-- CREATE OR REPLACE di bawah TIDAK mengganti fungsi yang lama. PostgreSQL
-- mengenali fungsi dari nama BESERTA daftar parameternya, jadi menghilangkan
-- satu parameter menghasilkan fungsi KEDUA yang berdiri sendiri. Sesudah
-- migrasi ini dijalankan, dua bentuk hidup berdampingan:
--
--   fn_check_schedule_conflict(uuid, text, time, time, uuid)   <- lama
--   fn_check_schedule_conflict(text, time, time, uuid)         <- baru
--
-- Itu bukan kecelakaan, melainkan justru alasan urutannya aman. MiClass
-- disajikan lewat GitHub Pages: guru yang tab-nya masih terbuka, atau yang
-- peramban-nya masih memegang classroom-schedule.js versi lama dari cache,
-- akan tetap mengirim lima argumen sampai ia memuat ulang halaman. Selama
-- bentuk lama masih ada, permintaan itu tetap dilayani seperti biasa.
--
-- MENGHAPUS BENTUK LAMA ADALAH PEKERJAAN TERPISAH, bukan bagian dari migrasi
-- ini, dan baru boleh dilakukan setelah cukup waktu berlalu sehingga tidak ada
-- lagi peramban yang memegang JS versi lama. Migrasi 20260823000009 sudah
-- pernah melakukan hal yang sama untuk bentuk enam-parameter, dan bisa dipakai
-- sebagai contoh:
--
--   DROP FUNCTION IF EXISTS fn_check_schedule_conflict(UUID,TEXT,TIME,TIME,UUID);
--
-- TIDAK ADA AMBIGUITAS di antara kedua bentuk. PostgREST mencocokkan fungsi
-- dari himpunan nama argumen yang dikirim; empat nama tanpa p_classroom_id
-- hanya cocok dengan bentuk baru, karena p_classroom_id pada bentuk lama tidak
-- punya DEFAULT sehingga bentuk itu tidak bisa dipanggil tanpanya.
--
-- BODY-nya disalin PERSIS dari pg_get_functiondef bentuk lama. Satu-satunya
-- perbedaan adalah hilangnya p_classroom_id dari daftar parameter. Tidak ada
-- baris logika yang ditambah, dihapus, atau diubah urutannya.
--
-- Idempotent: CREATE OR REPLACE untuk bentuk baru, REVOKE/GRANT selalu
-- ditulis ulang.

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_check_schedule_conflict(
  p_day_of_week TEXT,
  p_start_time  TIME,
  p_end_time    TIME,
  p_exclude_id  UUID DEFAULT NULL
)
RETURNS TABLE(
  conflict_classroom_name TEXT,
  conflict_day            TEXT,
  conflict_start          TIME,
  conflict_end            TIME
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
$function$;

-- REVOKE dua lapis (CLAUDE.md §7). WAJIB, bukan formalitas: fungsi yang baru
-- dibuat mewarisi EXECUTE untuk PUBLIC secara default, sehingga tanpa blok ini
-- sebuah fungsi SECURITY DEFINER akan terbuka bagi anon sejak detik pertama.
-- Hak yang diberikan sama persis dengan yang dipegang bentuk lama di
-- 20260823000008: hanya authenticated.
REVOKE EXECUTE ON FUNCTION fn_check_schedule_conflict(TEXT,TIME,TIME,UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fn_check_schedule_conflict(TEXT,TIME,TIME,UUID) FROM anon;
GRANT  EXECUTE ON FUNCTION fn_check_schedule_conflict(TEXT,TIME,TIME,UUID) TO authenticated;

DO $$
BEGIN
  IF has_function_privilege('anon', 'fn_check_schedule_conflict(TEXT,TIME,TIME,UUID)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon masih bisa mengeksekusi bentuk empat-parameter -- REVOKE tidak berlaku';
  END IF;

  IF NOT has_function_privilege('authenticated', 'fn_check_schedule_conflict(TEXT,TIME,TIME,UUID)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated kehilangan EXECUTE -- pemeriksaan bentrok jadwal akan rusak';
  END IF;
END
$$;

COMMIT;
