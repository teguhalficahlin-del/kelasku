-- 20260908000002_atp-satu-kelas.sql
-- Satu ATP untuk satu kelas. Keputusan Romo 8 September 2026.
-- Spesifikasi lengkap: docs/SPEC-ATP-SATU-KELAS.md
--
-- MASALAHNYA. atp_induk melanggar prinsip yang ditulis CLAUDE.md §3 sendiri:
-- tenant anchor MIClass adalah classroom_id, dan tabel ini tidak punya.
-- Isolasinya bersandar pada guru_id. Lapisan kedua (atp_adaptasi) dibangun
-- untuk satu tujuan — satu ATP dipakai ulang di banyak kelas — dan tujuan itu
-- TIDAK PERNAH SEKALI PUN TERJADI: nol dari 19 atp_induk punya lebih dari satu
-- atp_adaptasi, dan modul_adaptasi nol baris.
--
-- Yang ada hanyalah biayanya, dan satu kelas cacat lahir langsung darinya:
-- karena atp_induk tidak punya classroom_id, generate-atp tidak bisa membaca
-- rancang_settings. Jalan keluarnya dulu adalah MEMOTRET profil kelas ke
-- collected_data — dan potret itu tidak pernah terjadi untuk kelas yang sudah
-- menjawab, sehingga nol ATP di produksi punya PROFIL_KELAS. Sesudah migration
-- ini, potret tidak lagi menjadi satu-satunya jalan.
--
-- NAMA TABEL SENGAJA TIDAK DIGANTI. "induk" jadi keliru begitu ia per kelas,
-- tapi mengganti nama menyentuh ~86 rujukan di 6 berkas BERSAMAAN dengan
-- perubahan makna — dua kelas risiko dalam satu langkah. Ganti nama adalah
-- sprint kosmetik tersendiri yang bisa dijalankan kapan saja tanpa mengubah
-- perilaku.
--
-- atp_adaptasi SENGAJA TIDAK DI-DROP. Kode berhenti menulis ke sana; tabelnya
-- ditinggalkan sebagai jaring pengaman. Seluruh isinya sudah diperiksa baris
-- per baris dan juga ada di atp_induk.collected_data — tapi "sudah diperiksa"
-- bukan alasan menghapus lebih cepat dari perlunya.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Kolom kelas
-- ---------------------------------------------------------------------------
-- ON DELETE CASCADE menyamai rancang_settings, schedules, dan tp_kktp — pola
-- rumah untuk tabel fitur ber-classroom_id. atp_adaptasi memakai NO ACTION,
-- yang justru MENGHALANGI guru menghapus kelasnya sendiri; itu kelalaian dan
-- tidak diikutkan ke sini.
ALTER TABLE public.atp_induk
  ADD COLUMN IF NOT EXISTS classroom_id uuid
    REFERENCES public.classrooms(id) ON DELETE CASCADE;

-- ---------------------------------------------------------------------------
-- 2. Backfill dari lapisan kedua
-- ---------------------------------------------------------------------------
UPDATE public.atp_induk i
   SET classroom_id = a.classroom_id
  FROM public.atp_adaptasi a
 WHERE a.atp_induk_id = i.id
   AND i.classroom_id IS NULL;

-- ---------------------------------------------------------------------------
-- 3. Buang draf terbengkalai (Keputusan Romo)
-- ---------------------------------------------------------------------------
-- DUA syarat, keduanya wajib: tidak punya kelas DAN tidak dirujuk modul mana
-- pun. Menghapus ATP yang punya modul akan membuat modul yatim — sudah diukur
-- nol, tapi syaratnya tetap ditulis supaya migration ini aman dijalankan di
-- keadaan data yang berbeda.
DELETE FROM public.atp_induk i
 WHERE i.classroom_id IS NULL
   AND NOT EXISTS (SELECT 1 FROM public.modul_induk m WHERE m.atp_induk_id = i.id);

-- ---------------------------------------------------------------------------
-- 4. NOT NULL
-- ---------------------------------------------------------------------------
-- Sesudah langkah 2 dan 3 tidak boleh ada lagi baris tanpa kelas. Kalau masih
-- ada, migration ini HARUS gagal dan bukan diam-diam melanjutkan: baris tanpa
-- kelas adalah baris yang tidak bisa diisolasi policy mana pun.
ALTER TABLE public.atp_induk
  ALTER COLUMN classroom_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_atp_induk_kelas
  ON public.atp_induk (classroom_id, status, updated_at DESC);

-- ---------------------------------------------------------------------------
-- 5. RLS — dari guru_id ke fn_is_classroom_owner
-- ---------------------------------------------------------------------------
-- Isolasi MENYEMPIT: dari "seluruh ATP milik guru ini" menjadi "ATP kelas ini".
-- guru_id DIPERTAHANKAN di tabel — CLAUDE.md §3: teacher_id didenormalisasi ke
-- setiap tabel fitur, jangan dihapus.
--
-- INSERT menuntut KEDUANYA: guru_id harus diri sendiri DAN kelasnya harus
-- miliknya. Tanpa syarat pertama, guru bisa menuliskan guru_id orang lain ke
-- ATP kelasnya sendiri dan mengotori denormalisasi itu.
DROP POLICY IF EXISTS pol_atp_induk_select ON public.atp_induk;
DROP POLICY IF EXISTS pol_atp_induk_insert ON public.atp_induk;
DROP POLICY IF EXISTS pol_atp_induk_update ON public.atp_induk;
DROP POLICY IF EXISTS pol_atp_induk_delete ON public.atp_induk;

CREATE POLICY pol_atp_induk_select ON public.atp_induk
  FOR SELECT TO authenticated
  USING (public.fn_is_classroom_owner(classroom_id));

-- fn_is_guru_role() DIPERTAHANKAN di INSERT dan UPDATE.
--
-- Penjaga ini dipasang migration 20260829000002 dan TIDAK terlihat di
-- spesifikasi awal — ia baru ketahuan saat policy aktual dibaca dari basis
-- data sebelum apply. Menulis ulang policy tanpa menyalinnya akan mencabut
-- penjaga peran diam-diam: siswa atau ortu yang memegang JWT bisa menulis ATP
-- asalkan kelasnya cocok. Tidak ada yang akan mengeluh sampai ada yang mencoba.
CREATE POLICY pol_atp_induk_insert ON public.atp_induk
  FOR INSERT TO authenticated
  WITH CHECK (guru_id = public.fn_current_profile_id()
              AND public.fn_is_guru_role()
              AND public.fn_is_classroom_owner(classroom_id));

CREATE POLICY pol_atp_induk_update ON public.atp_induk
  FOR UPDATE TO authenticated
  USING (public.fn_is_classroom_owner(classroom_id))
  WITH CHECK (public.fn_is_guru_role()
              AND public.fn_is_classroom_owner(classroom_id));

CREATE POLICY pol_atp_induk_delete ON public.atp_induk
  FOR DELETE TO authenticated
  USING (public.fn_is_classroom_owner(classroom_id));

COMMENT ON COLUMN public.atp_induk.classroom_id IS
  'Kelas pemilik ATP ini. Satu ATP = satu kelas (8 Sep 2026). Nama tabel masih '
  'menyebut "induk" karena warisan lapisan dua yang dibuang — lihat komentar di '
  'kepala migration 20260908000002.';

COMMIT;
