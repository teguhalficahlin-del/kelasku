-- Pengerasan grade_recap: semester/tahun_ajaran wajib, kunci unik tidak lagi
-- bisa ditembus NULL, dan jejak waktu penyimpanan.
--
-- Tiga hal yang diperbaiki:
--
-- 1. semester dan tahun_ajaran NULLABLE padahal ikut kunci unik. Di PostgreSQL
--    NULL tidak pernah sama dengan NULL dalam UNIQUE biasa, sehingga dua baris
--    dengan semester NULL untuk (classroom, student, tp) yang sama SAMA-SAMA
--    lolos. Jalur UI hari ini selalu mengisi keduanya, tapi constraint-nya
--    sendiri tidak menjamin apa pun.
--
-- 2. Kunci uniknya diganti indeks ber-NULLS NOT DISTINCT. Setelah kedua kolom
--    NOT NULL ini memang mubazir — tidak ada NULL yang bisa lolos. Ia dipasang
--    sebagai lapis kedua: kalau kelak NOT NULL dicabut, celah lama tidak
--    langsung terbuka kembali.
--
-- 3. updated_at tidak ada sama sekali. Untuk tabel berisi angka rapor, tidak
--    adanya jejak "kapan dihitung" menyulitkan saat guru mempertanyakan sebuah
--    nilai — terutama sejak rekap otomatis dihapus ketika hasil sumatif berubah.
--
-- Catatan pelaksanaan: indeks unik lama DIDUKUNG SEBUAH CONSTRAINT (contype='u'),
-- bukan indeks berdiri sendiri. DROP INDEX atasnya akan ditolak PostgreSQL
-- ("cannot drop index ... because constraint ... requires it"), jadi yang dipakai
-- ALTER TABLE ... DROP CONSTRAINT.
--
-- Idempoten: ALTER COLUMN SET NOT NULL, DROP CONSTRAINT IF EXISTS,
-- CREATE UNIQUE INDEX IF NOT EXISTS, dan ADD COLUMN IF NOT EXISTS semuanya aman
-- dijalankan ulang.
--
-- Data saat migration ditulis: 5 baris, seluruhnya semester='1'
-- tahun_ajaran='2025/2026'. Nol baris NULL.

BEGIN;

-- Penjaga eksplisit. SET NOT NULL memang akan gagal sendiri bila ada NULL, tapi
-- pesan bawaannya tidak menyebut berapa baris yang bermasalah.
DO $$
DECLARE v_n bigint;
BEGIN
  SELECT count(*) INTO v_n
    FROM grade_recap
   WHERE semester IS NULL OR tahun_ajaran IS NULL;
  IF v_n > 0 THEN
    RAISE EXCEPTION
      'grade_recap punya % baris dengan semester/tahun_ajaran NULL — isi dulu sebelum migration ini dijalankan', v_n;
  END IF;
END $$;

ALTER TABLE grade_recap ALTER COLUMN semester     SET NOT NULL;
ALTER TABLE grade_recap ALTER COLUMN tahun_ajaran SET NOT NULL;

-- Constraint lama dibuang berikut indeks pendukungnya, lalu diganti indeks unik
-- setara yang menganggap NULL saling sama.
--
-- Mengganti CONSTRAINT dengan INDEX tidak memutus PostgREST: klausa
-- ON CONFLICT (daftar kolom) yang dipakai upsertGradeRecap() menyimpulkan
-- arbiter dari indeks unik mana pun atas kolom itu — ia tidak menuntut sebuah
-- constraint bernama.
ALTER TABLE grade_recap
  DROP CONSTRAINT IF EXISTS grade_recap_classroom_id_student_id_tp_kktp_id_semester_tah_key;

CREATE UNIQUE INDEX IF NOT EXISTS grade_recap_unik
  ON grade_recap (classroom_id, student_id, tp_kktp_id, semester, tahun_ajaran)
  NULLS NOT DISTINCT;

-- DEFAULT now() mengisi kelima baris yang sudah ada, jadi NOT NULL bisa langsung
-- dipasang tanpa langkah backfill terpisah.
ALTER TABLE grade_recap
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

COMMIT;
