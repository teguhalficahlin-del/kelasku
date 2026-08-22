-- 20260821000013_grade-recap-visibility.sql
-- Gate visibilitas rekap nilai: ikut flag publikasi penilaian.
--
-- Policy yang berlaku sebelum ini tidak menyebut visibilitas sama sekali:
--
--   gr_siswa_select  USING (fn_is_classroom_member(classroom_id)
--                           AND student_id IN (SELECT fn_current_roster_ids()))
--   gr_ortu_select   USING (fn_is_my_child_roster_in_classroom(classroom_id, student_id))
--
-- Keduanya hanya menjawab "baris ini milik saya / anak saya, di kelas ini".
-- Begitu guru menyimpan rekap, baris itu langsung terbaca siswa dan ortu lewat
-- REST, tanpa guru pernah menyatakan rekapnya siap diumumkan. Itu kebalikan
-- dari kendali yang sudah dipasang 20260820000006 untuk assessment_results, dan
-- membuat kendali itu bocor lewat pintu sebelah: nilai yang sengaja
-- disembunyikan di satu tabel tetap terbaca ringkasannya di tabel ini.
--
-- JALUR RELASI — perlu dijelaskan, sebab tidak langsung dan sempat salah
-- didiagnosis sebagai "tidak ada":
--
--   grade_recap.tp_kktp_id  --->  tp_kktp.id  <---  assessments.tp_kktp_id
--
-- grade_recap memang TIDAK punya kolom assessment_id, dan tidak pernah menunjuk
-- assessments secara langsung. Tetapi keduanya sama-sama menunjuk tp_kktp, dan
-- lewat situlah rekap dapat dipertemukan dengan penilaian yang membentuknya.
-- grade_recap.tp_kktp_id NOT NULL, jadi jalurnya selalu ada dari sisi rekap;
-- assessments.tp_kktp_id nullable, jadi penilaian yang belum ditautkan ke TP
-- tidak ikut memberi izin apa pun.
--
-- SEMANTIK "ADA", BUKAN "SEMUA" — ini keputusan, bukan kebetulan.
-- Satu tp_kktp dapat ditunjuk lebih dari satu assessment (dikonfirmasi di data:
-- ada 1 tp_kktp yang ditunjuk lebih dari satu assessment), sehingga hubungannya
-- satu-ke-banyak dan aturan agregasinya harus dipilih secara sadar. Dipakai
-- EXISTS — cukup ADA satu penilaian pada TP itu yang sudah dipublikasikan.
--
-- Alternatifnya, menuntut SEMUA penilaian pada TP itu visible, akan membuat
-- fitur ini praktis mati. Penilaian DIAGNOSTIK sengaja default tersembunyi dan
-- oleh 20260820000006 dinyatakan sebagai alat kerja guru yang memang tidak untuk
-- dibaca siswa; satu diagnostik saja pada sebuah TP akan mengunci rekap TP itu
-- selamanya, betapapun guru ingin mengumumkannya.
--
-- KEADAAN DATA SEBELUM MIGRASI INI (diperiksa di proyek tertaut):
--   grade_recap                     1 baris
--   assessments                     4 baris, keempatnya tp_kktp_id terisi
--   assessments is_visible_siswa    4 dari 4 true
--   assessments is_visible_ortu     4 dari 4 true
--   baris rekap yang menemukan penilaiannya lewat tp_kktp: 1 dari 1
--
-- Artinya tidak ada rekap yang hilang dari portal setelah migrasi ini, dan tidak
-- diperlukan backfill seperti yang dilakukan 20260820000006 — justru karena
-- backfill di sana sudah menyalakan keempat baris assessments itu.
--
-- Guru memang memegang sakelarnya: kendali is_visible_siswa/is_visible_ortu per
-- penilaian sudah tersedia di UI (asmt-vis-siswa / asmt-vis-ortu di
-- guru/js/classroom-assessment.js), jadi gate ini dapat dibuka-tutup guru tanpa
-- perlu pekerjaan UI tambahan.

BEGIN;

-- Adakah penilaian yang sudah dipublikasikan ke SISWA untuk TP ini, di classroom
-- ini?
--
-- classroom_id ikut diminta dan diperiksa, bukan sekadar tp_kktp_id. Dua
-- alasannya:
--   - mencegah penilaian di classroom lain yang kebetulan menunjuk TP yang sama
--     ikut membukakan rekap di classroom ini
--   - tanpa pengikatan itu, fungsi ini menjadi orakel yang menjawab status
--     publikasi sebuah TP bagi siapa pun yang memegang satu uuid; sama seperti
--     pertimbangan pada fn_guru_may_write_result di 20260821000012
--
-- Sesuai CLAUDE.md §11 dan AGENT_WORKING_RULES §5, pemeriksaan lintas tabel ini
-- ditempatkan di fungsi SECURITY DEFINER, bukan EXISTS mentah di dalam policy —
-- assessments ber-RLS, sehingga subquery biasa akan dievaluasi dengan visibilitas
-- si pemanggil dan bukan aturan yang dimaksud di sini.
CREATE OR REPLACE FUNCTION fn_recap_visible_siswa(
  p_classroom_id uuid,
  p_tp_kktp_id   uuid
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM assessments a
    WHERE a.tp_kktp_id       = p_tp_kktp_id
      AND a.classroom_id     = p_classroom_id
      AND a.is_visible_siswa = true
  );
$fn$;

REVOKE EXECUTE ON FUNCTION fn_recap_visible_siswa(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fn_recap_visible_siswa(uuid, uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION fn_recap_visible_siswa(uuid, uuid) TO authenticated;

-- Padanannya untuk orang tua. Sengaja dipisah dari versi siswa, bukan satu fungsi
-- dengan parameter peran: kedua flag itu berdiri sendiri di assessments, dan guru
-- memang dapat mengumumkan sebuah penilaian kepada ortu saja tanpa kepada siswa.
-- Menggabungkannya akan mengaburkan pilihan itu.
CREATE OR REPLACE FUNCTION fn_recap_visible_ortu(
  p_classroom_id uuid,
  p_tp_kktp_id   uuid
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM assessments a
    WHERE a.tp_kktp_id      = p_tp_kktp_id
      AND a.classroom_id    = p_classroom_id
      AND a.is_visible_ortu = true
  );
$fn$;

REVOKE EXECUTE ON FUNCTION fn_recap_visible_ortu(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fn_recap_visible_ortu(uuid, uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION fn_recap_visible_ortu(uuid, uuid) TO authenticated;

-- Kedua policy DIPERKETAT, bukan di-drop lalu dibuat ulang.
--
-- ALTER POLICY mengganti ekspresi USING pada objek policy yang sama, sehingga
-- policy-nya tidak pernah lenyap sekejap pun. DROP + CREATE akan membuka jendela
-- di dalam transaksi ini ketika tabel berada dalam keadaan default-deny bagi
-- siswa dan ortu — tidak berbahaya karena dibungkus transaksi, tetapi ALTER
-- menyatakan maksudnya lebih jujur: syarat lama dipertahankan utuh dan hanya
-- ditambahi satu syarat baru.
--
-- Dibungkus DO ... IF EXISTS agar migrasi tetap idempotent: ALTER POLICY pada
-- policy yang tidak ada akan menggagalkan seluruh migrasi.
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policy
             WHERE polrelid = 'grade_recap'::regclass AND polname = 'gr_siswa_select') THEN
    ALTER POLICY gr_siswa_select ON grade_recap
      USING (
        fn_is_classroom_member(classroom_id)
        AND student_id IN (SELECT fn_current_roster_ids())
        AND fn_recap_visible_siswa(classroom_id, tp_kktp_id)
      );
  ELSE
    RAISE EXCEPTION 'gr_siswa_select tidak ditemukan — periksa keadaan policy sebelum memperketat';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policy
             WHERE polrelid = 'grade_recap'::regclass AND polname = 'gr_ortu_select') THEN
    ALTER POLICY gr_ortu_select ON grade_recap
      USING (
        fn_is_my_child_roster_in_classroom(classroom_id, student_id)
        AND fn_recap_visible_ortu(classroom_id, tp_kktp_id)
      );
  ELSE
    RAISE EXCEPTION 'gr_ortu_select tidak ditemukan — periksa keadaan policy sebelum memperketat';
  END IF;
END
$do$;

COMMIT;

-- Cakupan yang sengaja dibatasi:
--
-- Keempat policy guru (gr_guru_select/insert/update/delete) tidak disentuh. Gate
-- ini soal apa yang boleh DIBACA siswa dan ortu; guru pemilik classroom harus
-- tetap melihat rekap yang belum ia umumkan — kalau tidak, ia tidak punya cara
-- memeriksanya sebelum memutuskan mengumumkan.
--
-- tp_kktp.is_visible_siswa / is_visible_ortu tidak dipakai sebagai gate di sini,
-- meski kolomnya ada dan ada UI-nya. Dua sebab: kendali per penilaian sudah
-- menjadi tempat keputusan publikasi sejak 20260820000006, dan ketiga baris
-- tp_kktp yang ada kini seluruhnya masih false — memakainya sebagai gate akan
-- menghilangkan seluruh rekap dari portal tanpa guru pernah mengubah apa pun.
