-- Phase 2: Material Spec validator + assessment confirmed gate + add material_spec to pipeline state.
-- Additive only. Zero changes to existing tables or data.
-- Depends on: 20260818000007 (fn_artifact_is_usable), 20260818000008 (fn_phase2c_get_pipeline_state).

BEGIN;

-- A. Validator schema untuk MATERIAL_SPEC content.
CREATE OR REPLACE FUNCTION fn_phase2_validate_material_spec(
  p_content JSONB
) RETURNS JSONB
LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_violations JSONB := '[]'::JSONB;
  v_konsep     JSONB;
  v_konteks    JSONB;
BEGIN
  -- Rule 1: konsep_inti wajib dan minimal 1 item
  IF p_content->'konsep_inti' IS NULL
     OR jsonb_typeof(p_content->'konsep_inti') <> 'array'
     OR jsonb_array_length(p_content->'konsep_inti') = 0 THEN
    v_violations := v_violations || jsonb_build_array(
      jsonb_build_object('rule', 'KONSEP_REQUIRED',
        'message', 'konsep_inti wajib dan minimal 1 item')
    );
  ELSE
    FOR v_konsep IN SELECT value FROM jsonb_array_elements(p_content->'konsep_inti') LOOP
      IF v_konsep->>'id' IS NULL OR v_konsep->>'judul' IS NULL
         OR v_konsep->>'penjelasan' IS NULL THEN
        v_violations := v_violations || jsonb_build_array(
          jsonb_build_object('rule', 'KONSEP_INCOMPLETE',
            'message', 'Setiap konsep_inti harus punya id, judul, penjelasan')
        );
      END IF;
    END LOOP;
  END IF;

  -- Rule 2: konteks_nyata wajib dan minimal 1 item
  IF p_content->'konteks_nyata' IS NULL
     OR jsonb_typeof(p_content->'konteks_nyata') <> 'array'
     OR jsonb_array_length(p_content->'konteks_nyata') = 0 THEN
    v_violations := v_violations || jsonb_build_array(
      jsonb_build_object('rule', 'KONTEKS_REQUIRED',
        'message', 'konteks_nyata wajib dan minimal 1 item')
    );
  ELSE
    FOR v_konteks IN SELECT value FROM jsonb_array_elements(p_content->'konteks_nyata') LOOP
      IF (v_konteks->>'sumber') NOT IN
         ('kehidupan_sehari', 'program_keahlian', 'daerah', 'umum') THEN
        v_violations := v_violations || jsonb_build_array(
          jsonb_build_object('rule', 'KONTEKS_SUMBER_INVALID',
            'message', 'sumber konteks_nyata harus salah satu dari: kehidupan_sehari, program_keahlian, daerah, umum')
        );
      END IF;
    END LOOP;
  END IF;

  -- Rule 3: applied_context_decision_ids wajib minimal 1
  IF p_content->'applied_context_decision_ids' IS NULL
     OR jsonb_typeof(p_content->'applied_context_decision_ids') <> 'array'
     OR jsonb_array_length(p_content->'applied_context_decision_ids') = 0 THEN
    v_violations := v_violations || jsonb_build_array(
      jsonb_build_object('rule', 'CONTEXT_TRACE_REQUIRED',
        'message', 'applied_context_decision_ids wajib minimal 1 ID')
    );
  END IF;

  IF jsonb_array_length(v_violations) > 0 THEN
    RETURN jsonb_build_object('status', 'invalid', 'violations', v_violations);
  END IF;
  RETURN jsonb_build_object('status', 'valid', 'violations', '[]'::JSONB);
END;
$$;
REVOKE ALL ON FUNCTION fn_phase2_validate_material_spec(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_phase2_validate_material_spec(JSONB) TO authenticated;

-- B. Gate function: ASSESSMENT_SPEC confirmed + usable — parallel to fn_phase2c_context_spec_confirmed.
CREATE OR REPLACE FUNCTION fn_phase2c_assessment_spec_confirmed(
  p_profile_id          uuid,
  p_planning_context_id uuid
) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM rancang_artifacts a
    JOIN rancang_artifact_selections sel ON sel.artifact_id = a.id
    JOIN rancang_artifact_version_states avs ON avs.version_id = sel.selected_version_id
    WHERE a.planning_context_id = p_planning_context_id
      AND a.artifact_kind       = 'ASSESSMENT_SPEC'
      AND a.scope_key           = 'ROOT'
      AND a.profile_id          = p_profile_id
      AND avs.lifecycle_status  = 'CONFIRMED'
      AND avs.usable            = true
  )
$$;
REVOKE ALL ON FUNCTION fn_phase2c_assessment_spec_confirmed(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION fn_phase2c_assessment_spec_confirmed(uuid, uuid) TO service_role;

-- C. Update fn_phase2c_get_pipeline_state to include material_spec.
--    All existing fields preserved verbatim; material_spec added as fourth artifact field.
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
  v_mat   jsonb := 'null'::jsonb;
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
  SELECT fn_phase2c_artifact_state_json(p_profile_id, p_planning_context_id, 'MATERIAL_SPEC')   INTO v_mat;

  RETURN jsonb_build_object(
    'planning_context_id',     p_planning_context_id,
    'tp_id',                   v_pc.tp_id,
    'selected_tp_revision_id', v_pc.selected_tp_revision_id,
    'meeting_allocation',      CASE WHEN v_alloc.id IS NOT NULL THEN
      jsonb_build_object(
        'id',                   v_alloc.id,
        'confirmed',            true,
        'total_jp_tp',          v_alloc.total_jp_tp,
        'effective_jp_minutes', v_alloc.effective_jp_minutes,
        'items',                COALESCE(v_items, '[]'::jsonb)
      ) ELSE NULL END,
    'context_spec',            v_ctx,
    'assessment_spec',         v_asm,
    'material_spec',           v_mat,
    'rpm_ready_for_class',     fn_rpm_ready_for_class(p_profile_id, p_planning_context_id)
  );
END $$;
REVOKE ALL ON FUNCTION fn_phase2c_get_pipeline_state(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION fn_phase2c_get_pipeline_state(uuid, uuid) TO service_role;

COMMIT;

-- Rollback boundary:
--   DROP FUNCTION IF EXISTS fn_phase2_validate_material_spec(JSONB);
--   DROP FUNCTION IF EXISTS fn_phase2c_assessment_spec_confirmed(uuid,uuid);
--   Restore fn_phase2c_get_pipeline_state from 20260818000008 (remove material_spec, rpm_ready_for_class fields).
