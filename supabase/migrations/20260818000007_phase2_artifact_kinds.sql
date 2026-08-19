-- Phase 2: Enforce artifact_kind enum + meeting_allocation_item_id on versions + helper functions.
-- Additive only. No existing rows touched. Safe to re-run (idempotent via IF NOT EXISTS / OR REPLACE).

BEGIN;

-- A. Add meeting_allocation_item_id to rancang_artifact_versions if not present.
--    rancang_artifacts already has this column; versions need it for MEETING_PLAN linkage.
ALTER TABLE rancang_artifact_versions
  ADD COLUMN IF NOT EXISTS meeting_allocation_item_id UUID
  REFERENCES rancang_meeting_allocation_items(id) ON DELETE SET NULL;

-- B. CHECK constraint for artifact_kind.
--    Already exists in Phase 2B with identical values, so DROP first then recreate
--    to make this migration idempotent regardless of prior state.
ALTER TABLE rancang_artifacts
  DROP CONSTRAINT IF EXISTS rancang_artifacts_artifact_kind_check;

ALTER TABLE rancang_artifacts
  ADD CONSTRAINT rancang_artifacts_artifact_kind_check CHECK (
    artifact_kind IN (
      'CONTEXT_SPEC','ASSESSMENT_SPEC','MATERIAL_SPEC',
      'MEETING_PLAN','FOLLOW_UP','VALIDATION_REPORT'
    )
  );

-- C. Helper: artifact usability predicate — immutable, callable by authenticated.
CREATE OR REPLACE FUNCTION fn_artifact_is_usable(
  p_status       TEXT,
  p_needs_update BOOLEAN
) RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE AS $$
  SELECT p_status IN ('generated','confirmed') AND p_needs_update = false;
$$;
REVOKE ALL ON FUNCTION fn_artifact_is_usable(TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_artifact_is_usable(TEXT, BOOLEAN) TO authenticated;

-- D. Helper: MEETING_PLAN scope_key from meeting_no — immutable, callable by authenticated.
CREATE OR REPLACE FUNCTION fn_meeting_scope_key(p_meeting_no INT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$
  SELECT 'MEETING_' || p_meeting_no::text;
$$;
REVOKE ALL ON FUNCTION fn_meeting_scope_key(INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_meeting_scope_key(INT) TO authenticated;

COMMIT;

-- Rollback boundary:
--   ALTER TABLE rancang_artifact_versions DROP COLUMN IF EXISTS meeting_allocation_item_id;
--   ALTER TABLE rancang_artifacts DROP CONSTRAINT IF EXISTS rancang_artifacts_artifact_kind_check;
--   DROP FUNCTION IF EXISTS fn_artifact_is_usable(TEXT,BOOLEAN);
--   DROP FUNCTION IF EXISTS fn_meeting_scope_key(INT);
