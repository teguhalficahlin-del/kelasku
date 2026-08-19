-- Putaran 9A: atomic regenerate limit via partial unique index.
-- Prevents race condition where two parallel regenerate requests both pass
-- the count check and both insert a candidate for the same artifact+parent.
--
-- Index: UNIQUE (artifact_id, candidate_of_version_id) WHERE candidate_of_version_id IS NOT NULL
-- Semantics: one row per (artifact, parent-version) pair where candidate_of_version_id IS NOT NULL.
-- Two parallel requests with the same (artifact_id, candidate_of_version_id) → one succeeds, one 23505.
-- After a candidate is accepted and becomes selected, next regenerate targets a different
-- candidate_of_version_id → allowed.
--
-- NOTE: rancang_artifact_versions has no status column — status is in rancang_artifact_version_states.
-- This index is the correct adaptation for this schema.

BEGIN;

-- Safety check: abort if violations exist (would prevent index creation anyway)
DO $$
DECLARE violation_count integer;
BEGIN
  SELECT COUNT(*) INTO violation_count
  FROM (
    SELECT artifact_id, candidate_of_version_id, COUNT(*) AS cnt
    FROM rancang_artifact_versions
    WHERE candidate_of_version_id IS NOT NULL
    GROUP BY artifact_id, candidate_of_version_id
    HAVING COUNT(*) > 1
  ) v;

  IF violation_count > 0 THEN
    RAISE EXCEPTION
      'Cannot create index: % violation(s) — duplicate (artifact_id, candidate_of_version_id) already exist',
      violation_count;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_one_active_candidate_per_artifact
  ON rancang_artifact_versions (artifact_id, candidate_of_version_id)
  WHERE candidate_of_version_id IS NOT NULL;

ROLLBACK;
