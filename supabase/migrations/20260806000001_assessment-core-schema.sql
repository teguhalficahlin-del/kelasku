-- Migration: 20260806000001_assessment-core-schema.sql
-- Tujuan: Buat schema core + semua tabel referensi kurikulum + RLS
-- Idempotent: CREATE IF NOT EXISTS, DO...EXCEPTION
-- Tidak ada seed di file ini — seed ada di 20260806000002

-- ============================================================
-- SCHEMA
-- ============================================================
CREATE SCHEMA IF NOT EXISTS core;

GRANT USAGE ON SCHEMA core TO authenticated;
GRANT USAGE ON SCHEMA core TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA core
  GRANT SELECT ON TABLES TO authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA core
  GRANT ALL ON TABLES TO service_role;

-- ============================================================
-- LOOKUP TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS core.curriculum_versions (
  version_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_code    VARCHAR(20) UNIQUE NOT NULL,
  name            TEXT NOT NULL,
  regulation_ref  TEXT NOT NULL,
  effective_from  DATE NOT NULL,
  effective_until DATE,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS core.education_levels (
  level_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code      VARCHAR(10) UNIQUE NOT NULL,
  name      TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS core.phases (
  phase_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  level_id    UUID NOT NULL REFERENCES core.education_levels(level_id),
  code        VARCHAR(5) NOT NULL,
  name        TEXT NOT NULL,
  grade_range VARCHAR(20),
  UNIQUE (level_id, code)
);

CREATE TABLE IF NOT EXISTS core.vocational_fields (
  field_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code      VARCHAR(10) UNIQUE NOT NULL,
  name      TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true
);

-- ============================================================
-- CURRICULUM TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS core.vocational_programs (
  program_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_id    UUID NOT NULL REFERENCES core.vocational_fields(field_id),
  code        VARCHAR(20) UNIQUE NOT NULL,
  name        TEXT NOT NULL,
  name_short  VARCHAR(50),
  is_active   BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS core.vocational_concentrations (
  concentration_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id       UUID NOT NULL REFERENCES core.vocational_programs(program_id),
  code             VARCHAR(20) UNIQUE NOT NULL,
  name             TEXT NOT NULL,
  is_active        BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS core.subjects (
  subject_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code             VARCHAR(30) UNIQUE NOT NULL,
  name             TEXT NOT NULL,
  subject_type     VARCHAR(30) NOT NULL CHECK (subject_type IN (
                     'UMUM', 'KEJURUAN_LINTAS_PRODI', 'KEJURUAN_DASAR',
                     'KEJURUAN_KONSENTRASI', 'KEJURUAN_PILIHAN', 'PKL', 'MUATAN_LOKAL'
                   )),
  program_id       UUID REFERENCES core.vocational_programs(program_id),
  concentration_id UUID REFERENCES core.vocational_concentrations(concentration_id),
  is_generatable   BOOLEAN NOT NULL DEFAULT true,
  is_active        BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS core.subject_phases (
  subject_phase_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id       UUID NOT NULL REFERENCES core.subjects(subject_id),
  phase_id         UUID NOT NULL REFERENCES core.phases(phase_id),
  version_id       UUID NOT NULL REFERENCES core.curriculum_versions(version_id),
  jp_per_week      INT,
  UNIQUE (subject_id, phase_id, version_id)
);

CREATE TABLE IF NOT EXISTS core.capaian_pembelajaran (
  cp_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_phase_id UUID NOT NULL REFERENCES core.subject_phases(subject_phase_id),
  version_id       UUID NOT NULL REFERENCES core.curriculum_versions(version_id),
  cp_code          VARCHAR(50),
  rasional         TEXT,
  tujuan           TEXT,
  karakteristik    TEXT,
  cp_umum          TEXT NOT NULL,
  display_order    INT NOT NULL DEFAULT 1,
  bskap_ref        VARCHAR(100),
  effective_date   DATE,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (subject_phase_id, version_id)
);

CREATE TABLE IF NOT EXISTS core.cp_elements (
  element_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cp_id         UUID NOT NULL REFERENCES core.capaian_pembelajaran(cp_id) ON DELETE CASCADE,
  element_order INT NOT NULL,
  nama_elemen   VARCHAR(200) NOT NULL,
  deskripsi_cp  TEXT NOT NULL,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (cp_id, element_order)
);

-- subject_name_mapping: peta kode mapel lokal → core.subjects
-- NULLS NOT DISTINCT agar NULLs diperlakukan sama dalam UNIQUE (Postgres 15+)
CREATE TABLE IF NOT EXISTS core.subject_name_mapping (
  mapping_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kode_pattern    TEXT NOT NULL,
  program_hint    TEXT,
  grade_level     SMALLINT,
  core_subject_id UUID NOT NULL REFERENCES core.subjects(subject_id),
  confidence      TEXT NOT NULL DEFAULT 'HIGH' CHECK (confidence IN ('HIGH','MEDIUM','LOW')),
  notes           TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  UNIQUE NULLS NOT DISTINCT (kode_pattern, program_hint, grade_level)
);

-- ============================================================
-- RLS — enable per tabel
-- ============================================================
DO $$ BEGIN ALTER TABLE core.curriculum_versions       ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN others THEN null; END $$;
DO $$ BEGIN ALTER TABLE core.education_levels          ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN others THEN null; END $$;
DO $$ BEGIN ALTER TABLE core.phases                    ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN others THEN null; END $$;
DO $$ BEGIN ALTER TABLE core.vocational_fields         ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN others THEN null; END $$;
DO $$ BEGIN ALTER TABLE core.vocational_programs       ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN others THEN null; END $$;
DO $$ BEGIN ALTER TABLE core.vocational_concentrations ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN others THEN null; END $$;
DO $$ BEGIN ALTER TABLE core.subjects                  ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN others THEN null; END $$;
DO $$ BEGIN ALTER TABLE core.subject_phases            ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN others THEN null; END $$;
DO $$ BEGIN ALTER TABLE core.capaian_pembelajaran      ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN others THEN null; END $$;
DO $$ BEGIN ALTER TABLE core.cp_elements               ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN others THEN null; END $$;
DO $$ BEGIN ALTER TABLE core.subject_name_mapping      ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN others THEN null; END $$;

-- RLS — SELECT policy untuk authenticated (semua tabel core = read-only)
DO $$ BEGIN CREATE POLICY "core_curriculum_versions_read"       ON core.curriculum_versions       FOR SELECT TO authenticated USING (true); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE POLICY "core_education_levels_read"          ON core.education_levels          FOR SELECT TO authenticated USING (true); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE POLICY "core_phases_read"                    ON core.phases                    FOR SELECT TO authenticated USING (true); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE POLICY "core_vocational_fields_read"         ON core.vocational_fields         FOR SELECT TO authenticated USING (true); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE POLICY "core_vocational_programs_read"       ON core.vocational_programs       FOR SELECT TO authenticated USING (true); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE POLICY "core_vocational_concentrations_read" ON core.vocational_concentrations FOR SELECT TO authenticated USING (true); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE POLICY "core_subjects_read"                  ON core.subjects                  FOR SELECT TO authenticated USING (true); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE POLICY "core_subject_phases_read"            ON core.subject_phases            FOR SELECT TO authenticated USING (true); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE POLICY "core_capaian_pembelajaran_read"      ON core.capaian_pembelajaran      FOR SELECT TO authenticated USING (true); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE POLICY "core_cp_elements_read"               ON core.cp_elements               FOR SELECT TO authenticated USING (true); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE POLICY "core_subject_name_mapping_read"      ON core.subject_name_mapping      FOR SELECT TO authenticated USING (true); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Tidak ada INSERT/UPDATE/DELETE policy untuk authenticated → default deny
-- service_role bypass RLS secara default di Supabase
