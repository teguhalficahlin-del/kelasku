-- Forum v2: posting dua arah guru↔ortu + kontrol visibilitas ke siswa.
--
-- Perubahan schema forum_posts:
--   + author_id    — siapa yang menulis (guru atau ortu)
--   + author_role  — 'GURU' | 'ORTU' (untuk RLS dan label UI)
--   + is_visible_to_ortu    — guru toggle "jadikan pengumuman ke ortu"
--   + is_visible_to_student — guru/ortu toggle "tampilkan ke siswa"
--   teacher_id menjadi nullable; trigger mengisi dari classrooms untuk ortu posts.
--
-- RLS ditulis ulang:
--   forum_posts    — 5 policy baru (drop semua lama)
--   forum_comments — drop pol_comments_member_insert + pol_comments_member_select
--                    diganti dua policy baru yang lebih ketat

BEGIN;

-- ── 1. ALTER forum_posts ────────────────────────────────────────────────────

ALTER TABLE forum_posts
  ADD COLUMN IF NOT EXISTS author_id   uuid REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS author_role text CHECK (author_role IN ('GURU','ORTU')),
  ADD COLUMN IF NOT EXISTS is_visible_to_ortu    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_visible_to_student boolean NOT NULL DEFAULT false;

-- teacher_id nullable: ortu posts tidak punya teacher langsung
ALTER TABLE forum_posts
  ALTER COLUMN teacher_id DROP NOT NULL;

-- Isi author_id + author_role untuk baris yang sudah ada (semua dari guru)
UPDATE forum_posts SET
  author_id   = teacher_id,
  author_role = 'GURU'
WHERE author_id IS NULL;

-- Setelah backfill, baru pasang NOT NULL
ALTER TABLE forum_posts
  ALTER COLUMN author_id   SET NOT NULL,
  ALTER COLUMN author_role SET NOT NULL;

-- ── 2. Trigger: isi teacher_id dari classroom untuk ortu posts ──────────────

CREATE OR REPLACE FUNCTION fn_forum_posts_set_teacher_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.teacher_id IS NULL THEN
    SELECT teacher_id INTO NEW.teacher_id
      FROM classrooms WHERE id = NEW.classroom_id;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION fn_forum_posts_set_teacher_id() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fn_forum_posts_set_teacher_id() FROM anon;

DROP TRIGGER IF EXISTS trg_forum_posts_set_teacher_id ON forum_posts;
CREATE TRIGGER trg_forum_posts_set_teacher_id
  BEFORE INSERT ON forum_posts
  FOR EACH ROW EXECUTE FUNCTION fn_forum_posts_set_teacher_id();

-- ── 3. RLS forum_posts — drop lama, pasang baru ─────────────────────────────

DROP POLICY IF EXISTS pol_posts_guru_all        ON forum_posts;
DROP POLICY IF EXISTS pol_posts_member_select   ON forum_posts;

-- Guru: SELECT semua posting di classroomnya
CREATE POLICY pol_posts_guru_select ON forum_posts
  FOR SELECT TO authenticated
  USING (fn_is_classroom_owner(classroom_id));

-- Guru: INSERT posting baru (author_role harus GURU)
CREATE POLICY pol_posts_guru_insert ON forum_posts
  FOR INSERT TO authenticated
  WITH CHECK (
    fn_is_classroom_owner(classroom_id)
    AND author_role = 'GURU'
    AND author_id = fn_current_profile_id()
  );

-- Guru: UPDATE/DELETE posting di classroomnya
CREATE POLICY pol_posts_guru_modify ON forum_posts
  FOR ALL TO authenticated
  USING (fn_is_classroom_owner(classroom_id) AND author_role = 'GURU')
  WITH CHECK (fn_is_classroom_owner(classroom_id) AND author_role = 'GURU');

-- Ortu: SELECT — posting guru yg is_visible_to_ortu=true ATAU posting sendiri
CREATE POLICY pol_posts_ortu_select ON forum_posts
  FOR SELECT TO authenticated
  USING (
    fn_is_classroom_member(classroom_id)
    AND EXISTS (
      SELECT 1 FROM classroom_members cm
      WHERE cm.classroom_id = forum_posts.classroom_id
        AND cm.profile_id   = fn_current_profile_id()
        AND cm.member_role  = 'ORTU'
    )
    AND (
      (author_role = 'GURU' AND is_visible_to_ortu = true)
      OR (author_role = 'ORTU' AND author_id = fn_current_profile_id())
    )
  );

-- Ortu: INSERT posting sendiri
CREATE POLICY pol_posts_ortu_insert ON forum_posts
  FOR INSERT TO authenticated
  WITH CHECK (
    fn_is_classroom_member(classroom_id)
    AND author_role = 'ORTU'
    AND author_id   = fn_current_profile_id()
    AND EXISTS (
      SELECT 1 FROM classroom_members cm
      WHERE cm.classroom_id = forum_posts.classroom_id
        AND cm.profile_id   = fn_current_profile_id()
        AND cm.member_role  = 'ORTU'
    )
  );

-- Ortu: UPDATE/DELETE posting sendiri
CREATE POLICY pol_posts_ortu_modify ON forum_posts
  FOR ALL TO authenticated
  USING  (author_id = fn_current_profile_id() AND author_role = 'ORTU')
  WITH CHECK (author_id = fn_current_profile_id() AND author_role = 'ORTU');

-- Siswa: SELECT — posting yg is_visible_to_student=true dan bisa dilihat siswa ini
--   posting guru: semua siswa kelas
--   posting ortu: hanya siswa yg linked ke ortu tsb
CREATE POLICY pol_posts_siswa_select ON forum_posts
  FOR SELECT TO authenticated
  USING (
    is_visible_to_student = true
    AND fn_is_classroom_member(classroom_id)
    AND EXISTS (
      SELECT 1 FROM classroom_members cm
      WHERE cm.classroom_id = forum_posts.classroom_id
        AND cm.profile_id   = fn_current_profile_id()
        AND cm.member_role  = 'SISWA'
    )
    AND (
      author_role = 'GURU'
      OR (
        author_role = 'ORTU'
        AND EXISTS (
          SELECT 1 FROM classroom_members cm2
          WHERE cm2.classroom_id      = forum_posts.classroom_id
            AND cm2.profile_id        = forum_posts.author_id
            AND cm2.member_role       = 'ORTU'
            AND cm2.linked_student_id = fn_current_profile_id()
        )
      )
    )
  );

-- ── 4. RLS forum_comments — drop lama, pasang baru ──────────────────────────

DROP POLICY IF EXISTS pol_comments_member_select ON forum_comments;
DROP POLICY IF EXISTS pol_comments_member_insert ON forum_comments;

-- Ortu: SELECT komentar di posting yang bisa dilihat ortu ini
CREATE POLICY pol_comments_ortu_select ON forum_comments
  FOR SELECT TO authenticated
  USING (
    fn_is_classroom_member(classroom_id)
    AND EXISTS (
      SELECT 1 FROM classroom_members cm
      WHERE cm.classroom_id = forum_comments.classroom_id
        AND cm.profile_id   = fn_current_profile_id()
        AND cm.member_role  = 'ORTU'
    )
    AND EXISTS (
      SELECT 1 FROM forum_posts p
      WHERE p.id = forum_comments.post_id
        AND (
          (p.author_role = 'GURU' AND p.is_visible_to_ortu = true)
          OR (p.author_role = 'ORTU' AND p.author_id = fn_current_profile_id())
        )
    )
  );

-- Ortu: INSERT komentar di posting yang bisa dilihatnya
CREATE POLICY pol_comments_ortu_insert ON forum_comments
  FOR INSERT TO authenticated
  WITH CHECK (
    author_id = fn_current_profile_id()
    AND fn_is_classroom_member(classroom_id)
    AND EXISTS (
      SELECT 1 FROM classroom_members cm
      WHERE cm.classroom_id = forum_comments.classroom_id
        AND cm.profile_id   = fn_current_profile_id()
        AND cm.member_role  = 'ORTU'
    )
    AND EXISTS (
      SELECT 1 FROM forum_posts p
      WHERE p.id = forum_comments.post_id
        AND (
          (p.author_role = 'GURU' AND p.is_visible_to_ortu = true)
          OR (p.author_role = 'ORTU' AND p.author_id = fn_current_profile_id())
        )
    )
  );

-- Siswa: tidak ada akses ke forum_comments (sudah di-cover oleh absensi SELECT yg ada;
-- tidak ada policy siswa di sini = default DENY)

COMMIT;
