-- 20260822000006_roster-full-name-nonempty-check.sql
-- Tutup celah full_name yang sebentuk dengan celah nis.
--
-- classroom_roster.full_name sudah NOT NULL, tetapi NOT NULL tidak menolak
-- string kosong maupun spasi-saja. Yang menahannya selama ini hanya klien, dan
-- penahannya tipis: jalur unggah CSV/Excel men-trim lalu membuang baris tanpa
-- nama (guru/js/classroom.js baris 331 dan 336), sedangkan form manual hanya
-- mengandalkan atribut `required` di HTML — blok validasinya (baris 279) cuma
-- memeriksa nis. Keduanya berjalan di browser. PostgREST dapat dipanggil
-- langsung dengan JWT guru, dan pol_roster_guru_all tidak menyentuh isi kolom
-- full_name sama sekali, jadi INSERT dengan full_name = '' saat ini diterima.
-- Ini persis bentuk celah yang ditutup 20260822000005 untuk nis, dan sengaja
-- dikerjakan sebagai pokoknya sendiri seperti dicatat di penutup migrasi itu.
--
-- KENAPA BUKAN REGEX KARAKTER. Untuk nis, aturan '^[0-9]+$' sah karena itu
-- memang aturan yang sudah berlaku di klien. Untuk full_name tidak ada aturan
-- format apa pun di klien yang bisa dinaikkan — yang ada hanya "tidak kosong
-- setelah trim". Membuat regex daftar-putih karakter di sini berarti mengarang
-- aturan baru, bukan menegakkan yang lama. Kebetulan seluruh 37 nama yang ada
-- lolos '^[A-Za-z .''-]+$', tetapi kecocokan itu menyesatkan: nama Indonesia
-- wajar mengandung diakritik, dan aksara non-Latin bukan hal mustahil. Aturan
-- semacam itu akan menolak data sah yang belum sempat masuk. Yang dipasang di
-- sini adalah pagar kewarasan, bukan validator format.
--
-- Batas atas 100 karakter dipilih dengan cara yang sama seperti batas 20 digit
-- pada nis: jauh di atas nilai terpanjang yang ada (27), jadi tidak ada
-- pemakaian nyata yang tersentuh, tetapi kolom text tanpa batas tidak lagi
-- dapat diisi ribuan karakter.
--
-- Batas bawah 2 karakter, bukan 1. Nama satu huruf bukan nama; ambangnya tetap
-- jauh di bawah nilai terpendek yang ada (4), jadi ia tidak menolak apa pun
-- yang sekarang ada di tabel.
--
-- Keadaan data sebelum migrasi (diperiksa di proyek tertaut): 37 baris,
-- 0 kosong, 0 spasi-saja, 0 berspasi tepi, panjang setelah TRIM 4–27,
-- 0 baris yang akan ditolak aturan di bawah.

BEGIN;

-- NOT VALID sengaja TIDAK dipakai, alasan sama seperti pada migrasi nis:
-- seluruh baris yang ada sudah memenuhi aturan ini, jadi validasi penuh saat
-- ADD CONSTRAINT tidak menolak apa pun, dan constraint yang tervalidasi penuh
-- lebih jujur dibaca daripada yang menyimpan pengecualian diam-diam.
ALTER TABLE classroom_roster
  ADD CONSTRAINT classroom_roster_full_name_nonempty_check
  CHECK (LENGTH(TRIM(full_name)) >= 2 AND LENGTH(full_name) <= 100);

DO $$
DECLARE
  v_ada int;
BEGIN
  SELECT COUNT(*) INTO v_ada
  FROM pg_constraint
  WHERE conrelid = 'classroom_roster'::regclass
    AND conname  = 'classroom_roster_full_name_nonempty_check'
    AND contype  = 'c'
    AND convalidated;

  IF v_ada <> 1 THEN
    RAISE EXCEPTION
      'Constraint classroom_roster_full_name_nonempty_check tidak terpasang/tervalidasi — ROLLBACK';
  END IF;
END $$;

COMMIT;

-- Cakupan yang sengaja dibatasi:
--
-- TRIM tanpa argumen hanya membuang spasi, bukan tab atau baris baru. Nilai
-- seperti E'\t\t' karena itu masih lolos aturan di atas. Ini disadari dan
-- dibiarkan: menutupnya menuntut keputusan tentang normalisasi whitespace yang
-- semestinya berlaku seragam untuk full_name dan nama_ortu sekaligus, dan itu
-- pokok tersendiri. Yang ditutup di sini adalah bentuk celah yang benar-benar
-- terjangkau lewat form dan unggahan, yaitu kosong dan spasi-saja.
--
-- nama_ortu tidak diberi constraint di sini. Kolomnya nullable dan NULL memang
-- bentuk sah untuk "ortu belum didata", jadi aturannya bukan cerminan langsung
-- dari aturan full_name dan tidak pantas dititipkan ke migrasi ini.
--
-- Klien tidak diubah pada commit ini, dan tidak perlu: aturan di sini lebih
-- longgar daripada yang sudah disaring klien, jadi tidak ada perselisihan antara
-- keduanya. Kalau kelak batas bawah dinaikkan melewati apa yang klien saring,
-- guru/js/classroom.js harus ikut diubah pada commit yang sama.
