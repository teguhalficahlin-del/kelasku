-- Phase 2: Pipeline state table + rpm_ready_for_class gate + update fn_phase2c_get_pipeline_state.
-- Additive only. No Phase 1 / Phase 2A / Phase 2B tables or rows are modified.
-- Depends on: 20260818000007_phase2_artifact_kinds.sql (fn_artifact_is_usable must exist).

BEGIN;

-- A. Pipeline state cache table — one row per (planning_context_id, profile_id).
CREATE TABLE IF NOT EXISTS rancang_pipeline_state (
  id                           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  planning_context_id          UUID        NOT NULL
                               REFERENCES rancang_planning_contexts(id) ON DELETE CASCADE,
  profile_id                   UUID        NOT NULL
                               REFERENCES profiles(id) ON DELETE CASCADE,
  rpm_ready_for_class          BOOLEAN     NOT NULL DEFAULT FALSE,
  last_validated_at            TIMESTAMPTZ,
  validation_report_version_id UUID
                               REFERENCES rancang_artifact_versions(id) ON DELETE SET NULL,
  created_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(planning_context_id, profile_id)
);

-- RLS: authenticated can only read their own row; writes are service_role only.
ALTER TABLE rancang_pipeline_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "guru baca pipeline state sendiri" ON rancang_pipeline_state;
CREATE POLICY "guru baca pipeline state sendiri"
  ON rancang_pipeline_state FOR SELECT TO authenticated
  USING (profile_id = (
    SELECT id FROM profiles WHERE user_id = auth.uid() LIMIT 1
  ));

GRANT SELECT ON rancang_pipeline_state TO authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON rancang_pipeline_state FROM authenticated;
REVOKE ALL ON rancang_pipeline_state FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON rancang_pipeline_state TO service_role;

-- B. fn_rpm_ready_for_class — evaluates all 7 readiness conditions.
--    NOTE: lifecycle_status and needs_update live in rancang_artifact_version_states (avs),
--    not in rancang_artifact_versions (v). Joins reflect the actual schema.
CREATE OR REPLACE FUNCTION fn_rpm_ready_for_class(
  p_profile_id          UUID,
  p_planning_context_id UUID
) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_alloc_confirmed BOOLEAN := FALSE;
  v_ctx_ok          BOOLEAN := FALSE;
  v_asm_ok          BOOLEAN := FALSE;
  v_mat_ok          BOOLEAN := FALSE;
  v_followup_ok     BOOLEAN := FALSE;
  v_validation_ok   BOOLEAN := FALSE;
  v_meeting_count   INT     := 0;
  v_meeting_usable  INT     := 0;
BEGIN
  -- 1. meeting_allocation must be confirmed (is_confirmed=true, not superseded)
  SELECT EXISTS(
    SELECT 1 FROM rancang_meeting_allocations
    WHERE planning_context_id = p_planning_context_id
      AND profile_id           = p_profile_id
      AND is_confirmed         = TRUE
      AND superseded_at       IS NULL
  ) INTO v_alloc_confirmed;
  IF NOT v_alloc_confirmed THEN RETURN FALSE; END IF;

  -- 2. CONTEXT_SPEC: selected version must be CONFIRMED + usable
  SELECT EXISTS(
    SELECT 1
    FROM rancang_artifacts a
    JOIN rancang_artifact_selections sel ON sel.artifact_id = a.id
    JOIN rancang_artifact_versions v     ON v.id = sel.selected_version_id
    JOIN rancang_artifact_version_states avs ON avs.version_id = v.id
    WHERE a.planning_context_id = p_planning_context_id
      AND a.profile_id          = p_profile_id
      AND a.artifact_kind       = 'CONTEXT_SPEC'
      AND avs.lifecycle_status  = 'CONFIRMED'
      AND fn_artifact_is_usable(avs.lifecycle_status, avs.needs_update)
  ) INTO v_ctx_ok;
  IF NOT v_ctx_ok THEN RETURN FALSE; END IF;

  -- 3. ASSESSMENT_SPEC: selected version must be CONFIRMED + usable
  SELECT EXISTS(
    SELECT 1
    FROM rancang_artifacts a
    JOIN rancang_artifact_selections sel ON sel.artifact_id = a.id
    JOIN rancang_artifact_versions v     ON v.id = sel.selected_version_id
    JOIN rancang_artifact_version_states avs ON avs.version_id = v.id
    WHERE a.planning_context_id = p_planning_context_id
      AND a.profile_id          = p_profile_id
      AND a.artifact_kind       = 'ASSESSMENT_SPEC'
      AND avs.lifecycle_status  = 'CONFIRMED'
      AND fn_artifact_is_usable(avs.lifecycle_status, avs.needs_update)
  ) INTO v_asm_ok;
  IF NOT v_asm_ok THEN RETURN FALSE; END IF;

  -- 4. MATERIAL_SPEC: selected version must be usable (confirmed not required)
  SELECT EXISTS(
    SELECT 1
    FROM rancang_artifacts a
    JOIN rancang_artifact_selections sel ON sel.artifact_id = a.id
    JOIN rancang_artifact_versions v     ON v.id = sel.selected_version_id
    JOIN rancang_artifact_version_states avs ON avs.version_id = v.id
    WHERE a.planning_context_id = p_planning_context_id
      AND a.profile_id          = p_profile_id
      AND a.artifact_kind       = 'MATERIAL_SPEC'
      AND fn_artifact_is_usable(avs.lifecycle_status, avs.needs_update)
  ) INTO v_mat_ok;
  IF NOT v_mat_ok THEN RETURN FALSE; END IF;

  -- 5. All MEETING_PLANs must be usable.
  --    Count expected meetings from the confirmed allocation.
  SELECT COUNT(*) INTO v_meeting_count
  FROM rancang_meeting_allocations ma
  JOIN rancang_meeting_allocation_items mai ON mai.meeting_allocation_id = ma.id
  WHERE ma.planning_context_id = p_planning_context_id
    AND ma.profile_id           = p_profile_id
    AND ma.is_confirmed         = TRUE
    AND ma.superseded_at       IS NULL;

  -- Edge case: 0 meetings in allocation means RPM cannot be ready.
  IF v_meeting_count = 0 THEN RETURN FALSE; END IF;

  SELECT COUNT(*) INTO v_meeting_usable
  FROM rancang_artifacts a
  JOIN rancang_artifact_selections sel ON sel.artifact_id = a.id
  JOIN rancang_artifact_versions v     ON v.id = sel.selected_version_id
  JOIN rancang_artifact_version_states avs ON avs.version_id = v.id
  WHERE a.planning_context_id = p_planning_context_id
    AND a.profile_id          = p_profile_id
    AND a.artifact_kind       = 'MEETING_PLAN'
    AND fn_artifact_is_usable(avs.lifecycle_status, avs.needs_update);

  IF v_meeting_usable < v_meeting_count THEN RETURN FALSE; END IF;

  -- 6. FOLLOW_UP: selected version must be usable
  SELECT EXISTS(
    SELECT 1
    FROM rancang_artifacts a
    JOIN rancang_artifact_selections sel ON sel.artifact_id = a.id
    JOIN rancang_artifact_versions v     ON v.id = sel.selected_version_id
    JOIN rancang_artifact_version_states avs ON avs.version_id = v.id
    WHERE a.planning_context_id = p_planning_context_id
      AND a.profile_id          = p_profile_id
      AND a.artifact_kind       = 'FOLLOW_UP'
      AND fn_artifact_is_usable(avs.lifecycle_status, avs.needs_update)
  ) INTO v_followup_ok;
  IF NOT v_followup_ok THEN RETURN FALSE; END IF;

  -- 7. VALIDATION_REPORT: usable + status pass/pass_with_warnings + no blocking violation
  SELECT EXISTS(
    SELECT 1
    FROM rancang_artifacts a
    JOIN rancang_artifact_selections sel ON sel.artifact_id = a.id
    JOIN rancang_artifact_versions v     ON v.id = sel.selected_version_id
    JOIN rancang_artifact_version_states avs ON avs.version_id = v.id
    WHERE a.planning_context_id = p_planning_context_id
      AND a.profile_id          = p_profile_id
      AND a.artifact_kind       = 'VALIDATION_REPORT'
      AND fn_artifact_is_usable(avs.lifecycle_status, avs.needs_update)
      AND v.content->>'status' IN ('pass', 'pass_with_warnings')
      AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(
          COALESCE(v.content->'violations', '[]'::jsonb)
        ) AS violation
        WHERE violation->>'severity' = 'blocking'
      )
  ) INTO v_validation_ok;
  IF NOT v_validation_ok THEN RETURN FALSE; END IF;

  RETURN TRUE;
END;
$$;
REVOKE ALL ON FUNCTION fn_rpm_ready_for_class(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_rpm_ready_for_class(UUID, UUID) TO authenticated;

-- C. fn_update_pipeline_state — upsert pipeline state cache; called by service_role only.
CREATE OR REPLACE FUNCTION fn_update_pipeline_state(
  p_profile_id          UUID,
  p_planning_context_id UUID
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ready BOOLEAN;
BEGIN
  v_ready := fn_rpm_ready_for_class(p_profile_id, p_planning_context_id);
  INSERT INTO rancang_pipeline_state
    (planning_context_id, profile_id, rpm_ready_for_class, last_validated_at, updated_at)
  VALUES
    (p_planning_context_id, p_profile_id, v_ready, now(), now())
  ON CONFLICT (planning_context_id, profile_id) DO UPDATE SET
    rpm_ready_for_class = EXCLUDED.rpm_ready_for_class,
    last_validated_at   = EXCLUDED.last_validated_at,
    updated_at          = EXCLUDED.updated_at;
END;
$$;
REVOKE ALL ON FUNCTION fn_update_pipeline_state(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION fn_update_pipeline_state(UUID, UUID) TO service_role;

-- D. Update fn_phase2c_get_pipeline_state to include rpm_ready_for_class.
--    All existing fields are preserved verbatim; only the new field is added.
--    GRANT/REVOKE stay identical (service_role only).
CREATE OR REPLACE FUNCTION fn_phase2c_get_pipeline_state(
  p_profile_id          uuid,
  p_planning_context_id uuid
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_pc    rancang_planning_contexts;
  v_alloc rancang_meeting_allocations;
  v_items jsonb;
  v_ctx   jsonb := 'null'::jsonb;
  v_asm   jsonb := 'null'::jsonb;
BEGIN
  SELECT * INTO v_pc FROM rancang_planning_contexts
    WHERE id = p_planning_context_id AND profile_id = p_profile_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Planning Context tidak diizinkan' USING ERRCODE = '42501'; END IF;

  SELECT * INTO v_alloc FROM rancang_meeting_allocations
    WHERE planning_context_id = p_planning_context_id AND superseded_at IS NULL;

  IF FOUND THEN
    SELECT jsonb_agg(jsonb_build_object(
      'meeting_no', mi.meeting_no, 'jp', mi.jp, 'duration_minutes', mi.duration_minutes
    ) ORDER BY mi.meeting_no) INTO v_items
    FROM rancang_meeting_allocation_items mi WHERE mi.meeting_allocation_id = v_alloc.id;
  END IF;

  SELECT fn_phase2c_artifact_state_json(p_profile_id, p_planning_context_id, 'CONTEXT_SPEC')   INTO v_ctx;
  SELECT fn_phase2c_artifact_state_json(p_profile_id, p_planning_context_id, 'ASSESSMENT_SPEC') INTO v_asm;

  RETURN jsonb_build_object(
    'planning_context_id',    p_planning_context_id,
    'tp_id',                  v_pc.tp_id,
    'selected_tp_revision_id', v_pc.selected_tp_revision_id,
    'meeting_allocation',     CASE WHEN v_alloc.id IS NOT NULL THEN
      jsonb_build_object(
        'id',                  v_alloc.id,
        'confirmed',           true,
        'total_jp_tp',         v_alloc.total_jp_tp,
        'effective_jp_minutes', v_alloc.effective_jp_minutes,
        'items',               COALESCE(v_items, '[]'::jsonb)
      ) ELSE NULL END,
    'context_spec',           v_ctx,
    'assessment_spec',        v_asm,
    'rpm_ready_for_class',    fn_rpm_ready_for_class(p_profile_id, p_planning_context_id)
  );
END $$;
REVOKE ALL ON FUNCTION fn_phase2c_get_pipeline_state(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION fn_phase2c_get_pipeline_state(uuid, uuid) TO service_role;

COMMIT;

-- Rollback boundary:
--   DROP TABLE IF EXISTS rancang_pipeline_state CASCADE;
--   DROP FUNCTION IF EXISTS fn_rpm_ready_for_class(UUID,UUID);
--   DROP FUNCTION IF EXISTS fn_update_pipeline_state(UUID,UUID);
--   Restore fn_phase2c_get_pipeline_state from 20260818000006 (remove rpm_ready_for_class field).
