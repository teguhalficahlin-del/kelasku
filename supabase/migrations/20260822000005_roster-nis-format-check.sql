-- 20260822000005_roster-nis-format-check.sql
-- Naikkan aturan format NIS dari klien ke database.
--
-- Aturan yang sudah berlaku di klien, dan yang ditegakkan di sini, adalah SATU
-- aturan yang sama: NIS berisi angka, tanpa batas panjang. Lihat
-- guru/js/classroom.js baris 279 (form manual) dan baris 336 (unggah CSV/Excel),
-- keduanya memakai /^\d+$/ yang sama persis. Yang kurang hanyalah penegakannya di
-- sisi server: PostgREST dapat dipanggil langsung dengan JWT guru, dan
-- pol_roster_guru_all tidak menyentuh isi kolom nis sama sekali.
--
-- KENAPA BUKAN '^[0-9]{8,18}$'. Panjang 8–18 digit adalah bentuk NIS/NISN resmi,
-- tetapi bukan yang dipakai di sini: dari 37 baris roster di proyek tertaut,
-- panjangnya 3 sampai 10 digit, dan hanya 5 baris yang akan lolos aturan 8–18.
-- Sisanya 32 baris — guru rupanya memakai nomor urut kelas, bukan NISN nasional.
-- Memaksakan aturan itu akan menolak UPDATE atas 32 baris yang sah dan memutus
-- pekerjaan yang sedang berjalan. Aturan panjang yang sesungguhnya, kalau memang
-- diinginkan, adalah keputusan produk yang harus didahului pembersihan data,
-- bukan efek samping migrasi format.
--
-- Batas atas 20 digit tetap dipasang sebagai pagar kewarasan: ia jauh di atas
-- nilai terpanjang yang ada (10) dan di atas NISN 10 digit maupun NIS sekolah
-- 18 digit, jadi tidak ada pemakaian nyata yang tersentuh, tetapi kolom text
-- tanpa batas tidak lagi dapat diisi ribuan digit.
--
-- YANG SUDAH ADA DAN TIDAK PERLU DIULANG: keunikan. UNIQUE (classroom_id, nis)
-- sudah terpasang sejak awal. Data mengonfirmasi bentuknya memang per-classroom,
-- bukan global: 37 baris, 36 nis unik secara global, 37 unik per classroom —
-- artinya ada satu nis yang sengaja dipakai di dua classroom berbeda. Menaikkan
-- keunikan menjadi global akan menolak data yang sudah ada.
--
-- Keadaan data sebelum migrasi (diperiksa di proyek tertaut): 37 baris, 0 kosong,
-- 0 non-numerik, 0 berspasi tepi, panjang 3–10. Tidak ada baris yang melanggar
-- aturan di bawah.

BEGIN;

-- NOT VALID sengaja TIDAK dipakai. Seluruh baris yang ada sudah memenuhi aturan
-- ini, jadi validasi penuh saat ADD CONSTRAINT tidak menolak apa pun, dan
-- constraint yang tervalidasi penuh lebih jujur dibaca daripada yang menyimpan
-- pengecualian diam-diam untuk baris lama.
ALTER TABLE classroom_roster
  ADD CONSTRAINT classroom_roster_nis_format_check
  CHECK (nis ~ '^[0-9]{1,20}$');

DO $$
DECLARE
  v_ada int;
BEGIN
  SELECT COUNT(*) INTO v_ada
  FROM pg_constraint
  WHERE conrelid = 'classroom_roster'::regclass
    AND conname  = 'classroom_roster_nis_format_check'
    AND contype  = 'c'
    AND convalidated;

  IF v_ada <> 1 THEN
    RAISE EXCEPTION
      'Constraint classroom_roster_nis_format_check tidak terpasang/tervalidasi — ROLLBACK';
  END IF;
END $$;

COMMIT;

-- Cakupan yang sengaja dibatasi:
--
-- full_name tidak diberi constraint di sini. Kolomnya NOT NULL tetapi string
-- kosong dan spasi-saja masih lolos; klien menyaringnya (parseRosterRows()
-- membuang baris tanpa full_name), jadi bentuk celahnya sama persis dengan nis.
-- Data saat ini bersih — 0 kosong, 0 spasi-saja, 0 spasi tepi. Ini pantas
-- dikerjakan, tetapi sebagai pokoknya sendiri, bukan disisipkan ke migrasi format
-- nis.
--
-- Batas panjang yang bermakna untuk NIS (mis. 8–18 digit sesuai NISN) tidak
-- dipasang — lihat alasannya di atas. Kalau kelak diputuskan, urutannya:
-- bersihkan 32 baris pendek lebih dulu, baru perketat, dan ubah /^\d+$/ di
-- guru/js/classroom.js pada commit yang sama agar klien dan server tidak berselisih.
