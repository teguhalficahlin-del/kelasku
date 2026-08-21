-- Sumber waktu tepercaya untuk penguncian sesi absensi.
--
-- Sebelumnya penguncian sesi sepenuhnya bersandar pada jam perangkat guru.
-- Jam HP yang meleset — atau sengaja digeser — membuka atau mengunci form
-- absensi pada waktu yang salah.
--
-- Fungsi ini mengembalikan instant (timestamptz) dari server. Klien tetap
-- menerjemahkannya ke waktu dinding lokal perangkat, sehingga guru di WIB,
-- WITA, maupun WIT tetap dinilai menurut zona waktunya masing-masing —
-- yang berubah hanya sumber instantnya, bukan zonanya.
--
-- Tidak SECURITY DEFINER: now() tidak butuh hak istimewa apa pun, dan fungsi
-- tanpa SECURITY DEFINER tidak menambah permukaan serang.

BEGIN;

CREATE OR REPLACE FUNCTION fn_server_now()
RETURNS timestamptz
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT now();
$$;

REVOKE EXECUTE ON FUNCTION fn_server_now() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fn_server_now() FROM anon;
GRANT  EXECUTE ON FUNCTION fn_server_now() TO authenticated;

COMMIT;
