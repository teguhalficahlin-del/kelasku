-- Phase 1: locked role/tier, authorized teaching scope, Teaching Context, and classroom binding.
-- Additive migration: legacy authoring fields remain available during cutover.

BEGIN;

-- Four canonical authoring roles. Legacy values remain valid only while awaiting confirmation.
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_guru_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_guru_check CHECK (
  role_guru IS NULL OR role_guru IN (
    'WALI_KELAS',
    'GURU_MAPEL_SDSMP_SMA',
    'GURU_MAPEL_UMUM_SMK',
    'GURU_MAPEL_PRODUKTIF_SMK',
    'MAPEL',
    'WALI_KELAS_SD'
  )
);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role_locked_at timestamptz;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role_lock_version integer NOT NULL DEFAULT 1;

-- Existing two-role values are deliberately not promoted to canonical authorization.
-- They require an explicit declaration/confirmation through fn_declare_and_lock_role().

CREATE OR REPLACE FUNCTION fn_protect_profile_security_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') AND (
    NEW.role_guru IS DISTINCT FROM OLD.role_guru OR
    NEW.role_locked_at IS DISTINCT FROM OLD.role_locked_at OR
    NEW.role_lock_version IS DISTINCT FROM OLD.role_lock_version OR
    NEW.tier IS DISTINCT FROM OLD.tier
  ) THEN
    RAISE EXCEPTION 'role_guru dan tier hanya dapat diubah melalui transition server yang sah'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_protect_security_fields ON profiles;
CREATE TRIGGER trg_profiles_protect_security_fields
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION fn_protect_profile_security_fields();

CREATE OR REPLACE FUNCTION fn_declare_and_lock_role(
  p_role_guru text,
  p_confirmed boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pid uuid := fn_current_profile_id();
  v_profile profiles;
BEGIN
  IF v_pid IS NULL OR NOT COALESCE(p_confirmed, false) THEN
    RAISE EXCEPTION 'Konfirmasi eksplisit diperlukan' USING ERRCODE = '22023';
  END IF;
  IF p_role_guru NOT IN (
    'WALI_KELAS', 'GURU_MAPEL_SDSMP_SMA',
    'GURU_MAPEL_UMUM_SMK', 'GURU_MAPEL_PRODUKTIF_SMK'
  ) THEN
    RAISE EXCEPTION 'Role authoring tidak valid' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_profile FROM profiles WHERE id = v_pid AND role = 'GURU' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profil guru tidak ditemukan' USING ERRCODE = '42501'; END IF;
  IF v_profile.role_locked_at IS NOT NULL THEN
    IF v_profile.role_guru = p_role_guru THEN
      RETURN jsonb_build_object('role_guru', v_profile.role_guru, 'role_locked_at', v_profile.role_locked_at);
    END IF;
    RAISE EXCEPTION 'Role sudah dikunci; perubahan memerlukan otorisasi administratif'
      USING ERRCODE = '42501';
  END IF;

  UPDATE profiles
  SET role_guru = p_role_guru, role_locked_at = now()
  WHERE id = v_pid
  RETURNING * INTO v_profile;
  RETURN jsonb_build_object('role_guru', v_profile.role_guru, 'role_locked_at', v_profile.role_locked_at);
END;
$$;
REVOKE EXECUTE ON FUNCTION fn_declare_and_lock_role(text, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fn_declare_and_lock_role(text, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION fn_declare_and_lock_role(text, boolean) TO authenticated;

-- Remove the legacy side effect that allowed Step 0 payloads to mutate profiles.role_guru.
CREATE OR REPLACE FUNCTION fn_upsert_rancang_profil(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pid uuid := fn_current_profile_id();
  v_row rancang_profil;
BEGIN
  INSERT INTO rancang_profil (
    profile_id, jenjang, peran, mapel_list, mapel, mapel_key,
    bidang_keahlian, program_keahlian, elemen_terpilih,
    kelas, fase, jam_per_minggu, semester_list,
    nama_guru, nip_guru, nama_kepsek, nip_kepsek,
    tahun_ajaran, kota, is_locked
  ) VALUES (
    v_pid, p_payload->>'jenjang', NULLIF(p_payload->>'peran', ''),
    COALESCE((SELECT array_agg(x) FROM jsonb_array_elements_text(COALESCE(p_payload->'mapel_list', '[]'::jsonb)) x), '{}'),
    p_payload->>'mapel', p_payload->>'mapel_key',
    NULLIF(p_payload->>'bidang_keahlian', ''), NULLIF(p_payload->>'program_keahlian', ''),
    COALESCE((SELECT array_agg(x) FROM jsonb_array_elements_text(COALESCE(p_payload->'elemen_terpilih', '[]'::jsonb)) x), '{}'),
    p_payload->>'kelas', p_payload->>'fase', NULLIF(p_payload->>'jam_per_minggu', '')::integer,
    COALESCE((SELECT array_agg(x) FROM jsonb_array_elements_text(COALESCE(p_payload->'semester_list', '[]'::jsonb)) x), '{}'),
    NULLIF(p_payload->>'nama_guru', ''), NULLIF(p_payload->>'nip_guru', ''),
    NULLIF(p_payload->>'nama_kepsek', ''), NULLIF(p_payload->>'nip_kepsek', ''),
    NULLIF(p_payload->>'tahun_ajaran', ''), NULLIF(p_payload->>'kota', ''),
    COALESCE((p_payload->>'is_locked')::boolean, false)
  )
  ON CONFLICT (profile_id) DO UPDATE SET
    jenjang = EXCLUDED.jenjang, peran = EXCLUDED.peran,
    mapel_list = EXCLUDED.mapel_list, mapel = EXCLUDED.mapel, mapel_key = EXCLUDED.mapel_key,
    bidang_keahlian = EXCLUDED.bidang_keahlian, program_keahlian = EXCLUDED.program_keahlian,
    elemen_terpilih = EXCLUDED.elemen_terpilih, kelas = EXCLUDED.kelas, fase = EXCLUDED.fase,
    jam_per_minggu = EXCLUDED.jam_per_minggu, semester_list = EXCLUDED.semester_list,
    nama_guru = EXCLUDED.nama_guru, nip_guru = EXCLUDED.nip_guru,
    nama_kepsek = EXCLUDED.nama_kepsek, nip_kepsek = EXCLUDED.nip_kepsek,
    tahun_ajaran = EXCLUDED.tahun_ajaran, kota = EXCLUDED.kota,
    is_locked = EXCLUDED.is_locked
  RETURNING * INTO v_row;
  RETURN to_jsonb(v_row);
END;
$$;
REVOKE EXECUTE ON FUNCTION fn_upsert_rancang_profil(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fn_upsert_rancang_profil(jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION fn_upsert_rancang_profil(jsonb) TO authenticated;

CREATE TABLE IF NOT EXISTS authorized_teaching_scopes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  role_guru text NOT NULL CHECK (role_guru IN (
    'WALI_KELAS','GURU_MAPEL_SDSMP_SMA','GURU_MAPEL_UMUM_SMK','GURU_MAPEL_PRODUKTIF_SMK'
  )),
  jenjang text NOT NULL CHECK (jenjang IN ('SD','SMP','SMA','SMK')),
  subject_keys text[] NOT NULL CHECK (cardinality(subject_keys) > 0),
  bidang text,
  program_keahlian text,
  cp_dataset_revision text NOT NULL CHECK (cp_dataset_revision ~ '^[0-9a-f]{64}$'),
  status text NOT NULL DEFAULT 'LOCKED' CHECK (status IN ('LOCKED','REVOKED')),
  confirmation_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  locked_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((role_guru = 'GURU_MAPEL_PRODUKTIF_SMK') = (bidang IS NOT NULL AND program_keahlian IS NOT NULL)),
  CHECK (role_guru = 'WALI_KELAS' OR cardinality(subject_keys) = 1)
);

CREATE TABLE IF NOT EXISTS wali_home_classrooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  classroom_id uuid NOT NULL REFERENCES classrooms(id) ON DELETE RESTRICT,
  phase_key text NOT NULL CHECK (phase_key IN ('fase_a','fase_b','fase_c')),
  status text NOT NULL DEFAULT 'LOCKED' CHECK (status IN ('LOCKED','REVOKED')),
  locked_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_wali_home_classroom_active
  ON wali_home_classrooms(profile_id) WHERE status = 'LOCKED';

CREATE TABLE IF NOT EXISTS teaching_contexts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  teaching_scope_id uuid NOT NULL REFERENCES authorized_teaching_scopes(id) ON DELETE RESTRICT,
  role_guru text NOT NULL CHECK (role_guru IN (
    'WALI_KELAS','GURU_MAPEL_SDSMP_SMA','GURU_MAPEL_UMUM_SMK','GURU_MAPEL_PRODUKTIF_SMK'
  )),
  subject_key text NOT NULL,
  phase_key text NOT NULL CHECK (phase_key IN ('fase_a','fase_b','fase_c','fase_d','fase_e','fase_f')),
  jenjang text NOT NULL CHECK (jenjang IN ('SD','SMP','SMA','SMK')),
  bidang text,
  program_keahlian text,
  cp_dataset_revision text NOT NULL CHECK (cp_dataset_revision ~ '^[0-9a-f]{64}$'),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('DRAFT','ACTIVE','ARCHIVED')),
  authorization_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, subject_key, phase_key, bidang, program_keahlian, cp_dataset_revision)
);

CREATE TABLE IF NOT EXISTS teaching_context_classrooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teaching_context_id uuid NOT NULL REFERENCES teaching_contexts(id) ON DELETE CASCADE,
  classroom_id uuid NOT NULL REFERENCES classrooms(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE')),
  compatibility_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (teaching_context_id, classroom_id)
);

CREATE INDEX IF NOT EXISTS idx_teaching_contexts_profile ON teaching_contexts(profile_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_teaching_context_domain
  ON teaching_contexts (
    profile_id, subject_key, phase_key,
    COALESCE(bidang, ''), COALESCE(program_keahlian, ''), cp_dataset_revision
  );
CREATE INDEX IF NOT EXISTS idx_teaching_context_bindings_classroom ON teaching_context_classrooms(classroom_id);

ALTER TABLE authorized_teaching_scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE wali_home_classrooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE teaching_contexts ENABLE ROW LEVEL SECURITY;
ALTER TABLE teaching_context_classrooms ENABLE ROW LEVEL SECURITY;

-- New tables are not auto-exposed by this project's Supabase configuration.
-- Teachers may read their own rows through RLS, but all direct mutations remain server-only.
GRANT SELECT ON authorized_teaching_scopes TO authenticated;
GRANT SELECT ON wali_home_classrooms TO authenticated;
GRANT SELECT ON teaching_contexts TO authenticated;
GRANT SELECT ON teaching_context_classrooms TO authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON authorized_teaching_scopes, wali_home_classrooms,
     teaching_contexts, teaching_context_classrooms
  FROM authenticated;
REVOKE ALL
  ON authorized_teaching_scopes, wali_home_classrooms,
     teaching_contexts, teaching_context_classrooms
  FROM anon;

CREATE OR REPLACE FUNCTION fn_is_teaching_context_owner(p_teaching_context_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM teaching_contexts
    WHERE id = p_teaching_context_id
      AND profile_id = fn_current_profile_id()
  )
$$;
REVOKE EXECUTE ON FUNCTION fn_is_teaching_context_owner(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fn_is_teaching_context_owner(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION fn_is_teaching_context_owner(uuid) TO authenticated;

CREATE POLICY authorized_teaching_scopes_select_self ON authorized_teaching_scopes
  FOR SELECT TO authenticated USING (profile_id = fn_current_profile_id());
CREATE POLICY wali_home_classrooms_select_self ON wali_home_classrooms
  FOR SELECT TO authenticated USING (profile_id = fn_current_profile_id());
CREATE POLICY teaching_contexts_select_self ON teaching_contexts
  FOR SELECT TO authenticated USING (profile_id = fn_current_profile_id());
CREATE POLICY teaching_context_bindings_select_self ON teaching_context_classrooms
  FOR SELECT TO authenticated USING (fn_is_teaching_context_owner(teaching_context_id));

-- Trusted server write primitive. Canonical validation happens before this RPC in the Edge Function.
CREATE OR REPLACE FUNCTION fn_server_apply_teaching_foundation(
  p_profile_id uuid,
  p_scope jsonb,
  p_home_classroom_id uuid DEFAULT NULL,
  p_context jsonb DEFAULT NULL,
  p_target_classroom_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile profiles;
  v_scope authorized_teaching_scopes;
  v_context teaching_contexts;
  v_owner uuid;
BEGIN
  SELECT * INTO v_profile FROM profiles WHERE id = p_profile_id AND role = 'GURU' FOR UPDATE;
  IF NOT FOUND OR v_profile.role_locked_at IS NULL THEN
    RAISE EXCEPTION 'Locked teacher role diperlukan' USING ERRCODE = '42501';
  END IF;
  IF v_profile.role_guru IS DISTINCT FROM p_scope->>'role_guru' THEN
    RAISE EXCEPTION 'Scope tidak sesuai locked role' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_scope FROM authorized_teaching_scopes
  WHERE profile_id = p_profile_id FOR UPDATE;
  IF FOUND AND v_scope.status = 'LOCKED' THEN
    IF v_scope.role_guru IS DISTINCT FROM p_scope->>'role_guru'
       OR v_scope.jenjang IS DISTINCT FROM p_scope->>'jenjang'
       OR NOT (v_scope.subject_keys @> ARRAY(SELECT jsonb_array_elements_text(p_scope->'subject_keys'))
               AND v_scope.subject_keys <@ ARRAY(SELECT jsonb_array_elements_text(p_scope->'subject_keys')))
       OR v_scope.bidang IS DISTINCT FROM NULLIF(p_scope->>'bidang','')
       OR v_scope.program_keahlian IS DISTINCT FROM NULLIF(p_scope->>'program_keahlian','')
       OR v_scope.cp_dataset_revision IS DISTINCT FROM p_scope->>'cp_dataset_revision'
    THEN
      RAISE EXCEPTION 'Teaching scope sudah dikunci dan tidak dapat diperluas'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    INSERT INTO authorized_teaching_scopes (
      profile_id, role_guru, jenjang, subject_keys, bidang, program_keahlian,
      cp_dataset_revision, confirmation_payload
    ) VALUES (
      p_profile_id, p_scope->>'role_guru', p_scope->>'jenjang',
      ARRAY(SELECT jsonb_array_elements_text(p_scope->'subject_keys')),
      NULLIF(p_scope->>'bidang',''), NULLIF(p_scope->>'program_keahlian',''),
      p_scope->>'cp_dataset_revision', COALESCE(p_scope->'confirmation_payload','{}'::jsonb)
    )
    ON CONFLICT (profile_id) DO UPDATE SET
      role_guru = EXCLUDED.role_guru, jenjang = EXCLUDED.jenjang,
      subject_keys = EXCLUDED.subject_keys, bidang = EXCLUDED.bidang,
      program_keahlian = EXCLUDED.program_keahlian,
      cp_dataset_revision = EXCLUDED.cp_dataset_revision,
      confirmation_payload = EXCLUDED.confirmation_payload,
      status = 'LOCKED', locked_at = now(), updated_at = now()
    RETURNING * INTO v_scope;
  END IF;

  IF p_home_classroom_id IS NOT NULL THEN
    IF v_profile.role_guru <> 'WALI_KELAS' THEN RAISE EXCEPTION 'Home classroom hanya untuk wali'; END IF;
    SELECT teacher_id INTO v_owner FROM classrooms WHERE id = p_home_classroom_id;
    IF v_owner IS DISTINCT FROM p_profile_id THEN RAISE EXCEPTION 'Classroom bukan milik guru' USING ERRCODE = '42501'; END IF;
    IF EXISTS (
      SELECT 1 FROM wali_home_classrooms
      WHERE profile_id = p_profile_id AND status = 'LOCKED'
        AND classroom_id <> p_home_classroom_id
    ) THEN
      RAISE EXCEPTION 'Home classroom wali sudah dikunci' USING ERRCODE = '42501';
    END IF;
    INSERT INTO wali_home_classrooms(profile_id, classroom_id, phase_key)
    VALUES (p_profile_id, p_home_classroom_id, p_context->>'phase_key')
    ON CONFLICT (profile_id) WHERE status = 'LOCKED' DO NOTHING;
  END IF;

  IF p_context IS NOT NULL THEN
    INSERT INTO teaching_contexts (
      profile_id, teaching_scope_id, role_guru, subject_key, phase_key, jenjang,
      bidang, program_keahlian, cp_dataset_revision, authorization_metadata
    ) VALUES (
      p_profile_id, v_scope.id, v_profile.role_guru, p_context->>'subject_key',
      p_context->>'phase_key', p_context->>'jenjang', NULLIF(p_context->>'bidang',''),
      NULLIF(p_context->>'program_keahlian',''), p_scope->>'cp_dataset_revision',
      COALESCE(p_context->'authorization_metadata','{}'::jsonb)
    )
    ON CONFLICT (
      profile_id, subject_key, phase_key,
      COALESCE(bidang, ''), COALESCE(program_keahlian, ''), cp_dataset_revision
    )
    DO UPDATE SET status = 'ACTIVE', updated_at = now()
    RETURNING * INTO v_context;
  END IF;

  IF p_target_classroom_id IS NOT NULL THEN
    SELECT teacher_id INTO v_owner FROM classrooms WHERE id = p_target_classroom_id;
    IF v_owner IS DISTINCT FROM p_profile_id THEN RAISE EXCEPTION 'Classroom bukan milik guru' USING ERRCODE = '42501'; END IF;
    INSERT INTO teaching_context_classrooms(teaching_context_id, classroom_id, compatibility_metadata)
    VALUES (v_context.id, p_target_classroom_id, COALESCE(p_context->'compatibility_metadata','{}'::jsonb))
    ON CONFLICT (teaching_context_id, classroom_id) DO UPDATE SET status = 'ACTIVE';
  END IF;

  RETURN jsonb_build_object('scope_id', v_scope.id, 'teaching_context_id', v_context.id);
END;
$$;
REVOKE EXECUTE ON FUNCTION fn_server_apply_teaching_foundation(uuid,jsonb,uuid,jsonb,uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fn_server_apply_teaching_foundation(uuid,jsonb,uuid,jsonb,uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION fn_server_apply_teaching_foundation(uuid,jsonb,uuid,jsonb,uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION fn_server_apply_teaching_foundation(uuid,jsonb,uuid,jsonb,uuid) TO service_role;

COMMIT;

-- Rollback consideration: application can stop using the new tables immediately.
-- A database rollback should drop new policies/functions/tables and security trigger, then restore
-- the previous role constraint/function only after confirming no Phase 1 locked records are in use.
