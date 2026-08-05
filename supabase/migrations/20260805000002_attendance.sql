-- Migration: 20260805000002_attendance.sql
-- ADR-005: Absensi Classroom — tabel attendance + RLS 3 policy

BEGIN;

CREATE TABLE IF NOT EXISTS attendance (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id uuid NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
  schedule_id  uuid NOT NULL REFERENCES schedules(id)  ON DELETE CASCADE,
  student_id   uuid NOT NULL REFERENCES profiles(id)   ON DELETE CASCADE,
  teacher_id   uuid NOT NULL REFERENCES profiles(id),
  tanggal      date NOT NULL,
  status       text NOT NULL CHECK (status IN ('HADIR','SAKIT','IZIN','ALPHA')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  UNIQUE (classroom_id, student_id, tanggal, schedule_id)
);

CREATE INDEX IF NOT EXISTS idx_attendance_classroom_tanggal
  ON attendance (classroom_id, tanggal);

CREATE INDEX IF NOT EXISTS idx_attendance_student
  ON attendance (student_id, tanggal);

-- Auto-update updated_at saat upsert (fn_set_updated_at sudah ada dari init-schema)
CREATE OR REPLACE TRIGGER trg_attendance_updated_at
  BEFORE UPDATE ON attendance
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;

-- Guru: CRUD absensi classroom miliknya
CREATE POLICY pol_attendance_guru_all ON attendance
  FOR ALL TO authenticated
  USING  (teacher_id = fn_current_profile_id())
  WITH CHECK (teacher_id = fn_current_profile_id());

-- Siswa: READ absensi diri sendiri
-- fn_is_classroom_member checks classroom_members — siswa diinsert ke sana oleh generate-akun
CREATE POLICY pol_attendance_siswa_select ON attendance
  FOR SELECT TO authenticated
  USING (
    student_id = fn_current_profile_id()
    AND fn_is_classroom_member(classroom_id)
  );

-- Ortu: READ absensi anak yang di-link
CREATE POLICY pol_attendance_ortu_select ON attendance
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM classroom_members cm
      WHERE cm.profile_id        = fn_current_profile_id()
        AND cm.member_role       = 'ORTU'
        AND cm.linked_student_id = attendance.student_id
        AND cm.classroom_id      = attendance.classroom_id
    )
  );

COMMIT;
