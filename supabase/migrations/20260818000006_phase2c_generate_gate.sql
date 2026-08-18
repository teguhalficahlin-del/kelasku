-- Phase 2C: generation gate helpers — additive, service_role only.
-- No new tables. Adds query helpers and gate checks for the Phase 2C pipeline.
-- Builds on Phase 2B artifact lifecycle without touching Phase 1 / Phase 2A rows.

BEGIN;

-- Returns snapshot of artifact state for CONTEXT_SPEC and ASSESSMENT_SPEC
-- for a given planning context. Authoritative source for the frontend and Edge Function.
CREATE OR REPLACE FUNCTION fn_phase2c_get_pipeline_state(
  p_profile_id uuid,
  p_planning_context_id uuid
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_pc rancang_planning_contexts;
  v_alloc rancang_meeting_allocations;
  v_items jsonb;
  v_ctx jsonb := 'null'::jsonb;
  v_asm jsonb := 'null'::jsonb;
BEGIN
  SELECT * INTO v_pc FROM rancang_planning_contexts
    WHERE id=p_planning_context_id AND profile_id=p_profile_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Planning Context tidak diizinkan' USING ERRCODE='42501'; END IF;

  SELECT * INTO v_alloc FROM rancang_meeting_allocations
    WHERE planning_context_id=p_planning_context_id AND superseded_at IS NULL;

  IF FOUND THEN
    SELECT jsonb_agg(jsonb_build_object(
      'meeting_no', mi.meeting_no, 'jp', mi.jp, 'duration_minutes', mi.duration_minutes
    ) ORDER BY mi.meeting_no) INTO v_items
    FROM rancang_meeting_allocation_items mi WHERE mi.meeting_allocation_id=v_alloc.id;
  END IF;

  -- Read selected version state for each artifact kind
  SELECT fn_phase2c_artifact_state_json(p_profile_id, p_planning_context_id, 'CONTEXT_SPEC') INTO v_ctx;
  SELECT fn_phase2c_artifact_state_json(p_profile_id, p_planning_context_id, 'ASSESSMENT_SPEC') INTO v_asm;

  RETURN jsonb_build_object(
    'planning_context_id', p_planning_context_id,
    'tp_id', v_pc.tp_id,
    'selected_tp_revision_id', v_pc.selected_tp_revision_id,
    'meeting_allocation', CASE WHEN v_alloc.id IS NOT NULL THEN
      jsonb_build_object(
        'id', v_alloc.id, 'confirmed', true, 'total_jp_tp', v_alloc.total_jp_tp,
        'effective_jp_minutes', v_alloc.effective_jp_minutes,
        'items', COALESCE(v_items, '[]'::jsonb)
      ) ELSE NULL END,
    'context_spec', v_ctx,
    'assessment_spec', v_asm
  );
END $$;

-- Returns artifact state JSON for one kind — used internally by fn_phase2c_get_pipeline_state
CREATE OR REPLACE FUNCTION fn_phase2c_artifact_state_json(
  p_profile_id uuid,
  p_planning_context_id uuid,
  p_artifact_kind text
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_artifact rancang_artifacts;
  v_selection rancang_artifact_selections;
  v_version rancang_artifact_versions;
  v_state rancang_artifact_version_states;
  v_candidates jsonb;
BEGIN
  SELECT * INTO v_artifact FROM rancang_artifacts
    WHERE planning_context_id=p_planning_context_id AND artifact_kind=p_artifact_kind
      AND scope_key='ROOT' AND profile_id=p_profile_id;
  IF NOT FOUND THEN RETURN 'null'::jsonb; END IF;

  SELECT * INTO v_selection FROM rancang_artifact_selections WHERE artifact_id=v_artifact.id;

  IF FOUND THEN
    SELECT * INTO v_version FROM rancang_artifact_versions WHERE id=v_selection.selected_version_id;
    SELECT * INTO v_state FROM rancang_artifact_version_states WHERE version_id=v_version.id;
  END IF;

  -- Unresolved candidates (CANDIDATE status, usable)
  SELECT jsonb_agg(jsonb_build_object(
    'version_id', av.id, 'version_no', av.version_no, 'origin', av.origin,
    'teacher_edited', av.teacher_edited, 'created_at', av.created_at,
    'lifecycle_status', avs.lifecycle_status, 'usable', avs.usable
  ) ORDER BY av.version_no DESC) INTO v_candidates
  FROM rancang_artifact_versions av
  JOIN rancang_artifact_version_states avs ON avs.version_id=av.id
  WHERE av.artifact_id=v_artifact.id
    AND avs.decision_status='CANDIDATE' AND avs.usable=true;

  RETURN jsonb_build_object(
    'artifact_id', v_artifact.id,
    'selected_version_id', CASE WHEN v_selection IS NOT NULL THEN v_selection.selected_version_id ELSE NULL END,
    'selected_version_no', CASE WHEN v_version IS NOT NULL THEN v_version.version_no ELSE NULL END,
    'lifecycle_status', CASE WHEN v_state IS NOT NULL THEN v_state.lifecycle_status ELSE NULL END,
    'decision_status', CASE WHEN v_state IS NOT NULL THEN v_state.decision_status ELSE NULL END,
    'needs_update', CASE WHEN v_state IS NOT NULL THEN v_state.needs_update ELSE NULL END,
    'usable', CASE WHEN v_state IS NOT NULL THEN v_state.usable ELSE false END,
    'confirmed', CASE WHEN v_state IS NOT NULL THEN v_state.lifecycle_status='CONFIRMED' ELSE false END,
    'content', CASE WHEN v_version IS NOT NULL THEN v_version.content ELSE NULL END,
    'origin', CASE WHEN v_version IS NOT NULL THEN v_version.origin ELSE NULL END,
    'teacher_edited', CASE WHEN v_version IS NOT NULL THEN v_version.teacher_edited ELSE false END,
    'candidates', COALESCE(v_candidates, '[]'::jsonb),
    'selection_revision', CASE WHEN v_selection IS NOT NULL THEN v_selection.selection_revision ELSE NULL END
  );
END $$;

-- Gate check: is CONTEXT_SPEC confirmed AND selected? Used before ASSESSMENT_SPEC generation.
CREATE OR REPLACE FUNCTION fn_phase2c_context_spec_confirmed(
  p_profile_id uuid,
  p_planning_context_id uuid
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM rancang_artifacts a
    JOIN rancang_artifact_selections sel ON sel.artifact_id=a.id
    JOIN rancang_artifact_version_states avs ON avs.version_id=sel.selected_version_id
    WHERE a.planning_context_id=p_planning_context_id AND a.artifact_kind='CONTEXT_SPEC'
      AND a.scope_key='ROOT' AND a.profile_id=p_profile_id
      AND avs.lifecycle_status='CONFIRMED' AND avs.usable=true
  )
$$;

-- Deterministic validation: CONTEXT_SPEC content structure
CREATE OR REPLACE FUNCTION fn_phase2c_validate_context_spec(p_content jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_violations jsonb := '[]'::jsonb;
  v_dec jsonb;
  v_i int;
BEGIN
  IF jsonb_typeof(p_content) <> 'object' THEN
    RETURN jsonb_build_object('status','fail','violations',
      jsonb_build_array(jsonb_build_object('rule','INVALID_ROOT','message','Content harus berupa JSON object')));
  END IF;
  IF NOT (p_content ? 'context_decisions' AND jsonb_typeof(p_content->'context_decisions')='array'
          AND jsonb_array_length(p_content->'context_decisions') > 0) THEN
    v_violations := v_violations || jsonb_build_array(jsonb_build_object(
      'rule','MISSING_CONTEXT_DECISIONS','message','context_decisions harus array tidak kosong'));
  ELSE
    v_i := 0;
    FOR v_dec IN SELECT value FROM jsonb_array_elements(p_content->'context_decisions') LOOP
      v_i := v_i+1;
      IF NOT (v_dec ? 'source' AND v_dec ? 'raw' AND v_dec ? 'interpretation' AND v_dec ? 'implication') THEN
        v_violations := v_violations || jsonb_build_array(jsonb_build_object(
          'rule','INCOMPLETE_DECISION','scope','context_decisions['||v_i||']',
          'message','Setiap decision harus memiliki source, raw, interpretation, implication'));
      END IF;
      IF NOT (v_dec ? 'prefer' AND jsonb_typeof(v_dec->'prefer')='array')
         OR NOT (v_dec ? 'avoid' AND jsonb_typeof(v_dec->'avoid')='array') THEN
        v_violations := v_violations || jsonb_build_array(jsonb_build_object(
          'rule','MISSING_PREFER_AVOID','scope','context_decisions['||v_i||']',
          'message','Setiap decision harus memiliki prefer dan avoid sebagai array'));
      END IF;
    END LOOP;
  END IF;
  IF NOT (p_content ? 'constraints' AND jsonb_typeof(p_content->'constraints')='array') THEN
    v_violations := v_violations || jsonb_build_array(jsonb_build_object(
      'rule','MISSING_CONSTRAINTS','message','constraints harus berupa array'));
  END IF;
  IF NOT (p_content ? 'contextual_opportunities' AND jsonb_typeof(p_content->'contextual_opportunities')='array') THEN
    v_violations := v_violations || jsonb_build_array(jsonb_build_object(
      'rule','MISSING_OPPORTUNITIES','message','contextual_opportunities harus berupa array'));
  END IF;
  RETURN jsonb_build_object(
    'status', CASE WHEN jsonb_array_length(v_violations)=0 THEN 'valid' ELSE 'invalid' END,
    'violations', v_violations
  );
END $$;

-- Deterministic validation: ASSESSMENT_SPEC content structure
CREATE OR REPLACE FUNCTION fn_phase2c_validate_assessment_spec(p_content jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_violations jsonb := '[]'::jsonb;
  v_k jsonb;
  v_f jsonb;
  v_i int;
BEGIN
  IF jsonb_typeof(p_content) <> 'object' THEN
    RETURN jsonb_build_object('status','fail','violations',
      jsonb_build_array(jsonb_build_object('rule','INVALID_ROOT','message','Content harus berupa JSON object')));
  END IF;
  IF NOT (p_content ? 'success_evidence' AND jsonb_typeof(p_content->'success_evidence')='array'
          AND jsonb_array_length(p_content->'success_evidence') > 0) THEN
    v_violations := v_violations || jsonb_build_array(jsonb_build_object(
      'rule','MISSING_SUCCESS_EVIDENCE','message','success_evidence harus array tidak kosong'));
  END IF;
  IF NOT (p_content ? 'kktp' AND jsonb_typeof(p_content->'kktp')='array'
          AND jsonb_array_length(p_content->'kktp') > 0) THEN
    v_violations := v_violations || jsonb_build_array(jsonb_build_object(
      'rule','MISSING_KKTP','message','kktp harus array tidak kosong'));
  ELSE
    v_i := 0;
    FOR v_k IN SELECT value FROM jsonb_array_elements(p_content->'kktp') LOOP
      v_i := v_i+1;
      IF NOT (v_k ? 'deskripsi') THEN
        v_violations := v_violations || jsonb_build_array(jsonb_build_object(
          'rule','INCOMPLETE_KKTP','scope','kktp['||v_i||']',
          'message','Setiap KKTP harus memiliki deskripsi'));
      END IF;
      IF NOT (v_k ? 'paham' AND v_k ? 'hampir' AND v_k ? 'belum') THEN
        v_violations := v_violations || jsonb_build_array(jsonb_build_object(
          'rule','MISSING_CLASSIFICATION_ANCHOR','scope','kktp['||v_i||']',
          'message','Setiap KKTP harus memiliki anchor paham, hampir, belum'));
      END IF;
    END LOOP;
  END IF;
  IF NOT (p_content ? 'formative' AND jsonb_typeof(p_content->'formative')='array') THEN
    v_violations := v_violations || jsonb_build_array(jsonb_build_object(
      'rule','MISSING_FORMATIVE','message','formative harus berupa array'));
  ELSE
    v_i := 0;
    FOR v_f IN SELECT value FROM jsonb_array_elements(p_content->'formative') LOOP
      v_i := v_i+1;
      IF NOT (v_f ? 'meeting_no' AND v_f ? 'expected_evidence' AND v_f ? 'classification_anchor') THEN
        v_violations := v_violations || jsonb_build_array(jsonb_build_object(
          'rule','INCOMPLETE_FORMATIVE','scope','formative['||v_i||']',
          'message','Setiap formative harus memiliki meeting_no, expected_evidence, classification_anchor'));
      END IF;
    END LOOP;
  END IF;
  IF NOT (p_content ? 'summative' AND jsonb_typeof(p_content->'summative')='object') THEN
    v_violations := v_violations || jsonb_build_array(jsonb_build_object(
      'rule','MISSING_SUMMATIVE','message','summative harus berupa object'));
  END IF;
  RETURN jsonb_build_object(
    'status', CASE WHEN jsonb_array_length(v_violations)=0 THEN 'valid' ELSE 'invalid' END,
    'violations', v_violations
  );
END $$;

REVOKE EXECUTE ON FUNCTION fn_phase2c_get_pipeline_state(uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION fn_phase2c_artifact_state_json(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION fn_phase2c_context_spec_confirmed(uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION fn_phase2c_validate_context_spec(jsonb) FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION fn_phase2c_validate_assessment_spec(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION fn_phase2c_get_pipeline_state(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION fn_phase2c_artifact_state_json(uuid,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION fn_phase2c_context_spec_confirmed(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION fn_phase2c_validate_context_spec(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION fn_phase2c_validate_assessment_spec(jsonb) TO service_role;

COMMIT;

-- Rollback boundary: DROP FUNCTION fn_phase2c_get_pipeline_state, fn_phase2c_artifact_state_json,
-- fn_phase2c_context_spec_confirmed, fn_phase2c_validate_context_spec, fn_phase2c_validate_assessment_spec.
-- No tables were created; no Phase 1/2A/2B rows are modified.
