-- Migration: rancang_profil — data step 0 per akun guru
-- Tabel ini per profile_id (bukan classroom_id) agar semua classroom
-- milik guru yang sama berbagi profil yang sama.
-- Dibuat: 2026-08-16

-- ── Tabel rancang_profil ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rancang_profil (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id       uuid        NOT NULL UNIQUE
                               REFERENCES profiles(id) ON DELETE CASCADE,
  jenjang          text,
  peran            text        CHECK (peran IN ('WALI', 'MAPEL')),
  mapel_list       text[]      NOT NULL DEFAULT '{}',
  mapel            text,
  mapel_key        text,
  bidang_keahlian  text,
  program_keahlian text,
  kelas            text,
  fase             text,
  jam_per_minggu   integer,
  semester_list    text[]      NOT NULL DEFAULT '{}',
  nama_guru        text,
  nip_guru         text,
  nama_kepsek      text,
  nip_kepsek       text,
  tahun_ajaran     text,
  kota             text,
  is_locked        boolean     NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rancang_profil_profile
  ON rancang_profil(profile_id);

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE rancang_profil ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "rancang_profil_select" ON rancang_profil
    FOR SELECT TO authenticated
    USING (profile_id = fn_current_profile_id());
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "rancang_profil_insert" ON rancang_profil
    FOR INSERT TO authenticated
    WITH CHECK (profile_id = fn_current_profile_id());
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "rancang_profil_update" ON rancang_profil
    FOR UPDATE TO authenticated
    USING  (profile_id = fn_current_profile_id())
    WITH CHECK (profile_id = fn_current_profile_id());
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── updated_at trigger ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_touch_rancang_profil()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rancang_profil_updated_at ON rancang_profil;
CREATE TRIGGER trg_rancang_profil_updated_at
  BEFORE UPDATE ON rancang_profil
  FOR EACH ROW EXECUTE FUNCTION fn_touch_rancang_profil();

-- ── RPC: fn_get_rancang_profil ────────────────────────────────────────────────
-- Mengembalikan row rancang_profil milik guru yang sedang login.
CREATE OR REPLACE FUNCTION fn_get_rancang_profil()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pid uuid;
  v_row rancang_profil;
BEGIN
  v_pid := fn_current_profile_id();
  SELECT * INTO v_row FROM rancang_profil WHERE profile_id = v_pid;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN to_jsonb(v_row);
END;
$$;

REVOKE EXECUTE ON FUNCTION fn_get_rancang_profil() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fn_get_rancang_profil() FROM anon;
GRANT  EXECUTE ON FUNCTION fn_get_rancang_profil() TO authenticated;

-- ── RPC: fn_upsert_rancang_profil ─────────────────────────────────────────────
-- Upsert row rancang_profil untuk guru yang sedang login.
-- p_payload: jsonb dengan field sesuai tabel rancang_profil.
-- Side-effect: update role_guru di profiles jika p_payload->>'role_guru' ada.
CREATE OR REPLACE FUNCTION fn_upsert_rancang_profil(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pid uuid;
  v_row rancang_profil;
BEGIN
  v_pid := fn_current_profile_id();

  INSERT INTO rancang_profil (
    profile_id,
    jenjang, peran, mapel_list, mapel, mapel_key,
    bidang_keahlian, program_keahlian,
    kelas, fase, jam_per_minggu,
    semester_list,
    nama_guru, nip_guru, nama_kepsek, nip_kepsek,
    tahun_ajaran, kota,
    is_locked
  ) VALUES (
    v_pid,
    p_payload->>'jenjang',
    NULLIF(p_payload->>'peran', ''),
    COALESCE(
      (SELECT array_agg(x) FROM jsonb_array_elements_text(p_payload->'mapel_list') x),
      '{}'
    ),
    p_payload->>'mapel',
    p_payload->>'mapel_key',
    NULLIF(p_payload->>'bidang_keahlian', ''),
    NULLIF(p_payload->>'program_keahlian', ''),
    p_payload->>'kelas',
    p_payload->>'fase',
    NULLIF(p_payload->>'jam_per_minggu', '')::integer,
    COALESCE(
      (SELECT array_agg(x) FROM jsonb_array_elements_text(p_payload->'semester_list') x),
      '{}'
    ),
    NULLIF(p_payload->>'nama_guru', ''),
    NULLIF(p_payload->>'nip_guru', ''),
    NULLIF(p_payload->>'nama_kepsek', ''),
    NULLIF(p_payload->>'nip_kepsek', ''),
    NULLIF(p_payload->>'tahun_ajaran', ''),
    NULLIF(p_payload->>'kota', ''),
    COALESCE((p_payload->>'is_locked')::boolean, false)
  )
  ON CONFLICT (profile_id) DO UPDATE SET
    jenjang          = EXCLUDED.jenjang,
    peran            = EXCLUDED.peran,
    mapel_list       = EXCLUDED.mapel_list,
    mapel            = EXCLUDED.mapel,
    mapel_key        = EXCLUDED.mapel_key,
    bidang_keahlian  = EXCLUDED.bidang_keahlian,
    program_keahlian = EXCLUDED.program_keahlian,
    kelas            = EXCLUDED.kelas,
    fase             = EXCLUDED.fase,
    jam_per_minggu   = EXCLUDED.jam_per_minggu,
    semester_list    = EXCLUDED.semester_list,
    nama_guru        = EXCLUDED.nama_guru,
    nip_guru         = EXCLUDED.nip_guru,
    nama_kepsek      = EXCLUDED.nama_kepsek,
    nip_kepsek       = EXCLUDED.nip_kepsek,
    tahun_ajaran     = EXCLUDED.tahun_ajaran,
    kota             = EXCLUDED.kota,
    is_locked        = EXCLUDED.is_locked
  RETURNING * INTO v_row;

  -- Update role_guru di profiles jika dikirim
  IF (p_payload->>'role_guru') IS NOT NULL THEN
    UPDATE profiles
    SET role_guru = p_payload->>'role_guru'
    WHERE id = v_pid;
  END IF;

  RETURN to_jsonb(v_row);
END;
$$;

REVOKE EXECUTE ON FUNCTION fn_upsert_rancang_profil(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fn_upsert_rancang_profil(jsonb) FROM anon;
GRANT  EXECUTE ON FUNCTION fn_upsert_rancang_profil(jsonb) TO authenticated;
