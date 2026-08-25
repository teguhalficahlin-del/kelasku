-- Perluas CHECK constraint assessment_results.status agar menerima status Formatif
--
-- Constraint sebelumnya hanya mengenal tiga nilai milik Diagnostik
-- ('PAHAM','BELUM_PAHAM','PERLU_PERHATIAN'), sehingga penilaian Formatif yang
-- mengisi status per siswa ditolak PostgREST dengan 400 Bad Request.
--
-- Perubahannya melebarkan, bukan mempersempit: ketiga nilai lama tetap ada dan
-- tidak ada baris yang bisa jatuh keluar dari constraint baru. Karena itu ADD
-- CONSTRAINT tidak perlu ditunda lewat NOT VALID — validasi atas baris yang
-- sudah ada dijamin lolos.
--
-- Idempoten: DROP ... IF EXISTS mendahului ADD, jadi migration ini aman
-- dijalankan ulang. Baris berstatus NULL tidak terpengaruh — CHECK dengan
-- IN (...) menghasilkan NULL untuk kolom NULL, dan NULL bukan false.

BEGIN;

ALTER TABLE assessment_results
  DROP CONSTRAINT IF EXISTS assessment_results_status_check;

ALTER TABLE assessment_results
  ADD CONSTRAINT assessment_results_status_check
    CHECK (status IN (
      -- Diagnostik (sudah ada sebelumnya)
      'PAHAM','BELUM_PAHAM','PERLU_PERHATIAN',
      -- Formatif (baru)
      'TERCAPAI','BERKEMBANG','PERLU_DUKUNGAN'
    ));

COMMIT;
