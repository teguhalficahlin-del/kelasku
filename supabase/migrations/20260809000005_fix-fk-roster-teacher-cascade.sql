ALTER TABLE classroom_roster
  DROP CONSTRAINT IF EXISTS classroom_roster_teacher_id_fkey;

ALTER TABLE classroom_roster
  ADD CONSTRAINT classroom_roster_teacher_id_fkey
    FOREIGN KEY (teacher_id) REFERENCES profiles(id) ON DELETE CASCADE;
