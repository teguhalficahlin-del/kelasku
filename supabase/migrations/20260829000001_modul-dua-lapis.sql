-- Modul Ajar dua lapis: modul induk lintas kelas dan adaptasi pelaksanaan per classroom.
-- Pola identik dengan atp-dua-lapis.sql: RLS, trigger, index, constraint, REVOKE/GRANT.
-- Tidak ada helper baru: policy memakai fn_current_profile_id(),
-- fn_is_classroom_owner(), dan fn_guru_is_active() yang sudah SECURITY DEFINER.

BEGIN;

CREATE TABLE IF NOT EXISTS public.modul_induk (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guru_id         uuid NOT NULL REFERENCES public.profiles(id),
  atp_induk_id    uuid NOT NULL REFERENCES public.atp_induk(id) ON DELETE CASCADE,
  nomor_tp        int NOT NULL,
  tp_judul        text NOT NULL,
  konten          jsonb NOT NULL DEFAULT '{}'::jsonb,
  collected_data  jsonb NOT NULL DEFAULT '{}'::jsonb,
  status          text NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'aktif', 'arsip')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  -- Untuk FK composite dari modul_adaptasi (wajib, mengikuti pola atp_induk)
  UNIQUE (id, guru_id),
  -- Satu modul per TP per ATP per guru — generate-modul wajib arsipkan dulu
  -- modul lama sebelum INSERT yang baru
  UNIQUE (guru_id, atp_induk_id, nomor_tp)
);

CREATE TABLE IF NOT EXISTS public.modul_adaptasi (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  modul_induk_id      uuid NOT NULL REFERENCES public.modul_induk(id) ON DELETE CASCADE,
  guru_id             uuid NOT NULL REFERENCES public.profiles(id),
  classroom_id        uuid NOT NULL REFERENCES public.classrooms(id),
  konteks_kelas       jsonb NOT NULL DEFAULT '{}'::jsonb,
  catatan_pelaksanaan jsonb NOT NULL DEFAULT '{}'::jsonb,
  status              text NOT NULL DEFAULT 'sementara'
                      CHECK (status IN ('sementara', 'dikonfirmasi', 'arsip')),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (modul_induk_id, classroom_id),
  FOREIGN KEY (modul_induk_id, guru_id)
    REFERENCES public.modul_induk(id, guru_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_modul_induk_lookup
  ON public.modul_induk (guru_id, atp_induk_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_modul_adaptasi_guru_classroom
  ON public.modul_adaptasi (guru_id, classroom_id, updated_at DESC);

CREATE OR REPLACE TRIGGER trg_modul_induk_updated_at
  BEFORE UPDATE ON public.modul_induk
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

CREATE OR REPLACE TRIGGER trg_modul_adaptasi_updated_at
  BEFORE UPDATE ON public.modul_adaptasi
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

ALTER TABLE public.modul_induk ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.modul_adaptasi ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pol_modul_induk_select ON public.modul_induk;
DROP POLICY IF EXISTS pol_modul_induk_insert ON public.modul_induk;
DROP POLICY IF EXISTS pol_modul_induk_update ON public.modul_induk;
DROP POLICY IF EXISTS pol_modul_induk_delete ON public.modul_induk;

CREATE POLICY pol_modul_induk_select ON public.modul_induk
  FOR SELECT TO authenticated
  USING (guru_id = public.fn_current_profile_id());

CREATE POLICY pol_modul_induk_insert ON public.modul_induk
  FOR INSERT TO authenticated
  WITH CHECK (guru_id = public.fn_current_profile_id());

CREATE POLICY pol_modul_induk_update ON public.modul_induk
  FOR UPDATE TO authenticated
  USING (guru_id = public.fn_current_profile_id())
  WITH CHECK (guru_id = public.fn_current_profile_id());

CREATE POLICY pol_modul_induk_delete ON public.modul_induk
  FOR DELETE TO authenticated
  USING (guru_id = public.fn_current_profile_id());

DROP POLICY IF EXISTS pol_modul_adaptasi_select ON public.modul_adaptasi;
DROP POLICY IF EXISTS pol_modul_adaptasi_insert ON public.modul_adaptasi;
DROP POLICY IF EXISTS pol_modul_adaptasi_update ON public.modul_adaptasi;
DROP POLICY IF EXISTS pol_modul_adaptasi_delete ON public.modul_adaptasi;

CREATE POLICY pol_modul_adaptasi_select ON public.modul_adaptasi
  FOR SELECT TO authenticated
  USING (
    guru_id = public.fn_current_profile_id()
    AND public.fn_is_classroom_owner(classroom_id)
  );

CREATE POLICY pol_modul_adaptasi_insert ON public.modul_adaptasi
  FOR INSERT TO authenticated
  WITH CHECK (
    guru_id = public.fn_current_profile_id()
    AND public.fn_is_classroom_owner(classroom_id)
  );

CREATE POLICY pol_modul_adaptasi_update ON public.modul_adaptasi
  FOR UPDATE TO authenticated
  USING (
    guru_id = public.fn_current_profile_id()
    AND public.fn_is_classroom_owner(classroom_id)
  )
  WITH CHECK (
    guru_id = public.fn_current_profile_id()
    AND public.fn_is_classroom_owner(classroom_id)
  );

CREATE POLICY pol_modul_adaptasi_delete ON public.modul_adaptasi
  FOR DELETE TO authenticated
  USING (
    guru_id = public.fn_current_profile_id()
    AND public.fn_is_classroom_owner(classroom_id)
  );

DROP POLICY IF EXISTS trial_guard_insert ON public.modul_induk;
DROP POLICY IF EXISTS trial_guard_update ON public.modul_induk;
DROP POLICY IF EXISTS trial_guard_delete ON public.modul_induk;

CREATE POLICY trial_guard_insert ON public.modul_induk AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (public.fn_guru_is_active());

CREATE POLICY trial_guard_update ON public.modul_induk AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING (public.fn_guru_is_active())
  WITH CHECK (public.fn_guru_is_active());

CREATE POLICY trial_guard_delete ON public.modul_induk AS RESTRICTIVE
  FOR DELETE TO authenticated
  USING (public.fn_guru_is_active());

DROP POLICY IF EXISTS trial_guard_insert ON public.modul_adaptasi;
DROP POLICY IF EXISTS trial_guard_update ON public.modul_adaptasi;
DROP POLICY IF EXISTS trial_guard_delete ON public.modul_adaptasi;

CREATE POLICY trial_guard_insert ON public.modul_adaptasi AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (public.fn_guru_is_active());

CREATE POLICY trial_guard_update ON public.modul_adaptasi AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING (public.fn_guru_is_active())
  WITH CHECK (public.fn_guru_is_active());

CREATE POLICY trial_guard_delete ON public.modul_adaptasi AS RESTRICTIVE
  FOR DELETE TO authenticated
  USING (public.fn_guru_is_active());

REVOKE ALL ON TABLE public.modul_induk FROM anon;
REVOKE ALL ON TABLE public.modul_adaptasi FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.modul_induk TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.modul_adaptasi TO authenticated;

COMMIT;
