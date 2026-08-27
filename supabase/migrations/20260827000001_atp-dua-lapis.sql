-- ATP dua lapis: ATP induk lintas kelas dan adaptasi pelaksanaan per classroom.
-- Tidak ada helper baru: policy memakai fn_current_profile_id(),
-- fn_is_classroom_owner(), dan fn_guru_is_active() yang sudah SECURITY DEFINER.

BEGIN;

CREATE TABLE IF NOT EXISTS public.atp_induk (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guru_id         uuid NOT NULL REFERENCES public.profiles(id),
  mapel           text NOT NULL,
  fase            text NOT NULL,
  jenjang         text NOT NULL,
  elemen_cp       jsonb NOT NULL DEFAULT '[]'::jsonb,
  target_fase     text,
  progresi_tp     jsonb NOT NULL DEFAULT '[]'::jsonb,
  prioritas       jsonb NOT NULL DEFAULT '[]'::jsonb,
  status          text NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'aktif', 'arsip')),
  collected_data  jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, guru_id)
);

CREATE TABLE IF NOT EXISTS public.atp_adaptasi (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  atp_induk_id    uuid NOT NULL REFERENCES public.atp_induk(id) ON DELETE CASCADE,
  guru_id         uuid NOT NULL REFERENCES public.profiles(id),
  classroom_id    uuid NOT NULL REFERENCES public.classrooms(id),
  konteks_dudi    jsonb NOT NULL DEFAULT '{}'::jsonb,
  profil_siswa    jsonb NOT NULL DEFAULT '{}'::jsonb,
  alokasi_waktu   jsonb NOT NULL DEFAULT '{}'::jsonb,
  status          text NOT NULL DEFAULT 'sementara'
                  CHECK (status IN ('sementara', 'dikonfirmasi', 'arsip')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (atp_induk_id, classroom_id),
  FOREIGN KEY (atp_induk_id, guru_id)
    REFERENCES public.atp_induk(id, guru_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_atp_induk_lookup
  ON public.atp_induk (guru_id, mapel, fase, jenjang, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_atp_adaptasi_guru_classroom
  ON public.atp_adaptasi (guru_id, classroom_id, updated_at DESC);

CREATE OR REPLACE TRIGGER trg_atp_induk_updated_at
  BEFORE UPDATE ON public.atp_induk
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

CREATE OR REPLACE TRIGGER trg_atp_adaptasi_updated_at
  BEFORE UPDATE ON public.atp_adaptasi
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

ALTER TABLE public.atp_induk ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atp_adaptasi ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pol_atp_induk_select ON public.atp_induk;
DROP POLICY IF EXISTS pol_atp_induk_insert ON public.atp_induk;
DROP POLICY IF EXISTS pol_atp_induk_update ON public.atp_induk;
DROP POLICY IF EXISTS pol_atp_induk_delete ON public.atp_induk;

CREATE POLICY pol_atp_induk_select ON public.atp_induk
  FOR SELECT TO authenticated
  USING (guru_id = public.fn_current_profile_id());

CREATE POLICY pol_atp_induk_insert ON public.atp_induk
  FOR INSERT TO authenticated
  WITH CHECK (guru_id = public.fn_current_profile_id());

CREATE POLICY pol_atp_induk_update ON public.atp_induk
  FOR UPDATE TO authenticated
  USING (guru_id = public.fn_current_profile_id())
  WITH CHECK (guru_id = public.fn_current_profile_id());

CREATE POLICY pol_atp_induk_delete ON public.atp_induk
  FOR DELETE TO authenticated
  USING (guru_id = public.fn_current_profile_id());

DROP POLICY IF EXISTS pol_atp_adaptasi_select ON public.atp_adaptasi;
DROP POLICY IF EXISTS pol_atp_adaptasi_insert ON public.atp_adaptasi;
DROP POLICY IF EXISTS pol_atp_adaptasi_update ON public.atp_adaptasi;
DROP POLICY IF EXISTS pol_atp_adaptasi_delete ON public.atp_adaptasi;

CREATE POLICY pol_atp_adaptasi_select ON public.atp_adaptasi
  FOR SELECT TO authenticated
  USING (
    guru_id = public.fn_current_profile_id()
    AND public.fn_is_classroom_owner(classroom_id)
  );

CREATE POLICY pol_atp_adaptasi_insert ON public.atp_adaptasi
  FOR INSERT TO authenticated
  WITH CHECK (
    guru_id = public.fn_current_profile_id()
    AND public.fn_is_classroom_owner(classroom_id)
  );

CREATE POLICY pol_atp_adaptasi_update ON public.atp_adaptasi
  FOR UPDATE TO authenticated
  USING (
    guru_id = public.fn_current_profile_id()
    AND public.fn_is_classroom_owner(classroom_id)
  )
  WITH CHECK (
    guru_id = public.fn_current_profile_id()
    AND public.fn_is_classroom_owner(classroom_id)
  );

CREATE POLICY pol_atp_adaptasi_delete ON public.atp_adaptasi
  FOR DELETE TO authenticated
  USING (
    guru_id = public.fn_current_profile_id()
    AND public.fn_is_classroom_owner(classroom_id)
  );

DROP POLICY IF EXISTS trial_guard_insert ON public.atp_induk;
DROP POLICY IF EXISTS trial_guard_update ON public.atp_induk;
DROP POLICY IF EXISTS trial_guard_delete ON public.atp_induk;

CREATE POLICY trial_guard_insert ON public.atp_induk AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (public.fn_guru_is_active());

CREATE POLICY trial_guard_update ON public.atp_induk AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING (public.fn_guru_is_active())
  WITH CHECK (public.fn_guru_is_active());

CREATE POLICY trial_guard_delete ON public.atp_induk AS RESTRICTIVE
  FOR DELETE TO authenticated
  USING (public.fn_guru_is_active());

DROP POLICY IF EXISTS trial_guard_insert ON public.atp_adaptasi;
DROP POLICY IF EXISTS trial_guard_update ON public.atp_adaptasi;
DROP POLICY IF EXISTS trial_guard_delete ON public.atp_adaptasi;

CREATE POLICY trial_guard_insert ON public.atp_adaptasi AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (public.fn_guru_is_active());

CREATE POLICY trial_guard_update ON public.atp_adaptasi AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING (public.fn_guru_is_active())
  WITH CHECK (public.fn_guru_is_active());

CREATE POLICY trial_guard_delete ON public.atp_adaptasi AS RESTRICTIVE
  FOR DELETE TO authenticated
  USING (public.fn_guru_is_active());

REVOKE ALL ON TABLE public.atp_induk FROM anon;
REVOKE ALL ON TABLE public.atp_adaptasi FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.atp_induk TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.atp_adaptasi TO authenticated;

COMMIT;
