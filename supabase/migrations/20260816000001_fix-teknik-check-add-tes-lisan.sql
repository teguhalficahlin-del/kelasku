-- Tambah TES_LISAN ke CHECK constraint assessments.teknik
-- Constraint sebelumnya tidak mencakup TES_LISAN → 400 Bad Request saat simpan

BEGIN;

ALTER TABLE assessments
  DROP CONSTRAINT IF EXISTS assessments_teknik_check;

ALTER TABLE assessments
  ADD CONSTRAINT assessments_teknik_check
    CHECK (teknik IN (
      'OBSERVASI','TES','TES_LISAN','PENUGASAN',
      'PROYEK','PORTOFOLIO','UNJUK_KERJA'
    ));

COMMIT;
