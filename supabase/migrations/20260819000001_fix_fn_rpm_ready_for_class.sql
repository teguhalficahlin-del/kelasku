-- Fix fn_rpm_ready_for_class: rancang_meeting_allocations tidak punya kolom
-- profile_id maupun is_confirmed.
-- Perbaikan:
--   1. Hapus AND profile_id = p_profile_id (isolasi via planning_context_id FK)
--   2. Ganti AND is_confirmed = TRUE → AND confirmed_at IS NOT NULL
-- Semua logika lain identik dengan versi sebelumnya.

BEGIN;

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
  -- 1. meeting_allocation must be confirmed (confirmed_at IS NOT NULL, not superseded)
  SELECT EXISTS(
    SELECT 1 FROM rancang_meeting_allocations
    WHERE planning_context_id = p_planning_context_id
      AND confirmed_at        IS NOT NULL
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
    AND ma.confirmed_at        IS NOT NULL
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

COMMIT;
