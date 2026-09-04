-- Perbaikan tiga temuan audit keamanan forum-v2:
--
-- F1 (HIGH): pol_posts_ortu_modify tidak mengunci classroom_id —
--   ortu bisa UPDATE classroom_id posting mereka ke classroom lain
--   (tenant isolation bypass).
--
-- F2 (MEDIUM): pol_posts_ortu_modify FOR ALL ikut meng-cover SELECT,
--   sehingga ortu yang sudah dikeluarkan dari classroom masih bisa
--   membaca posting lama mereka lewat policy ini (membership check
--   di pol_posts_ortu_select tidak cukup karena policy permisif di-OR).
--
-- F3 (MEDIUM): pol_comments_ortu_insert tidak memvalidasi bahwa
--   forum_posts.classroom_id == forum_comments.classroom_id —
--   comment bisa mendarat di post yang berbeda classroom.

BEGIN;

-- ── F1 + F2: pisah FOR ALL → FOR UPDATE + FOR DELETE, kunci classroom ────────

DROP POLICY IF EXISTS pol_posts_ortu_modify ON forum_posts;

CREATE POLICY pol_posts_ortu_update ON forum_posts
  FOR UPDATE TO authenticated
  USING (
    author_id   = fn_current_profile_id()
    AND author_role = 'ORTU'
    AND fn_is_classroom_member(classroom_id)
    AND EXISTS (
      SELECT 1 FROM classroom_members cm
      WHERE cm.classroom_id = forum_posts.classroom_id
        AND cm.profile_id   = fn_current_profile_id()
        AND cm.member_role  = 'ORTU'
    )
  )
  WITH CHECK (
    -- classroom_id tidak boleh berubah: WITH CHECK memvalidasi baris BARU
    author_id   = fn_current_profile_id()
    AND author_role = 'ORTU'
    AND fn_is_classroom_member(classroom_id)
    AND EXISTS (
      SELECT 1 FROM classroom_members cm
      WHERE cm.classroom_id = forum_posts.classroom_id
        AND cm.profile_id   = fn_current_profile_id()
        AND cm.member_role  = 'ORTU'
    )
  );

CREATE POLICY pol_posts_ortu_delete ON forum_posts
  FOR DELETE TO authenticated
  USING (
    author_id   = fn_current_profile_id()
    AND author_role = 'ORTU'
    AND fn_is_classroom_member(classroom_id)
    AND EXISTS (
      SELECT 1 FROM classroom_members cm
      WHERE cm.classroom_id = forum_posts.classroom_id
        AND cm.profile_id   = fn_current_profile_id()
        AND cm.member_role  = 'ORTU'
    )
  );

-- ── F3: tambah validasi classroom_id pada komentar ortu ──────────────────────

DROP POLICY IF EXISTS pol_comments_ortu_insert ON forum_comments;

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
      WHERE p.id            = forum_comments.post_id
        AND p.classroom_id  = forum_comments.classroom_id   -- F3: kunci classroom
        AND (
          (p.author_role = 'GURU' AND p.is_visible_to_ortu = true)
          OR (p.author_role = 'ORTU' AND p.author_id = fn_current_profile_id())
        )
    )
  );

COMMIT;
