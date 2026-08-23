-- 20260823000022_cleanup-fn-lookup-classroom-code.sql
-- Cleanup: fn_lookup_classroom_code tidak memiliki pemanggil aktif.
-- GRANT anon sudah dicabut di sprint sebelumnya (SEC-002).
-- Fungsi ini aman dihapus sepenuhnya.
--
-- Nol pemanggil di seluruh codebase: grep atas *.js, *.ts, dan *.html tidak
-- menemukan satu pun rpc('fn_lookup_classroom_code'). Yang tersisa hanyalah
-- rujukan di berkas migrasi lama (20260803000003, 20260823000011,
-- 20260823000013, 20260823000016) -- itu riwayat, bukan pemakaian.
--
-- Signature ditulis lengkap dan hanya ada satu bentuk di DB:
--   fn_lookup_classroom_code(text)
-- sehingga DROP ini tidak mungkin salah sasaran ke overload lain.
--
-- Idempotent: IF EXISTS membuat pemanggilan ulang menjadi no-op, bukan galat.

BEGIN;

DROP FUNCTION IF EXISTS public.fn_lookup_classroom_code(text);

COMMIT;
