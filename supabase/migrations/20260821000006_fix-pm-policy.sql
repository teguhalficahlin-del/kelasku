-- 20260821000006_fix-pm-policy.sql
-- Ikat anak dan guru ke classroom yang sama pada pesan orang tua.
--
-- Policy pm_ortu_insert yang lama memeriksa tiga hal yang semuanya benar
-- sendiri-sendiri, tetapi tidak satu pun mengikat ketiganya satu sama lain:
--
--   student_id IN (fn_child_profile_ids())  → "anak saya", di classroom MANA PUN
--   fn_is_classroom_member(classroom_id)    → "saya anggota kelas ini", tanpa
--                                              menyebut anak yang mana
--   teacher_id                              → tidak diperiksa sama sekali
--
-- Akibatnya orang tua dengan anak di kelas A dan kelas B dapat menulis pesan
-- ber-classroom_id A dengan student_id anaknya yang di B, dan siapa pun yang
-- berperan ORTU dapat mengisi teacher_id dengan uuid guru mana saja — pesan itu
-- lalu muncul sebagai percakapan yang seolah melibatkan guru yang tidak pernah
-- terlibat.
--
-- Perbaikannya menuntut dua pertanyaan yang belum bisa dijawab helper mana pun:
--   1. apakah anak X adalah anak saya DI classroom Y (bukan di kelas lain)
--   2. apakah guru T benar-benar pemilik classroom Y
-- fn_child_profile_ids() meratakan semua classroom menjadi satu daftar, dan di
-- situlah lubangnya; fn_is_classroom_owner() hanya bicara tentang diri sendiri.
--
-- Sumber kebenaran tautan ortu-anak adalah classroom_members, bukan
-- classroom_roster: roster mendaftar siswa (profile_id-nya nullable untuk siswa
-- yang belum di-generate akunnya) dan tidak menyimpan siapa orang tuanya selain
-- kolom teks nama_ortu. classroom_members menyimpan pasangan
-- (classroom, ortu, anak) sekaligus — persis yang dibutuhkan.
--
-- Kedua helper SECURITY DEFINER, bukan EXISTS mentah di dalam policy:
-- classroom_members dan classrooms sama-sama ber-RLS, sehingga subquery biasa
-- ikut tertahan RLS tabel itu. Ini juga konvensi tetap proyek (CLAUDE.md §11).
--
-- Data yang sudah ada tidak terpengaruh: pemeriksaan sebelum migrasi ini
-- menunjukkan 10 dari 10 baris parent_messages sudah memenuhi aturan ketat di
-- bawah (teacher_id cocok pemilik, anak terdaftar di classroom yang sama).

BEGIN;

-- ---------------------------------------------------------------------------
-- Helper 1 — anak ini anak saya, DI classroom ini
-- ---------------------------------------------------------------------------
-- member_role = 'ORTU' pada baris yang sama sekaligus menjawab "pemanggil
-- adalah ORTU": pemanggil yang bukan orang tua tidak punya baris seperti ini,
-- jadi tidak perlu pemeriksaan peran terpisah.
CREATE OR REPLACE FUNCTION fn_is_my_child_in_classroom(
  p_classroom_id uuid,
  p_student_id   uuid
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM classroom_members cm
    WHERE cm.profile_id        = fn_current_profile_id()
      AND cm.member_role       = 'ORTU'::member_role
      AND cm.classroom_id      = p_classroom_id
      AND cm.linked_student_id = p_student_id
  );
$$;

REVOKE EXECUTE ON FUNCTION fn_is_my_child_in_classroom(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fn_is_my_child_in_classroom(uuid, uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION fn_is_my_child_in_classroom(uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Helper 2 — guru ini benar-benar pemilik classroom ini
-- ---------------------------------------------------------------------------
-- Berbeda dari fn_is_classroom_owner() yang selalu bicara tentang pemanggil,
-- fungsi ini memeriksa guru mana pun — dipakai untuk memastikan teacher_id yang
-- dikirim klien tidak dikarang.
CREATE OR REPLACE FUNCTION fn_classroom_teacher_is(
  p_classroom_id uuid,
  p_teacher_id   uuid
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM classrooms c
    WHERE c.id         = p_classroom_id
      AND c.teacher_id = p_teacher_id
  );
$$;

REVOKE EXECUTE ON FUNCTION fn_classroom_teacher_is(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fn_classroom_teacher_is(uuid, uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION fn_classroom_teacher_is(uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Policy INSERT untuk orang tua
-- ---------------------------------------------------------------------------
-- fn_is_classroom_member(classroom_id) tidak lagi disebut: syarat baru lebih
-- kuat dan sudah mencakupnya — anggota classroom yang tidak punya anak di sana
-- memang tidak berhak menulis pesan tentang siapa pun.
DROP POLICY IF EXISTS pm_ortu_insert ON parent_messages;

CREATE POLICY pm_ortu_insert ON parent_messages
  FOR INSERT TO authenticated
  WITH CHECK (
        author_profile_id = fn_current_profile_id()
    AND author_role       = 'ORTU'
    AND fn_is_my_child_in_classroom(classroom_id, student_id)
    AND fn_classroom_teacher_is(classroom_id, teacher_id)
  );

COMMIT;

-- Tidak disentuh: pm_guru_all, pm_ortu_select, pm_ortu_update_read, dan trigger
-- trg_pm_guard_kolom. Guru mengirim lewat pm_guru_all yang bertumpu pada
-- fn_is_classroom_owner — di luar jalur perubahan ini sepenuhnya.
