-- Phase 2: Meeting Plan validator + material gate + meeting state helper + pipeline state update.
-- Additive only. Zero changes to existing tables or data.
-- Depends on: 000007 (fn_meeting_scope_key, fn_artifact_is_usable),
--             000008 (rancang_pipeline_state, fn_rpm_ready_for_class),
--             000009 (fn_phase2c_artifact_state_json, fn_phase2c_get_pipeline_state with material_spec).

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- A. Validator: MEETING_PLAN content schema + duration exact check
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_phase2_validate_meeting_plan(
  p_content                    JSONB,
  p_expected_duration_minutes  INT
) RETURNS JSONB
LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_violations  JSONB := '[]'::JSONB;
  v_act         JSONB;
  v_total_min   INT   := 0;
  v_diff        JSONB;
  v_jalur       TEXT;
BEGIN
  IF jsonb_typeof(p_content) <> 'object' THEN
    RETURN jsonb_build_object('status','invalid','violations',
      jsonb_build_array(jsonb_build_object('rule','INVALID_ROOT',
        'message','Content harus berupa JSON object')));
  END IF;

  -- meeting_no, jp, duration_minutes harus ada dan > 0
  IF (p_content->>'meeting_no') IS NULL OR (p_content->>'meeting_no')::int <= 0 THEN
    v_violations := v_violations || jsonb_build_array(jsonb_build_object(
      'rule','MISSING_MEETING_NO','message','meeting_no harus ada dan > 0'));
  END IF;
  IF (p_content->>'jp') IS NULL OR (p_content->>'jp')::int <= 0 THEN
    v_violations := v_violations || jsonb_build_array(jsonb_build_object(
      'rule','MISSING_JP','message','jp harus ada dan > 0'));
  END IF;
  IF (p_content->>'duration_minutes') IS NULL OR (p_content->>'duration_minutes')::int <= 0 THEN
    v_violations := v_violations || jsonb_build_array(jsonb_build_object(
      'rule','MISSING_DURATION','message','duration_minutes harus ada dan > 0'));
  END IF;

  -- activities: tidak kosong, tiap item valid, SUM = p_expected_duration_minutes
  IF p_content->'activities' IS NULL
     OR jsonb_typeof(p_content->'activities') <> 'array'
     OR jsonb_array_length(p_content->'activities') = 0 THEN
    v_violations := v_violations || jsonb_build_array(jsonb_build_object(
      'rule','MISSING_ACTIVITIES','message','activities harus array tidak kosong'));
  ELSE
    FOR v_act IN SELECT value FROM jsonb_array_elements(p_content->'activities') LOOP
      -- required string fields
      IF (v_act->>'step_id')       IS NULL OR btrim(v_act->>'step_id')       = ''
      OR (v_act->>'title')         IS NULL OR btrim(v_act->>'title')         = ''
      OR (v_act->>'teacher_action') IS NULL OR btrim(v_act->>'teacher_action') = ''
      OR (v_act->>'student_action') IS NULL OR btrim(v_act->>'student_action') = ''
      OR (v_act->>'completion_cue') IS NULL OR btrim(v_act->>'completion_cue') = '' THEN
        v_violations := v_violations || jsonb_build_array(jsonb_build_object(
          'rule','INCOMPLETE_ACTIVITY',
          'scope', COALESCE(v_act->>'step_id','?'),
          'message','Activity wajib punya step_id, title, teacher_action, student_action, completion_cue'));
      END IF;
      -- planned_minutes > 0
      IF (v_act->>'planned_minutes') IS NULL OR (v_act->>'planned_minutes')::int <= 0 THEN
        v_violations := v_violations || jsonb_build_array(jsonb_build_object(
          'rule','INVALID_PLANNED_MINUTES',
          'scope', COALESCE(v_act->>'step_id','?'),
          'message','planned_minutes harus > 0'));
      ELSE
        v_total_min := v_total_min + (v_act->>'planned_minutes')::int;
      END IF;
      -- phase harus valid
      IF (v_act->>'phase') NOT IN ('opening','understand','apply','reflect','closing') THEN
        v_violations := v_violations || jsonb_build_array(jsonb_build_object(
          'rule','INVALID_PHASE',
          'scope', COALESCE(v_act->>'step_id','?'),
          'message','phase harus salah satu: opening, understand, apply, reflect, closing'));
      END IF;
    END LOOP;

    -- durasi tepat
    IF v_total_min <> p_expected_duration_minutes THEN
      v_violations := v_violations || jsonb_build_array(jsonb_build_object(
        'rule','DURATION_MISMATCH',
        'message', format('Total planned_minutes (%s) harus persis = %s menit',
          v_total_min, p_expected_duration_minutes)));
    END IF;
  END IF;

  -- formative_checkpoint wajib ada
  IF p_content->'formative_checkpoint' IS NULL
     OR jsonb_typeof(p_content->'formative_checkpoint') <> 'object' THEN
    v_violations := v_violations || jsonb_build_array(jsonb_build_object(
      'rule','MISSING_FORMATIVE','message','formative_checkpoint wajib ada'));
  ELSE
    IF NOT (
      (p_content->'formative_checkpoint'->'classification_anchor') ? 'paham' AND
      (p_content->'formative_checkpoint'->'classification_anchor') ? 'hampir' AND
      (p_content->'formative_checkpoint'->'classification_anchor') ? 'belum'
    ) THEN
      v_violations := v_violations || jsonb_build_array(jsonb_build_object(
        'rule','INCOMPLETE_CLASSIFICATION_ANCHOR',
        'message','classification_anchor harus punya paham, hampir, belum'));
    END IF;
  END IF;

  -- differentiation wajib 3 jalur, tiap jalur punya aktivitas + bukti_belajar
  IF p_content->'differentiation' IS NULL
     OR jsonb_typeof(p_content->'differentiation') <> 'object' THEN
    v_violations := v_violations || jsonb_build_array(jsonb_build_object(
      'rule','MISSING_DIFFERENTIATION','message','differentiation wajib ada'));
  ELSE
    FOREACH v_jalur IN ARRAY ARRAY['paham','hampir','belum'] LOOP
      IF NOT (p_content->'differentiation' ? v_jalur) THEN
        v_violations := v_violations || jsonb_build_array(jsonb_build_object(
          'rule','MISSING_DIFF_JALUR','scope',v_jalur,
          'message','differentiation.' || v_jalur || ' wajib ada'));
      ELSE
        v_diff := p_content->'differentiation'->v_jalur;
        IF (v_diff->>'aktivitas') IS NULL OR btrim(v_diff->>'aktivitas') = '' THEN
          v_violations := v_violations || jsonb_build_array(jsonb_build_object(
            'rule','DIFF_AKTIVITAS_KOSONG','scope',v_jalur,
            'message','differentiation.' || v_jalur || '.aktivitas tidak boleh kosong'));
        END IF;
        IF (v_diff->>'bukti_belajar') IS NULL OR btrim(v_diff->>'bukti_belajar') = '' THEN
          v_violations := v_violations || jsonb_build_array(jsonb_build_object(
            'rule','DIFF_BUKTI_KOSONG','scope',v_jalur,
            'message','differentiation.' || v_jalur || '.bukti_belajar tidak boleh kosong'));
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- applied_context_decision_ids minimal 1
  IF p_content->'applied_context_decision_ids' IS NULL
     OR jsonb_typeof(p_content->'applied_context_decision_ids') <> 'array'
     OR jsonb_array_length(p_content->'applied_context_decision_ids') = 0 THEN
    v_violations := v_violations || jsonb_build_array(jsonb_build_object(
      'rule','MISSING_CONTEXT_TRACE',
      'message','applied_context_decision_ids wajib minimal 1'));
  END IF;

  -- worksheet: jika required=true maka tasks tidak boleh kosong
  IF p_content->'worksheet' IS NOT NULL
     AND jsonb_typeof(p_content->'worksheet') = 'object'
     AND (p_content->'worksheet'->>'required')::boolean = true THEN
    IF p_content->'worksheet'->'tasks' IS NULL
       OR jsonb_typeof(p_content->'worksheet'->'tasks') <> 'array'
       OR jsonb_array_length(p_content->'worksheet'->'tasks') = 0 THEN
      v_violations := v_violations || jsonb_build_array(jsonb_build_object(
        'rule','WORKSHEET_TASKS_KOSONG',
        'message','worksheet.required=true tapi tasks kosong'));
    END IF;
  END IF;

  IF jsonb_array_length(v_violations) > 0 THEN
    RETURN jsonb_build_object('status','invalid','violations',v_violations);
  END IF;
  RETURN jsonb_build_object('status','valid','violations','[]'::JSONB);
END;
$$;
REVOKE ALL ON FUNCTION fn_phase2_validate_meeting_plan(JSONB,INT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION fn_phase2_validate_meeting_plan(JSONB,INT) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- B. Gate: MATERIAL_SPEC selected version usable
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_phase2c_material_spec_usable(
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
      AND a.artifact_kind       = 'MATERIAL_SPEC'
      AND a.scope_key           = 'ROOT'
      AND a.profile_id          = p_profile_id
      AND avs.usable            = true
  )
$$;
REVOKE ALL ON FUNCTION fn_phase2c_material_spec_usable(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION fn_phase2c_material_spec_usable(uuid,uuid) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- C. Helper: MEETING_PLAN artifact state — mirrors fn_phase2c_artifact_state_json
--    but uses scope_key = fn_meeting_scope_key(p_meeting_no) instead of 'ROOT'.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_phase2c_meeting_plan_state_json(
  p_profile_id          uuid,
  p_planning_context_id uuid,
  p_meeting_no          int
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_artifact   rancang_artifacts;
  v_selection  rancang_artifact_selections;
  v_version    rancang_artifact_versions;
  v_state      rancang_artifact_version_states;
  v_candidates jsonb;
BEGIN
  SELECT * INTO v_artifact FROM rancang_artifacts
    WHERE planning_context_id = p_planning_context_id
      AND artifact_kind       = 'MEETING_PLAN'
      AND scope_key           = fn_meeting_scope_key(p_meeting_no)
      AND profile_id          = p_profile_id;
  IF NOT FOUND THEN RETURN 'null'::jsonb; END IF;

  SELECT * INTO v_selection FROM rancang_artifact_selections WHERE artifact_id = v_artifact.id;
  IF FOUND THEN
    SELECT * INTO v_version FROM rancang_artifact_versions WHERE id = v_selection.selected_version_id;
    SELECT * INTO v_state   FROM rancang_artifact_version_states WHERE version_id = v_version.id;
  END IF;

  SELECT jsonb_agg(jsonb_build_object(
    'version_id',       av.id,
    'version_no',       av.version_no,
    'origin',           av.origin,
    'teacher_edited',   av.teacher_edited,
    'created_at',       av.created_at,
    'lifecycle_status', avs.lifecycle_status,
    'usable',           avs.usable
  ) ORDER BY av.version_no DESC) INTO v_candidates
  FROM rancang_artifact_versions av
  JOIN rancang_artifact_version_states avs ON avs.version_id = av.id
  WHERE av.artifact_id      = v_artifact.id
    AND avs.decision_status = 'CANDIDATE'
    AND avs.usable          = true;

  RETURN jsonb_build_object(
    'artifact_id',         v_artifact.id,
    'selected_version_id', CASE WHEN v_selection IS NOT NULL THEN v_selection.selected_version_id ELSE NULL END,
    'selected_version_no', CASE WHEN v_version IS NOT NULL THEN v_version.version_no ELSE NULL END,
    'lifecycle_status',    CASE WHEN v_state IS NOT NULL THEN v_state.lifecycle_status ELSE NULL END,
    'decision_status',     CASE WHEN v_state IS NOT NULL THEN v_state.decision_status ELSE NULL END,
    'needs_update',        CASE WHEN v_state IS NOT NULL THEN v_state.needs_update ELSE NULL END,
    'usable',              CASE WHEN v_state IS NOT NULL THEN v_state.usable ELSE false END,
    'origin',              CASE WHEN v_version IS NOT NULL THEN v_version.origin ELSE NULL END,
    'teacher_edited',      CASE WHEN v_version IS NOT NULL THEN v_version.teacher_edited ELSE false END,
    'content',             CASE WHEN v_version IS NOT NULL THEN v_version.content ELSE NULL END,
    'candidates',          COALESCE(v_candidates, '[]'::jsonb),
    'selection_revision',  CASE WHEN v_selection IS NOT NULL THEN v_selection.selection_revision ELSE NULL END
  );
END $$;
REVOKE ALL ON FUNCTION fn_phase2c_meeting_plan_state_json(uuid,uuid,int) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION fn_phase2c_meeting_plan_state_json(uuid,uuid,int) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- D. Update fn_phase2c_get_pipeline_state — tambah field meeting_plans.
--    Semua field lama dipertahankan verbatim.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_phase2c_get_pipeline_state(
  p_profile_id          uuid,
  p_planning_context_id uuid
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_pc            rancang_planning_contexts;
  v_alloc         rancang_meeting_allocations;
  v_items         jsonb;
  v_ctx           jsonb := 'null'::jsonb;
  v_asm           jsonb := 'null'::jsonb;
  v_mat           jsonb := 'null'::jsonb;
  v_meeting_plans jsonb := '[]'::jsonb;
  v_item          record;
  v_mp_state      jsonb;
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

    -- Build meeting_plans: one entry per allocation_item
    FOR v_item IN
      SELECT mi.id, mi.meeting_no, mi.jp, mi.duration_minutes
      FROM rancang_meeting_allocation_items mi
      WHERE mi.meeting_allocation_id = v_alloc.id
      ORDER BY mi.meeting_no
    LOOP
      v_mp_state := fn_phase2c_meeting_plan_state_json(
        p_profile_id, p_planning_context_id, v_item.meeting_no
      );
      v_meeting_plans := v_meeting_plans || jsonb_build_array(
        jsonb_build_object(
          'meeting_no',         v_item.meeting_no,
          'scope_key',          fn_meeting_scope_key(v_item.meeting_no),
          'allocation_item_id', v_item.id,
          'jp',                 v_item.jp,
          'duration_minutes',   v_item.duration_minutes
        ) ||
        CASE WHEN v_mp_state = 'null'::jsonb THEN
          jsonb_build_object(
            'artifact_id',         NULL,
            'usable',              false,
            'selected_version_id', NULL,
            'selected_version_no', NULL,
            'lifecycle_status',    NULL,
            'origin',              NULL,
            'teacher_edited',      false,
            'content',             NULL,
            'needs_update',        false,
            'candidates',          '[]'::jsonb,
            'selection_revision',  NULL
          )
        ELSE v_mp_state END
      );
    END LOOP;
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
    'meeting_plans',           v_meeting_plans,
    'rpm_ready_for_class',     fn_rpm_ready_for_class(p_profile_id, p_planning_context_id)
  );
END $$;
REVOKE ALL ON FUNCTION fn_phase2c_get_pipeline_state(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION fn_phase2c_get_pipeline_state(uuid,uuid) TO service_role;

COMMIT;

-- Rollback boundary:
--   DROP FUNCTION IF EXISTS fn_phase2_validate_meeting_plan(JSONB,INT);
--   DROP FUNCTION IF EXISTS fn_phase2c_material_spec_usable(uuid,uuid);
--   DROP FUNCTION IF EXISTS fn_phase2c_meeting_plan_state_json(uuid,uuid,int);
--   Restore fn_phase2c_get_pipeline_state dari 20260818000009 (hapus meeting_plans field).
