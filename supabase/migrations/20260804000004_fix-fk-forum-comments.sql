-- Migration: 20260804000004_fix-fk-forum-comments.sql
-- Fix FK ON DELETE untuk forum_comments.author_id
-- CASCADE: komentar siswa ikut terhapus saat akun dihapus
-- (komentar tanpa author tidak bermakna di konteks classroom)

BEGIN;

ALTER TABLE forum_comments
  DROP CONSTRAINT forum_comments_author_id_fkey,
  ADD CONSTRAINT forum_comments_author_id_fkey
    FOREIGN KEY (author_id) REFERENCES profiles(id) ON DELETE CASCADE;

COMMIT;
