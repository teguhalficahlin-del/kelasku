-- 20260821000010_check-nilai-range.sql
-- Batasi nilai pada rentang 0–100 di sisi database.
--
-- Sampai sekarang kedua kolom nilai berjenis NUMERIC tanpa batasan apa pun.
-- Satu-satunya penjaga rentang ada di klien, dan itu pun hanya atribut HTML
-- min="0" max="100" pada input di luar <form> — atribut itu tidak pernah
-- dievaluasi, dan flushSumActive() menerima hasil parseFloat apa adanya. Salah
-- ketik "955" tersimpan apa adanya, lalu ikut merusak predikat, kktp_tercapai,
-- dan rekap yang dihitung darinya.
--
-- Kedua kolom ini adalah jalur yang benar-benar dilewati data penilaian, jadi
-- di sinilah batasannya berguna — berbeda dengan bobot rekap, yang tidak pernah
-- dikirim ke database sama sekali sehingga tidak ada yang bisa dijaga di server.
--
-- Data produksi diperiksa lebih dulu dan tidak ada satu pun baris yang
-- melanggar: assessment_results 6 baris (rentang 75–90), grade_recap 1 baris
-- (nilai 80). Karena itu constraint dipasang langsung tanpa NOT VALID, dan
-- pemindaian validasinya sepele pada jumlah baris sebesar ini.
--
-- NULL sengaja tetap diizinkan. Nilai kosong itu sah dan bermakna "belum
-- dinilai" — berbeda dari nol. Syarat IS NULL ditulis eksplisit meski CHECK
-- memang meloloskan NULL dengan sendirinya, supaya maksudnya terbaca langsung
-- dari definisi constraint-nya.
--
-- Idempotent lewat DROP ... IF EXISTS sebelum ADD, mengikuti pola yang sudah
-- dipakai migrasi FK di proyek ini (mis. 20260820000005).

BEGIN;

ALTER TABLE assessment_results
  DROP CONSTRAINT IF EXISTS assessment_results_nilai_range;

ALTER TABLE assessment_results
  ADD CONSTRAINT assessment_results_nilai_range
  CHECK (nilai IS NULL OR (nilai >= 0 AND nilai <= 100));

ALTER TABLE grade_recap
  DROP CONSTRAINT IF EXISTS grade_recap_nilai_akhir_range;

ALTER TABLE grade_recap
  ADD CONSTRAINT grade_recap_nilai_akhir_range
  CHECK (nilai_akhir IS NULL OR (nilai_akhir >= 0 AND nilai_akhir <= 100));

COMMIT;

-- Tidak termasuk di sini: tp_kktp.batas_bawah dan batas_atas, serta kolom
-- rentang JSONB. Ketiganya menyimpan ambang KKTP, bukan nilai siswa, dan
-- aturannya berbeda — batas atas satu predikat bersambung dengan batas bawah
-- predikat berikutnya. Membatasinya menuntut pemeriksaan antar-baris, bukan
-- CHECK per kolom, dan itu keputusan tersendiri.
