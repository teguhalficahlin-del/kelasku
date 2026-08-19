-- Kanal komunikasi dua arah antara orang tua dan guru.
--
-- Dua kebutuhan ditampung satu tabel:
--   note_id terisi  → balasan atas catatan guru
--   note_id NULL    → pesan berdiri sendiri (mis. "anak saya sakit hari ini")
--
-- Siswa sengaja TIDAK diberi akses: orang tua kerap menulis hal yang tidak
-- ditujukan untuk dibaca anaknya.

BEGIN;

CREATE TABLE IF NOT EXISTS parent_messages (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id      uuid NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
  -- teacher_id didenormalisasi sesuai ADR-001; jangan dihapus
  teacher_id        uuid NOT NULL REFERENCES profiles(id),
  student_id        uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  note_id           uuid REFERENCES student_notes(id) ON DELETE CASCADE,
  author_profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  author_role       text NOT NULL CHECK (author_role IN ('GURU','ORTU')),
  content           text NOT NULL CHECK (btrim(content) <> ''),
  read_at           timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_parent_messages_classroom
  ON parent_messages (classroom_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_parent_messages_student
  ON parent_messages (student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_parent_messages_note
  ON parent_messages (note_id) WHERE note_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_parent_messages_belum_dibaca
  ON parent_messages (classroom_id) WHERE read_at IS NULL;

-- Profil anak yang ditautkan ke pengguna saat ini (peran ORTU).
-- Sejalan dengan fn_child_roster_ids(), tetapi mengembalikan profiles(id)
-- karena student_notes dan parent_messages memakai ruang id itu.
CREATE OR REPLACE FUNCTION fn_child_profile_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT cm.linked_student_id
  FROM classroom_members cm
  WHERE cm.profile_id       = fn_current_profile_id()
    AND cm.member_role      = 'ORTU'::member_role
    AND cm.linked_student_id IS NOT NULL;
$$;

REVOKE EXECUTE ON FUNCTION fn_child_profile_ids() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fn_child_profile_ids() FROM anon;
GRANT  EXECUTE ON FUNCTION fn_child_profile_ids() TO authenticated;

ALTER TABLE parent_messages ENABLE ROW LEVEL SECURITY;

-- Guru: penuh atas percakapan di classroom miliknya
CREATE POLICY pm_guru_all ON parent_messages
  FOR ALL TO authenticated
  USING      (fn_is_classroom_owner(classroom_id))
  WITH CHECK (fn_is_classroom_owner(classroom_id));

-- Ortu: baca percakapan tentang anaknya sendiri
CREATE POLICY pm_ortu_select ON parent_messages
  FOR SELECT TO authenticated
  USING (student_id IN (SELECT fn_child_profile_ids()));

-- Ortu: kirim pesan atas nama dirinya sendiri, tentang anaknya sendiri.
-- author_role dikunci 'ORTU' agar ortu tidak dapat menyamar sebagai guru.
CREATE POLICY pm_ortu_insert ON parent_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    author_profile_id = fn_current_profile_id()
    AND author_role   = 'ORTU'
    AND student_id IN (SELECT fn_child_profile_ids())
    AND fn_is_classroom_member(classroom_id)
  );

-- Ortu: menandai pesan guru sebagai sudah dibaca. Hanya read_at yang berubah;
-- isi pesan tidak dapat disunting karena USING dan WITH CHECK sama-sama
-- membatasi baris ke pesan berperan GURU tentang anaknya.
CREATE POLICY pm_ortu_update_read ON parent_messages
  FOR UPDATE TO authenticated
  USING      (author_role = 'GURU' AND student_id IN (SELECT fn_child_profile_ids()))
  WITH CHECK (author_role = 'GURU' AND student_id IN (SELECT fn_child_profile_ids()));

COMMIT;

-- Catatan: pencegahan penyuntingan isi pesan oleh ortu bertumpu pada klien yang
-- hanya mengirim kolom read_at. Bila kelak diperlukan jaminan yang lebih kuat,
-- ganti policy UPDATE ini dengan RPC SECURITY DEFINER yang hanya menyentuh
-- read_at.
