-- Phase 2: Follow-Up validator + all_meetings_usable gate + pipeline_state trigger +
--          FOLLOW_UP + VALIDATION_REPORT fields in fn_phase2c_get_pipeline_state.
-- Additive only. Zero changes to existing tables or rows.
-- Depends on: 000010 (fn_phase2c_meeting_plan_state_json, fn_phase2c_get_pipeline_state
--             with meeting_plans), 000008 (fn_update_pipeline_state, rancang_pipeline_state),
--             000007 (fn_artifact_is_usable, fn_phase2c_artifact_state_json).

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- A1. fn_phase2_validate_follow_up — schema validation for FOLLOW_UP content.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_phase2_validate_follow_up(
  p_content JSONB
) RETURNS JSONB
LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_violations JSONB := '[]'::JSONB;
  v_jalur      TEXT;
  v_jalur_obj  JSONB;
  v_act        JSONB;
  v_desc       TEXT;
BEGIN
  IF jsonb_typeof(p_content) <> 'object' THEN
    RETURN jsonb_build_object('status', 'invalid', 'violations',
      jsonb_build_array(jsonb_build_object(
        'rule', 'INVALID_ROOT', 'message', 'Content harus berupa JSON object')));
  END IF;

  -- Wajib ada: pengayaan, penguatan, pendampingan
  FOREACH v_jalur IN ARRAY ARRAY['pengayaan','penguatan','pendampingan'] LOOP
    IF NOT (p_content ? v_jalur) OR jsonb_typeof(p_content->v_jalur) <> 'object' THEN
      v_violations := v_violations || jsonb_build_array(jsonb_build_object(
        'rule', 'MISSING_JALUR', 'scope', v_jalur,
        'message', v_jalur || ' wajib ada dan berupa object'));
      CONTINUE;
    END IF;

    v_jalur_obj := p_content->v_jalur;

    -- Setiap jalur wajib punya minimal 1 activity
    IF v_jalur_obj->'activities' IS NULL
       OR jsonb_typeof(v_jalur_obj->'activities') <> 'array'
       OR jsonb_array_length(v_jalur_obj->'activities') = 0 THEN
      v_violations := v_violations || jsonb_build_array(jsonb_build_object(
        'rule', 'MISSING_ACTIVITIES', 'scope', v_jalur,
        'message', v_jalur || ' harus punya minimal 1 activity'));
      CONTINUE;
    END IF;

    -- Setiap activity wajib punya id, deskripsi, durasi_estimasi (tidak kosong)
    FOR v_act IN SELECT value FROM jsonb_array_elements(v_jalur_obj->'activities') LOOP
      IF (v_act->>'id') IS NULL OR btrim(v_act->>'id') = '' THEN
        v_violations := v_violations || jsonb_build_array(jsonb_build_object(
          'rule', 'ACTIVITY_MISSING_ID', 'scope', v_jalur,
          'message', v_jalur || ': activity.id tidak boleh kosong'));
      END IF;

      v_desc := v_act->>'deskripsi';
      IF v_desc IS NULL OR btrim(v_desc) = '' THEN
        v_violations := v_violations || jsonb_build_array(jsonb_build_object(
          'rule', 'ACTIVITY_MISSING_DESKRIPSI', 'scope', v_jalur,
          'message', v_jalur || ': activity.deskripsi tidak boleh kosong'));
      ELSIF length(btrim(v_desc)) < 30 THEN
        -- Deskripsi terlalu pendek — kemungkinan kalimat generik
        v_violations := v_violations || jsonb_build_array(jsonb_build_object(
          'rule', 'FOLLOWUP_GENERIC', 'scope', v_jalur,
          'message', v_jalur || ': deskripsi activity terlalu singkat (<30 karakter) — '
            || 'harus konkret, bukan kalimat generik'));
      END IF;

      IF (v_act->>'durasi_estimasi') IS NULL OR btrim(v_act->>'durasi_estimasi') = '' THEN
        v_violations := v_violations || jsonb_build_array(jsonb_build_object(
          'rule', 'ACTIVITY_MISSING_DURASI', 'scope', v_jalur,
          'message', v_jalur || ': activity.durasi_estimasi tidak boleh kosong'));
      END IF;
    END LOOP;
  END LOOP;

  -- kktp_refs wajib ada dan minimal 1 item
  IF p_content->'kktp_refs' IS NULL
     OR jsonb_typeof(p_content->'kktp_refs') <> 'array'
     OR jsonb_array_length(p_content->'kktp_refs') = 0 THEN
    v_violations := v_violations || jsonb_build_array(jsonb_build_object(
      'rule', 'MISSING_KKTP_REFS',
      'message', 'kktp_refs wajib ada dan minimal 1 item'));
  END IF;

  IF jsonb_array_length(v_violations) > 0 THEN
    RETURN jsonb_build_object('status', 'invalid', 'violations', v_violations);
  END IF;
  RETURN jsonb_build_object('status', 'valid', 'violations', '[]'::JSONB);
END;
$$;
REVOKE ALL ON FUNCTION fn_phase2_validate_follow_up(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION fn_phase2_validate_follow_up(JSONB) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- A2. fn_phase2c_all_meetings_usable — gate: all allocation meetings are usable.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_phase2c_all_meetings_usable(
  p_profile_id          UUID,
  p_planning_context_id UUID
) RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_alloc_count   INT := 0;
  v_usable_count  INT := 0;
BEGIN
  -- Count expected meetings from the confirmed (non-superseded) allocation
  SELECT COUNT(*) INTO v_alloc_count
  FROM rancang_meeting_allocations ma
  JOIN rancang_meeting_allocation_items mai ON mai.meeting_allocation_id = ma.id
  WHERE ma.planning_context_id = p_planning_context_id
    AND ma.profile_id           = p_profile_id
    AND ma.superseded_at       IS NULL;

  IF v_alloc_count = 0 THEN RETURN FALSE; END IF;

  -- Count usable MEETING_PLAN artifacts (fn_artifact_is_usable = true)
  SELECT COUNT(*) INTO v_usable_count
  FROM rancang_artifacts a
  JOIN rancang_artifact_selections sel ON sel.artifact_id = a.id
  JOIN rancang_artifact_version_states avs ON avs.version_id = sel.selected_version_id
  WHERE a.planning_context_id = p_planning_context_id
    AND a.profile_id          = p_profile_id
    AND a.artifact_kind       = 'MEETING_PLAN'
    AND fn_artifact_is_usable(avs.lifecycle_status, avs.needs_update);

  RETURN (v_usable_count > 0 AND v_usable_count = v_alloc_count);
END;
$$;
REVOKE ALL ON FUNCTION fn_phase2c_all_meetings_usable(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION fn_phase2c_all_meetings_usable(UUID, UUID) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- A3. Update fn_phase2c_get_pipeline_state — tambah field follow_up + validation_report.
--     Semua field lama dipertahankan verbatim dari 000010.
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
  v_follow_up     jsonb := 'null'::jsonb;
  v_validation    jsonb := 'null'::jsonb;
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

  SELECT fn_phase2c_artifact_state_json(p_profile_id, p_planning_context_id, 'CONTEXT_SPEC')    INTO v_ctx;
  SELECT fn_phase2c_artifact_state_json(p_profile_id, p_planning_context_id, 'ASSESSMENT_SPEC') INTO v_asm;
  SELECT fn_phase2c_artifact_state_json(p_profile_id, p_planning_context_id, 'MATERIAL_SPEC')   INTO v_mat;
  SELECT fn_phase2c_artifact_state_json(p_profile_id, p_planning_context_id, 'FOLLOW_UP')       INTO v_follow_up;
  SELECT fn_phase2c_artifact_state_json(p_profile_id, p_planning_context_id, 'VALIDATION_REPORT') INTO v_validation;

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
    'follow_up',               v_follow_up,
    'validation_report',       v_validation,
    'rpm_ready_for_class',     fn_rpm_ready_for_class(p_profile_id, p_planning_context_id)
  );
END $$;
REVOKE ALL ON FUNCTION fn_phase2c_get_pipeline_state(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION fn_phase2c_get_pipeline_state(uuid, uuid) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- A4. Trigger: trg_artifact_state_change — integrasikan fn_update_pipeline_state.
--     Guard: hanya fire jika lifecycle_status atau needs_update benar-benar berubah.
--     Tidak ada recursive risk — trigger pada rancang_artifact_version_states,
--     bukan pada rancang_pipeline_state.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION trg_update_pipeline_state()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_profile_id    UUID;
  v_planning_id   UUID;
BEGIN
  -- Guard: skip if relevant columns unchanged (UPDATE only; INSERT always proceeds)
  IF TG_OP = 'UPDATE' THEN
    IF NEW.lifecycle_status IS NOT DISTINCT FROM OLD.lifecycle_status
       AND NEW.needs_update IS NOT DISTINCT FROM OLD.needs_update THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Resolve planning_context_id + profile_id from the version row
  SELECT av.profile_id, av.planning_context_id
    INTO v_profile_id, v_planning_id
    FROM rancang_artifact_versions av
    WHERE av.id = NEW.version_id;

  IF v_profile_id IS NOT NULL AND v_planning_id IS NOT NULL THEN
    PERFORM fn_update_pipeline_state(v_profile_id, v_planning_id);
  END IF;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION trg_update_pipeline_state() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_artifact_state_change ON rancang_artifact_version_states;
CREATE TRIGGER trg_artifact_state_change
  AFTER INSERT OR UPDATE OF lifecycle_status, needs_update
  ON rancang_artifact_version_states
  FOR EACH ROW EXECUTE FUNCTION trg_update_pipeline_state();

COMMIT;

-- Rollback boundary:
--   DROP FUNCTION IF EXISTS fn_phase2_validate_follow_up(JSONB);
--   DROP FUNCTION IF EXISTS fn_phase2c_all_meetings_usable(UUID, UUID);
--   DROP TRIGGER IF EXISTS trg_artifact_state_change ON rancang_artifact_version_states;
--   DROP FUNCTION IF EXISTS trg_update_pipeline_state();
--   Restore fn_phase2c_get_pipeline_state dari 000010 (hapus follow_up + validation_report fields).
