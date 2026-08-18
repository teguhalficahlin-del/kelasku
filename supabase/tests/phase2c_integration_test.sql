-- Phase 2C integration tests — requires local Supabase stack (Docker).
-- Run ONLY against local/non-production DB: supabase db query -f supabase/tests/phase2c_integration_test.sql
-- Each test group is self-contained BEGIN...ROLLBACK so no permanent changes.
-- Prerequisite: Phase 2A and Phase 2B migrations already applied.

\echo '=== Phase 2C Integration Tests ==='

-- ─── Test helpers ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION test_assert(label text, condition boolean) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF condition THEN RAISE NOTICE 'PASS: %', label;
  ELSE RAISE EXCEPTION 'FAIL: %', label;
  END IF;
END $$;

-- ─── T1: Migration functions exist with correct signatures ─────────────────────
\echo '--- T1: Function existence ---'
BEGIN;

SELECT test_assert('fn_phase2c_get_pipeline_state exists',
  EXISTS(SELECT 1 FROM pg_proc WHERE proname='fn_phase2c_get_pipeline_state'));

SELECT test_assert('fn_phase2c_artifact_state_json exists',
  EXISTS(SELECT 1 FROM pg_proc WHERE proname='fn_phase2c_artifact_state_json'));

SELECT test_assert('fn_phase2c_context_spec_confirmed exists',
  EXISTS(SELECT 1 FROM pg_proc WHERE proname='fn_phase2c_context_spec_confirmed'));

SELECT test_assert('fn_phase2c_validate_context_spec exists',
  EXISTS(SELECT 1 FROM pg_proc WHERE proname='fn_phase2c_validate_context_spec'));

SELECT test_assert('fn_phase2c_validate_assessment_spec exists',
  EXISTS(SELECT 1 FROM pg_proc WHERE proname='fn_phase2c_validate_assessment_spec'));

ROLLBACK;

-- ─── T2: fn_phase2c_validate_context_spec — deterministic validation ──────────
\echo '--- T2: validate_context_spec ---'
BEGIN;

-- Valid spec
SELECT test_assert('valid context spec passes', (
  SELECT (fn_phase2c_validate_context_spec('{
    "context_decisions":[{
      "id":"CTX-01","source":"step_3a","raw":"r","interpretation":"i","implication":"m",
      "prefer":["a"],"avoid":["b"]
    }],
    "constraints":["max 45 menit"],
    "contextual_opportunities":["peluang SMK"],
    "risks":[],"irrelevant_context":[]
  }'::jsonb)->>'status') = 'valid'
));

-- Empty context_decisions
SELECT test_assert('empty context_decisions → invalid', (
  SELECT (fn_phase2c_validate_context_spec('{"context_decisions":[],"constraints":[],"contextual_opportunities":[]}'::jsonb)->>'status') = 'invalid'
));

-- Missing prefer field
SELECT test_assert('decision without prefer array → invalid', (
  SELECT (fn_phase2c_validate_context_spec('{
    "context_decisions":[{"source":"s","raw":"r","interpretation":"i","implication":"m","avoid":[]}],
    "constraints":[],"contextual_opportunities":[]
  }'::jsonb)->>'status') = 'invalid'
));

-- Non-object root
SELECT test_assert('array root → fail not invalid', (
  SELECT (fn_phase2c_validate_context_spec('[]'::jsonb)->>'status') = 'fail'
));

ROLLBACK;

-- ─── T3: fn_phase2c_validate_assessment_spec — deterministic validation ────────
\echo '--- T3: validate_assessment_spec ---'
BEGIN;

-- Valid spec
SELECT test_assert('valid assessment spec passes', (
  SELECT (fn_phase2c_validate_assessment_spec('{
    "success_evidence":["bukti 1"],
    "kktp":[{"id":"KKTP-01","deskripsi":"kriteria","paham":"aktif","hampir":"pasif","belum":"tidak ada"}],
    "formative":[{"meeting_no":1,"expected_evidence":"pengamatan","classification_anchor":{"paham":"ok","hampir":"ok","belum":"ok"}}],
    "summative":{"bentuk":"unjuk kerja"},
    "instruments":[],"scoring_guidance":{}
  }'::jsonb)->>'status') = 'valid'
));

-- Missing success_evidence
SELECT test_assert('empty success_evidence → invalid', (
  SELECT (fn_phase2c_validate_assessment_spec('{
    "success_evidence":[],
    "kktp":[{"deskripsi":"k","paham":"p","hampir":"h","belum":"b"}],
    "formative":[{"meeting_no":1,"expected_evidence":"e","classification_anchor":{}}],
    "summative":{}
  }'::jsonb)->>'status') = 'invalid'
));

-- KKTP missing classification anchors
SELECT test_assert('kktp without paham/hampir/belum → invalid', (
  SELECT (fn_phase2c_validate_assessment_spec('{
    "success_evidence":["bukti"],
    "kktp":[{"deskripsi":"kriteria"}],
    "formative":[{"meeting_no":1,"expected_evidence":"e","classification_anchor":{}}],
    "summative":{}
  }'::jsonb)->>'status') = 'invalid'
));

-- Summative is array not object
SELECT test_assert('summative as array → invalid', (
  SELECT (fn_phase2c_validate_assessment_spec('{
    "success_evidence":["x"],
    "kktp":[{"deskripsi":"k","paham":"p","hampir":"h","belum":"b"}],
    "formative":[],
    "summative":[]
  }'::jsonb)->>'status') = 'invalid'
));

ROLLBACK;

-- ─── T4: GRANT/REVOKE — functions NOT accessible by anon/authenticated ────────
\echo '--- T4: GRANT restrictions ---'
BEGIN;

-- Verify no execute privilege for anon or authenticated
SELECT test_assert('fn_phase2c_get_pipeline_state not accessible by authenticated', NOT EXISTS(
  SELECT 1 FROM information_schema.role_routine_grants
  WHERE routine_name='fn_phase2c_get_pipeline_state'
    AND grantee IN ('anon','authenticated','PUBLIC','public')
    AND privilege_type='EXECUTE'
));

SELECT test_assert('fn_phase2c_validate_context_spec not accessible by authenticated', NOT EXISTS(
  SELECT 1 FROM information_schema.role_routine_grants
  WHERE routine_name='fn_phase2c_validate_context_spec'
    AND grantee IN ('anon','authenticated','PUBLIC','public')
    AND privilege_type='EXECUTE'
));

ROLLBACK;

-- ─── T5: fn_phase2c_context_spec_confirmed — returns false when no artifact ────
\echo '--- T5: context_spec_confirmed gate ---'
BEGIN;

-- With a random UUID that has no artifact, should return false (not error)
SELECT test_assert('context_spec_confirmed returns false for non-existent context', (
  SELECT fn_phase2c_context_spec_confirmed(
    gen_random_uuid(),
    gen_random_uuid()
  ) = false
));

ROLLBACK;

-- ─── T6: fn_phase2c_artifact_state_json — returns null for non-existent ────────
\echo '--- T6: artifact_state_json ---'
BEGIN;

SELECT test_assert('artifact_state_json returns null for non-existent artifact', (
  SELECT fn_phase2c_artifact_state_json(
    gen_random_uuid(),
    gen_random_uuid(),
    'CONTEXT_SPEC'
  ) IS NULL
  OR fn_phase2c_artifact_state_json(
    gen_random_uuid(),
    gen_random_uuid(),
    'CONTEXT_SPEC'
  ) = 'null'::jsonb
));

ROLLBACK;

-- ─── T7: fn_phase2c_get_pipeline_state — rejects unauthorized profile ──────────
\echo '--- T7: pipeline_state authorization ---'
BEGIN;

-- Non-existent profile/planning_context combination should raise SQLSTATE 42501
DO $$
DECLARE
  v_result jsonb;
BEGIN
  BEGIN
    SELECT fn_phase2c_get_pipeline_state(gen_random_uuid(), gen_random_uuid()) INTO v_result;
    RAISE EXCEPTION 'FAIL: should have raised 42501, got: %', v_result;
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'PASS: fn_phase2c_get_pipeline_state raises 42501 for unauthorized access';
  END;
END $$;

ROLLBACK;

-- ─── T8: Idempotency key binding: validate sourceHash inputs include profile-bound data ──
\echo '--- T8: sourceHash binding (structural) ---'
BEGIN;

-- Verify that the context_spec sourceHash schema always includes planning_context_id
-- (cannot run full Edge Function without Deno, but can verify the validation function is IMMUTABLE)
SELECT test_assert('validate_context_spec is IMMUTABLE', (
  SELECT provolatile = 'i'
  FROM pg_proc
  WHERE proname = 'fn_phase2c_validate_context_spec'
));

SELECT test_assert('validate_assessment_spec is IMMUTABLE', (
  SELECT provolatile = 'i'
  FROM pg_proc
  WHERE proname = 'fn_phase2c_validate_assessment_spec'
));

ROLLBACK;

\echo '=== All Phase 2C integration tests completed ==='
\echo 'IMPORTANT: Run this file ONLY against local Supabase (Docker). Never against production.'

DROP FUNCTION IF EXISTS test_assert(text, boolean);
