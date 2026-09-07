-- 20260908000001_rancang-profil-kelas.sql
-- Profil kelas: fakta yang melekat pada KELAS, bukan pada modul.
--
-- Spesifikasi perilaku lengkap: docs/SPEC-REVISI-ALUR-PERTANYAAN.md §3 dan §5b
--
-- MASALAHNYA. Dua fakta kelas hari ini ditanyakan di jalur Modul, sehingga guru
-- dengan enam modul menjawabnya enam kali — dan bisa menjawab berbeda-beda
-- untuk kelas yang sama. Lebih buruk: generate-atp tidak pernah menerimanya
-- sama sekali, sehingga ATP melahirkan TP seperti "Menyimak kosakata alat jahit
-- dari video tutorial" untuk kelas yang mungkin tanpa proyektor — lalu mesin
-- modul DILARANG menyebut video. Judul TP menuntut sesuatu yang isi modulnya
-- tidak boleh menyebut.
--
-- Satu fakta lagi belum pernah ditanyakan sama sekali: bahasa pengantar.
-- language_policy di ModulOutput V4.0 dihasilkan AI tanpa satu pun aturan di
-- SYSTEM_PROMPT dan tanpa satu pun masukan guru. Pada modul 7 September 2026 ia
-- memutuskan sendiri "Murid diarahkan menggunakan Bahasa Inggris penuh" untuk
-- kelas yang gurunya menyatakan muridnya "sedikit di bawah". Tiap generate bisa
-- berbeda, dan tidak ada yang akan tahu.
--
-- IDEMPOTEN: ADD COLUMN IF NOT EXISTS, constraint dibuat lewat DO block yang
-- memeriksa keberadaannya. Tidak ada DML terhadap data yang sudah ada; kedua
-- kolom nullable, sehingga baris lama tetap sah dan perilakunya tidak berubah
-- sampai guru menjawabnya.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. perlengkapan_kelas — apa yang benar-benar ada di ruang kelas
-- ---------------------------------------------------------------------------
-- jsonb, menyamai elemen_terpilih yang sudah ada di tabel ini. Isinya array
-- kunci: proyektor, laptop_guru, komputer_murid, hp_murid, internet, speaker,
-- lab, printer, tidak_ada.
--
-- Nilainya TIDAK dibatasi CHECK terhadap daftar kunci. Daftar perlengkapan
-- adalah hal yang wajar bertambah (mesin jahit, oven, alat las) begitu Tab
-- Rancang dibuka untuk guru produktif, dan constraint di sini akan menolak
-- tulisan dari klien yang lebih baru sementara migration-nya belum jalan —
-- kegagalan yang muncul di layar guru sebagai galat tanpa sebab. Yang dijaga
-- cukup bentuknya: harus array.
ALTER TABLE public.rancang_settings
  ADD COLUMN IF NOT EXISTS perlengkapan_kelas jsonb;

-- ---------------------------------------------------------------------------
-- 2. bahasa_pengantar — bahasa yang dipakai guru saat mengajar kelas ini
-- ---------------------------------------------------------------------------
-- Kuncinya SENGAJA generik ("target"), bukan menyebut Bahasa Inggris.
-- Keempat belas guru kohor pertama semuanya Bahasa Inggris, tapi gerbang Tab
-- Rancang berlaku untuk seluruh GURU_MAPEL_UMUM_SMK. Menanam 'inggris_penuh' di
-- sini berarti satu migration lagi begitu guru Bahasa Indonesia atau Bahasa
-- Jepang masuk. Klien yang menerjemahkan kunci ini ke label sesuai mapel.
ALTER TABLE public.rancang_settings
  ADD COLUMN IF NOT EXISTS bahasa_pengantar text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'rancang_settings_bahasa_pengantar_check'
  ) THEN
    ALTER TABLE public.rancang_settings
      ADD CONSTRAINT rancang_settings_bahasa_pengantar_check
      CHECK (bahasa_pengantar IS NULL OR bahasa_pengantar IN (
        'indonesia',          -- sepenuhnya bahasa Indonesia
        'indonesia_dominan',  -- Indonesia; bahasa target hanya untuk contoh dan latihan
        'campur',             -- penjelasan Indonesia, instruksi kelas bahasa target
        'target_dominan',     -- bahasa target sebagian besar waktu
        'target_penuh'        -- bahasa target sepenuhnya
      ));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'rancang_settings_perlengkapan_kelas_check'
  ) THEN
    ALTER TABLE public.rancang_settings
      ADD CONSTRAINT rancang_settings_perlengkapan_kelas_check
      CHECK (perlengkapan_kelas IS NULL
             OR jsonb_typeof(perlengkapan_kelas) = 'array');
  END IF;
END $$;

COMMENT ON COLUMN public.rancang_settings.perlengkapan_kelas IS
  'Array kunci perlengkapan yang benar-benar ada di kelas. Dibaca generate-modul '
  'dan generate-atp. Kosong/NULL = belum dijawab, perilaku jatuh ke penyimpulan lama.';

COMMENT ON COLUMN public.rancang_settings.bahasa_pengantar IS
  'Bahasa pengantar guru di kelas ini. Kunci generik ("target"), bukan nama bahasa — '
  'klien yang menerjemahkannya sesuai mapel. Dibaca generate-modul untuk language_policy.';

COMMIT;
