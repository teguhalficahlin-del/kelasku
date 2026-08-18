-- Phase 1 hotfix: preserve existing classroom/account deletion lifecycle.
-- Authorization rows are derived state and must not block deletion of their owner entities.

BEGIN;

ALTER TABLE wali_home_classrooms
  DROP CONSTRAINT IF EXISTS wali_home_classrooms_classroom_id_fkey,
  ADD CONSTRAINT wali_home_classrooms_classroom_id_fkey
    FOREIGN KEY (classroom_id) REFERENCES classrooms(id) ON DELETE CASCADE;

ALTER TABLE teaching_contexts
  DROP CONSTRAINT IF EXISTS teaching_contexts_teaching_scope_id_fkey,
  ADD CONSTRAINT teaching_contexts_teaching_scope_id_fkey
    FOREIGN KEY (teaching_scope_id) REFERENCES authorized_teaching_scopes(id) ON DELETE CASCADE;

ALTER TABLE teaching_context_classrooms
  DROP CONSTRAINT IF EXISTS teaching_context_classrooms_classroom_id_fkey,
  ADD CONSTRAINT teaching_context_classrooms_classroom_id_fkey
    FOREIGN KEY (classroom_id) REFERENCES classrooms(id) ON DELETE CASCADE;

COMMIT;

-- Rollback consideration: restoring RESTRICT would reintroduce the deletion regression.
