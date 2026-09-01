BEGIN;

-- Tambah nilai 'generating' dan 'error' ke CHECK constraint modul_induk.status
-- Diperlukan oleh arsitektur async generate-modul:
-- draft → generating (saat EF mulai) → aktif (berhasil) atau error (gagal)

ALTER TABLE public.modul_induk
  DROP CONSTRAINT modul_induk_status_check;

ALTER TABLE public.modul_induk
  ADD CONSTRAINT modul_induk_status_check
    CHECK (status = ANY (ARRAY[
      'draft'::text,
      'generating'::text,
      'aktif'::text,
      'arsip'::text,
      'error'::text
    ]));

COMMIT;
