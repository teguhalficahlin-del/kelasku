ALTER TABLE classroom_members
  DROP CONSTRAINT IF EXISTS classroom_members_teacher_id_fkey;
ALTER TABLE classroom_members
  ADD CONSTRAINT classroom_members_teacher_id_fkey
    FOREIGN KEY (teacher_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE student_notes
  DROP CONSTRAINT IF EXISTS student_notes_teacher_id_fkey;
ALTER TABLE student_notes
  ADD CONSTRAINT student_notes_teacher_id_fkey
    FOREIGN KEY (teacher_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE guidance_sessions
  DROP CONSTRAINT IF EXISTS guidance_sessions_teacher_id_fkey;
ALTER TABLE guidance_sessions
  ADD CONSTRAINT guidance_sessions_teacher_id_fkey
    FOREIGN KEY (teacher_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE forum_posts
  DROP CONSTRAINT IF EXISTS forum_posts_teacher_id_fkey;
ALTER TABLE forum_posts
  ADD CONSTRAINT forum_posts_teacher_id_fkey
    FOREIGN KEY (teacher_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE forum_comments
  DROP CONSTRAINT IF EXISTS forum_comments_teacher_id_fkey;
ALTER TABLE forum_comments
  ADD CONSTRAINT forum_comments_teacher_id_fkey
    FOREIGN KEY (teacher_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE schedules
  DROP CONSTRAINT IF EXISTS schedules_teacher_id_fkey;
ALTER TABLE schedules
  ADD CONSTRAINT schedules_teacher_id_fkey
    FOREIGN KEY (teacher_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE attendance
  DROP CONSTRAINT IF EXISTS attendance_teacher_id_fkey;
ALTER TABLE attendance
  ADD CONSTRAINT attendance_teacher_id_fkey
    FOREIGN KEY (teacher_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE student_grades
  DROP CONSTRAINT IF EXISTS student_grades_teacher_id_fkey;
ALTER TABLE student_grades
  ADD CONSTRAINT student_grades_teacher_id_fkey
    FOREIGN KEY (teacher_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE assessments
  DROP CONSTRAINT IF EXISTS assessments_teacher_id_fkey;
ALTER TABLE assessments
  ADD CONSTRAINT assessments_teacher_id_fkey
    FOREIGN KEY (teacher_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE assessment_kktp_results
  DROP CONSTRAINT IF EXISTS assessment_kktp_results_teacher_id_fkey;
ALTER TABLE assessment_kktp_results
  ADD CONSTRAINT assessment_kktp_results_teacher_id_fkey
    FOREIGN KEY (teacher_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE assessment_rubric_criteria
  DROP CONSTRAINT IF EXISTS assessment_rubric_criteria_teacher_id_fkey;
ALTER TABLE assessment_rubric_criteria
  ADD CONSTRAINT assessment_rubric_criteria_teacher_id_fkey
    FOREIGN KEY (teacher_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE assessment_rubric_results
  DROP CONSTRAINT IF EXISTS assessment_rubric_results_teacher_id_fkey;
ALTER TABLE assessment_rubric_results
  ADD CONSTRAINT assessment_rubric_results_teacher_id_fkey
    FOREIGN KEY (teacher_id) REFERENCES profiles(id) ON DELETE CASCADE;
