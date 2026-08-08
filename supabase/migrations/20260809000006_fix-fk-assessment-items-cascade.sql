ALTER TABLE assessment_items
  DROP CONSTRAINT IF EXISTS learning_objectives_teacher_id_fkey;
ALTER TABLE assessment_items
  ADD CONSTRAINT assessment_items_teacher_id_fkey
    FOREIGN KEY (teacher_id) REFERENCES profiles(id) ON DELETE CASCADE;
