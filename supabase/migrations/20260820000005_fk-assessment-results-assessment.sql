-- Tambahkan foreign key assessment_results.assessment_id -> assessments(id).
--
-- Masalah: kolom assessment_id tidak pernah punya constraint FK di schema hidup,
-- meski deklarasi tabelnya menyebutkan REFERENCES. Akibatnya dua hal:
--
--   1. PostgREST menolak embed 'assessments!inner(...)' dengan PGRST200
--      ("Could not find a relationship ... in the schema cache"), sehingga seksi
--      Nilai di portal siswa dan ortu selalu gagal 400 dan tampil kosong.
--      Bagian Dokumen Penilaian tetap tampil karena query-nya tidak memakai embed.
--
--   2. Menghapus satu penilaian tidak menghapus hasil-hasilnya — baris
--      assessment_results tertinggal yatim tanpa induk.
--
-- ON DELETE CASCADE dipilih karena hasil penilaian tidak punya makna tanpa
-- penilaian induknya; ini juga menyelaraskan perilaku hapus di tab Penilaian.
--
-- Diperiksa sebelum apply: tidak ada baris yatim (0), sehingga penambahan
-- constraint tidak akan ditolak.

BEGIN;

ALTER TABLE assessment_results
  DROP CONSTRAINT IF EXISTS assessment_results_assessment_id_fkey;

ALTER TABLE assessment_results
  ADD CONSTRAINT assessment_results_assessment_id_fkey
  FOREIGN KEY (assessment_id) REFERENCES assessments(id) ON DELETE CASCADE;

COMMIT;

-- Catatan: Supabase memuat ulang schema cache PostgREST secara otomatis setelah
-- perubahan DDL, jadi embed akan langsung dikenali tanpa langkah tambahan.
