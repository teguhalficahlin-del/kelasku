-- Migration: add classroom_roster + nis column on profiles
-- ADR-002: whitelist siswa, join via NIS

-- Tabel whitelist siswa per classroom
CREATE TABLE classroom_roster (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id  uuid NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
  teacher_id    uuid NOT NULL REFERENCES profiles(id),
  full_name     text NOT NULL,
  nis           text NOT NULL,
  profile_id    uuid REFERENCES profiles(id),
  created_at    timestamptz NOT NULL DEFAULT now(),

  UNIQUE (classroom_id, nis)
);

-- Index untuk lookup NIS saat siswa join
CREATE INDEX idx_roster_classroom ON classroom_roster(classroom_id);
CREATE INDEX idx_roster_nis ON classroom_roster(classroom_id, nis);
CREATE INDEX idx_roster_profile ON classroom_roster(profile_id)
  WHERE profile_id IS NOT NULL;

-- Kolom nis di profiles — diisi saat siswa buat akun
ALTER TABLE profiles ADD COLUMN nis text;

-- RLS classroom_roster
ALTER TABLE classroom_roster ENABLE ROW LEVEL SECURITY;

-- Guru: full CRUD untuk roster di classroom miliknya
CREATE POLICY pol_roster_guru_all ON classroom_roster
  FOR ALL
  TO authenticated
  USING (teacher_id = fn_current_profile_id())
  WITH CHECK (teacher_id = fn_current_profile_id());

-- Siswa: SELECT baris miliknya sendiri (untuk cek status akun)
CREATE POLICY pol_roster_siswa_select ON classroom_roster
  FOR SELECT
  TO authenticated
  USING (profile_id = fn_current_profile_id());
