-- Migration: rancang_settings + rancang_dokumen
-- Dibuat: 2026-08-13

-- ── Tabel 1: Settings per classroom ─────────────────────────
CREATE TABLE IF NOT EXISTS rancang_settings (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id     uuid NOT NULL UNIQUE
                     REFERENCES classrooms(id) ON DELETE CASCADE,
  jenjang          text,
  mapel_key        text,
  mapel            text,
  fase             text,
  bidang_keahlian  text,
  program_keahlian text,
  elemen_terpilih  jsonb DEFAULT '[]'::jsonb,
  nama_guru        text,
  nip_guru         text,
  nama_kepsek      text,
  nip_kepsek       text,
  tahun_ajaran     text,
  semester         text,
  kota             text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- ── Tabel 2: Dokumen tersimpan ───────────────────────────────
CREATE TABLE IF NOT EXISTS rancang_dokumen (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id uuid NOT NULL
                 REFERENCES classrooms(id) ON DELETE CASCADE,
  jenis        text NOT NULL CHECK (jenis IN ('CP','TP','RPM')),
  judul        text NOT NULL,
  konten       jsonb NOT NULL DEFAULT '{}'::jsonb,
  tp_id        text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ── Index ────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_rancang_settings_classroom
  ON rancang_settings(classroom_id);
CREATE INDEX IF NOT EXISTS idx_rancang_dokumen_classroom
  ON rancang_dokumen(classroom_id);
CREATE INDEX IF NOT EXISTS idx_rancang_dokumen_jenis
  ON rancang_dokumen(classroom_id, jenis);

-- ── RLS ─────────────────────────────────────────────────────
ALTER TABLE rancang_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE rancang_dokumen  ENABLE ROW LEVEL SECURITY;

-- rancang_settings
DO $$ BEGIN
  CREATE POLICY "rancang_settings_select" ON rancang_settings
    FOR SELECT TO authenticated
    USING (fn_is_classroom_owner(classroom_id));
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "rancang_settings_insert" ON rancang_settings
    FOR INSERT TO authenticated
    WITH CHECK (fn_is_classroom_owner(classroom_id));
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "rancang_settings_update" ON rancang_settings
    FOR UPDATE TO authenticated
    USING (fn_is_classroom_owner(classroom_id))
    WITH CHECK (fn_is_classroom_owner(classroom_id));
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- rancang_dokumen
DO $$ BEGIN
  CREATE POLICY "rancang_dokumen_select" ON rancang_dokumen
    FOR SELECT TO authenticated
    USING (fn_is_classroom_owner(classroom_id));
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "rancang_dokumen_insert" ON rancang_dokumen
    FOR INSERT TO authenticated
    WITH CHECK (fn_is_classroom_owner(classroom_id));
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "rancang_dokumen_delete" ON rancang_dokumen
    FOR DELETE TO authenticated
    USING (fn_is_classroom_owner(classroom_id));
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── updated_at trigger untuk rancang_settings ────────────────
CREATE OR REPLACE FUNCTION fn_touch_rancang_settings()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rancang_settings_updated_at
  ON rancang_settings;
CREATE TRIGGER trg_rancang_settings_updated_at
  BEFORE UPDATE ON rancang_settings
  FOR EACH ROW EXECUTE FUNCTION fn_touch_rancang_settings();
