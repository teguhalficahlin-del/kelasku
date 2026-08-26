-- Trigger updated_at untuk grade_recap.
--
-- Migration 20260826000001 menambahkan kolom updated_at ke grade_recap dengan
-- DEFAULT now(). DEFAULT hanya bekerja saat INSERT — pada UPDATE (dan pada
-- cabang DO UPDATE dari upsert yang dipakai upsertGradeRecap()) nilainya tidak
-- ikut bergerak, sehingga kolom itu menyimpan "kapan baris dibuat", bukan
-- "kapan nilai terakhir dihitung". Justru arti kedua yang dibutuhkan saat guru
-- mempertanyakan sebuah angka rapor.
--
-- fn_set_updated_at() sudah ada sejak 20260730000001_init-schema.sql dan sudah
-- dipakai tujuh tabel lain (profiles, classrooms, student_notes,
-- guidance_sessions, forum_posts, forum_comments, attendance). Fungsinya TIDAK
-- didefinisikan ulang di sini — cukup dipasang. Mendefinisikan ulang fungsi
-- bersama dari migration yang hanya mengurus satu tabel berarti tabel lain ikut
-- terdampak tanpa alasan.
--
-- Idempoten: CREATE OR REPLACE TRIGGER aman dijalankan ulang (PostgreSQL 14+;
-- bentuk yang sama sudah dipakai init-schema dan attendance).
--
-- Tidak ada backfill. Kelima baris yang ada sudah punya updated_at dari DEFAULT
-- now() saat 20260826000001 dijalankan; menimpanya sekarang justru memalsukan
-- jejak waktu yang belum pernah salah.

BEGIN;

CREATE OR REPLACE TRIGGER trg_grade_recap_updated_at
  BEFORE UPDATE ON public.grade_recap
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

COMMIT;
