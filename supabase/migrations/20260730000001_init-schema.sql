-- =============================================================================
-- Migration: 20260730000001_init-schema.sql
-- SIP Mandiri — Schema Awal
-- Urutan: ENUM → TABLE → FUNCTION → TRIGGER → INDEX → RLS ENABLE → POLICY
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- ENUM
-- ---------------------------------------------------------------------------

CREATE TYPE IF NOT EXISTS member_role AS ENUM ('SISWA', 'ORTU');

-- ---------------------------------------------------------------------------
-- TABEL
-- ---------------------------------------------------------------------------

-- 3.1 profiles — semua user (GURU / SISWA / ORTU)
CREATE TABLE IF NOT EXISTS profiles (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name     text NOT NULL,
  role          text NOT NULL CHECK (role IN ('GURU', 'SISWA', 'ORTU')),
  email         text,
  phone         text,
  avatar_url    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- 3.2 classrooms — classroom milik guru (1 guru → banyak classroom)
CREATE TABLE IF NOT EXISTS classrooms (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name            text NOT NULL,
  description     text,
  subject         text,
  classroom_code  text NOT NULL UNIQUE DEFAULT upper(substr(md5(random()::text), 1, 8)),
  is_archived     boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- 3.3 classroom_members — many-to-many siswa/ortu ↔ classroom
CREATE TABLE IF NOT EXISTS classroom_members (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id      uuid NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
  teacher_id        uuid NOT NULL REFERENCES profiles(id),
  profile_id        uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  member_role       member_role NOT NULL,
  linked_student_id uuid REFERENCES profiles(id),
  joined_at         timestamptz NOT NULL DEFAULT now(),

  UNIQUE (classroom_id, profile_id),
  CHECK (member_role != 'ORTU' OR linked_student_id IS NOT NULL)
);

-- 3.4 student_notes — catatan guru per siswa
CREATE TABLE IF NOT EXISTS student_notes (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id          uuid NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
  teacher_id            uuid NOT NULL REFERENCES profiles(id),
  student_id            uuid NOT NULL REFERENCES profiles(id),
  content               text NOT NULL,
  is_visible_to_student boolean NOT NULL DEFAULT false,
  is_visible_to_parent  boolean NOT NULL DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- 3.5 guidance_sessions — sesi pembinaan, selalu private
CREATE TABLE IF NOT EXISTS guidance_sessions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id     uuid NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
  teacher_id       uuid NOT NULL REFERENCES profiles(id),
  student_id       uuid NOT NULL REFERENCES profiles(id),
  session_date     date NOT NULL,
  duration_minutes int,
  summary          text NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- 3.6 forum_posts — posting guru ke classroom
CREATE TABLE IF NOT EXISTS forum_posts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id uuid NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
  teacher_id   uuid NOT NULL REFERENCES profiles(id),
  title        text,
  content      text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- 3.7 forum_comments — komentar dari guru/siswa/ortu
CREATE TABLE IF NOT EXISTS forum_comments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id      uuid NOT NULL REFERENCES forum_posts(id) ON DELETE CASCADE,
  classroom_id uuid NOT NULL REFERENCES classrooms(id),
  teacher_id   uuid NOT NULL REFERENCES profiles(id),
  author_id    uuid NOT NULL REFERENCES profiles(id),
  content      text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- 3.8 schedules — jadwal per classroom
CREATE TABLE IF NOT EXISTS schedules (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id uuid NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
  teacher_id   uuid NOT NULL REFERENCES profiles(id),
  day_of_week  text NOT NULL CHECK (day_of_week IN
                 ('SENIN','SELASA','RABU','KAMIS','JUMAT','SABTU')),
  start_time   time NOT NULL,
  end_time     time NOT NULL,
  subject      text,
  note         text,
  created_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_time_order CHECK (end_time > start_time)
);

-- ---------------------------------------------------------------------------
-- FUNGSI HELPER (SECURITY DEFINER)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_current_profile_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT id FROM profiles WHERE user_id = auth.uid()
$$;
REVOKE EXECUTE ON FUNCTION fn_current_profile_id FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fn_current_profile_id FROM anon;
GRANT EXECUTE ON FUNCTION fn_current_profile_id TO authenticated;

CREATE OR REPLACE FUNCTION fn_is_classroom_owner(p_classroom_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM classrooms
    WHERE id = p_classroom_id
      AND teacher_id = fn_current_profile_id()
  )
$$;
REVOKE EXECUTE ON FUNCTION fn_is_classroom_owner FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fn_is_classroom_owner FROM anon;
GRANT EXECUTE ON FUNCTION fn_is_classroom_owner TO authenticated;

CREATE OR REPLACE FUNCTION fn_is_classroom_member(p_classroom_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM classroom_members
    WHERE classroom_id = p_classroom_id
      AND profile_id = fn_current_profile_id()
  )
$$;
REVOKE EXECUTE ON FUNCTION fn_is_classroom_member FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fn_is_classroom_member FROM anon;
GRANT EXECUTE ON FUNCTION fn_is_classroom_member TO authenticated;

-- ---------------------------------------------------------------------------
-- TRIGGER: auto-update updated_at
-- classroom_members dan schedules tidak punya updated_at — tidak ada trigger
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

CREATE OR REPLACE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE OR REPLACE TRIGGER trg_classrooms_updated_at
  BEFORE UPDATE ON classrooms
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE OR REPLACE TRIGGER trg_student_notes_updated_at
  BEFORE UPDATE ON student_notes
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE OR REPLACE TRIGGER trg_guidance_sessions_updated_at
  BEFORE UPDATE ON guidance_sessions
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE OR REPLACE TRIGGER trg_forum_posts_updated_at
  BEFORE UPDATE ON forum_posts
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE OR REPLACE TRIGGER trg_forum_comments_updated_at
  BEFORE UPDATE ON forum_comments
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ---------------------------------------------------------------------------
-- INDEX
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON profiles(user_id);

CREATE INDEX IF NOT EXISTS idx_classrooms_teacher_id ON classrooms(teacher_id);
CREATE INDEX IF NOT EXISTS idx_classrooms_code ON classrooms(classroom_code);

CREATE INDEX IF NOT EXISTS idx_classroom_members_classroom ON classroom_members(classroom_id);
CREATE INDEX IF NOT EXISTS idx_classroom_members_profile ON classroom_members(profile_id);
CREATE INDEX IF NOT EXISTS idx_classroom_members_linked_student
  ON classroom_members(linked_student_id)
  WHERE linked_student_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notes_student ON student_notes(student_id);
CREATE INDEX IF NOT EXISTS idx_notes_classroom ON student_notes(classroom_id);
CREATE INDEX IF NOT EXISTS idx_notes_visible_student
  ON student_notes(classroom_id)
  WHERE is_visible_to_student = true;
CREATE INDEX IF NOT EXISTS idx_notes_visible_parent
  ON student_notes(classroom_id)
  WHERE is_visible_to_parent = true;

CREATE INDEX IF NOT EXISTS idx_guidance_student ON guidance_sessions(student_id);
CREATE INDEX IF NOT EXISTS idx_guidance_classroom ON guidance_sessions(classroom_id);

CREATE INDEX IF NOT EXISTS idx_forum_posts_classroom ON forum_posts(classroom_id);
CREATE INDEX IF NOT EXISTS idx_forum_comments_post ON forum_comments(post_id);
CREATE INDEX IF NOT EXISTS idx_forum_comments_classroom ON forum_comments(classroom_id);

CREATE INDEX IF NOT EXISTS idx_schedules_classroom ON schedules(classroom_id);

-- ---------------------------------------------------------------------------
-- RLS ENABLE
-- ---------------------------------------------------------------------------

ALTER TABLE profiles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE classrooms        ENABLE ROW LEVEL SECURITY;
ALTER TABLE classroom_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_notes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE guidance_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_posts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_comments    ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedules         ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- RLS POLICIES
-- ---------------------------------------------------------------------------

-- ---- profiles ----
-- User bisa baca dan update profil sendiri
CREATE POLICY pol_profiles_self ON profiles
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Guru, siswa, dan ortu bisa baca profil member di classroom yang sama
-- (untuk menampilkan nama di UI)
CREATE POLICY pol_profiles_classroom_peer ON profiles
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM classroom_members cm1
      JOIN classroom_members cm2 ON cm1.classroom_id = cm2.classroom_id
      WHERE cm1.profile_id = fn_current_profile_id()
        AND cm2.profile_id = profiles.id
    )
  );

-- ---- classrooms ----
-- Guru: CRUD classroom miliknya
CREATE POLICY pol_classrooms_guru_all ON classrooms
  FOR ALL TO authenticated
  USING (teacher_id = fn_current_profile_id())
  WITH CHECK (teacher_id = fn_current_profile_id());

-- Siswa/ortu: SELECT classroom yang diikuti
CREATE POLICY pol_classrooms_member_select ON classrooms
  FOR SELECT TO authenticated
  USING (fn_is_classroom_member(id));

-- ---- classroom_members ----
-- Guru: SELECT semua member di classroomnya
CREATE POLICY pol_cm_guru_select ON classroom_members
  FOR SELECT TO authenticated
  USING (teacher_id = fn_current_profile_id());

-- Siswa/ortu: SELECT baris dirinya sendiri
CREATE POLICY pol_cm_self_select ON classroom_members
  FOR SELECT TO authenticated
  USING (profile_id = fn_current_profile_id());

-- Siswa: INSERT diri sendiri saat join classroom
CREATE POLICY pol_cm_siswa_insert ON classroom_members
  FOR INSERT TO authenticated
  WITH CHECK (
    profile_id = fn_current_profile_id()
    AND member_role = 'SISWA'
  );

-- Ortu: INSERT diri sendiri saat join classroom
CREATE POLICY pol_cm_ortu_insert ON classroom_members
  FOR INSERT TO authenticated
  WITH CHECK (
    profile_id = fn_current_profile_id()
    AND member_role = 'ORTU'
    AND linked_student_id IS NOT NULL
  );

-- ---- student_notes ----
-- Guru: CRUD semua catatan di classroomnya
CREATE POLICY pol_notes_guru_all ON student_notes
  FOR ALL TO authenticated
  USING (teacher_id = fn_current_profile_id())
  WITH CHECK (teacher_id = fn_current_profile_id());

-- Siswa: SELECT catatan tentang dirinya yang di-flag visible
CREATE POLICY pol_notes_siswa_select ON student_notes
  FOR SELECT TO authenticated
  USING (
    is_visible_to_student = true
    AND student_id = fn_current_profile_id()
    AND fn_is_classroom_member(classroom_id)
  );

-- Ortu: SELECT catatan tentang anak yang di-link, yang di-flag visible ke ortu
CREATE POLICY pol_notes_ortu_select ON student_notes
  FOR SELECT TO authenticated
  USING (
    is_visible_to_parent = true
    AND fn_is_classroom_member(classroom_id)
    AND EXISTS (
      SELECT 1 FROM classroom_members cm
      WHERE cm.classroom_id = student_notes.classroom_id
        AND cm.profile_id = fn_current_profile_id()
        AND cm.member_role = 'ORTU'
        AND cm.linked_student_id = student_notes.student_id
    )
  );

-- ---- guidance_sessions ----
-- Guru saja: CRUD semua sesi di classroomnya (private — siswa/ortu tidak ada akses)
CREATE POLICY pol_guidance_guru_all ON guidance_sessions
  FOR ALL TO authenticated
  USING (teacher_id = fn_current_profile_id())
  WITH CHECK (teacher_id = fn_current_profile_id());

-- ---- forum_posts ----
-- Guru: CRUD posting di classroomnya
CREATE POLICY pol_posts_guru_all ON forum_posts
  FOR ALL TO authenticated
  USING (teacher_id = fn_current_profile_id())
  WITH CHECK (teacher_id = fn_current_profile_id());

-- Siswa/ortu: SELECT posting di classroom yang diikuti
CREATE POLICY pol_posts_member_select ON forum_posts
  FOR SELECT TO authenticated
  USING (fn_is_classroom_member(classroom_id));

-- ---- forum_comments ----
-- Guru: CRUD semua komentar di classroomnya
CREATE POLICY pol_comments_guru_all ON forum_comments
  FOR ALL TO authenticated
  USING (teacher_id = fn_current_profile_id())
  WITH CHECK (teacher_id = fn_current_profile_id());

-- Siswa/ortu: SELECT komentar di classroom yang diikuti
CREATE POLICY pol_comments_member_select ON forum_comments
  FOR SELECT TO authenticated
  USING (fn_is_classroom_member(classroom_id));

-- Siswa/ortu: INSERT komentar sendiri di classroom yang diikuti
CREATE POLICY pol_comments_member_insert ON forum_comments
  FOR INSERT TO authenticated
  WITH CHECK (
    author_id = fn_current_profile_id()
    AND fn_is_classroom_member(classroom_id)
  );

-- ---- schedules ----
-- Guru: CRUD jadwal classroomnya
CREATE POLICY pol_schedules_guru_all ON schedules
  FOR ALL TO authenticated
  USING (teacher_id = fn_current_profile_id())
  WITH CHECK (teacher_id = fn_current_profile_id());

-- Siswa/ortu: SELECT jadwal classroom yang diikuti
CREATE POLICY pol_schedules_member_select ON schedules
  FOR SELECT TO authenticated
  USING (fn_is_classroom_member(classroom_id));

-- ---------------------------------------------------------------------------
COMMIT;
