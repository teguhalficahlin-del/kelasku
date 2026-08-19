-- ─────────────────────────────────────────────────────────────────────────────
-- 20260819000002_fix_fn_phase2c_artifact_state_json.sql
--
-- BUG: fn_phase2c_get_pipeline_state mengembalikan usable=false,
--      lifecycle_status=null, content=null padahal row di
--      rancang_artifact_version_states ada dan sehat
--      (usable=true, lifecycle_status='GENERATED', decision_status='ACCEPTED').
--
-- ROOT CAUSE: bukan filter decision_status pada JOIN — lookup selected version
--   memang sudah tanpa filter. Penyebabnya semantik row-comparison PostgreSQL:
--
--     <row_variable> IS NOT NULL
--
--   bernilai TRUE hanya jika SEMUA field baris non-NULL. Karena
--   rancang_artifact_version_states.invalidation_reason dan .confirmed_at
--   normalnya NULL, ekspresi `v_state IS NOT NULL` selalu FALSE — sehingga
--   setiap CASE jatuh ke cabang ELSE. Hal yang sama terjadi pada
--   `v_version IS NOT NULL` (kolom nullable pada rancang_artifact_versions)
--   sehingga content/origin ikut NULL.
--
--   Bukti pada version_id 95b8e8e2-a188-4470-9482-d74a8204c3bd:
--     avs IS NOT NULL            -> false
--     avs.version_id IS NOT NULL -> true
--     v   IS NOT NULL            -> false
--     sel IS NOT NULL            -> true   (semua kolom kebetulan non-NULL,
--                                           itulah sebabnya selected_version_id
--                                           dan selection_revision tetap benar)
--
-- FIX: ganti seluruh guard row-level dengan flag boolean yang di-set dari FOUND
--   sesudah masing-masing SELECT ... INTO. Guard baru bebas dari jumlah kolom
--   NULL di dalam baris.
--
-- Dua fungsi terdampak dengan pola identik:
--   1. fn_phase2c_artifact_state_json  (CONTEXT_SPEC, ASSESSMENT_SPEC,
--                                       MATERIAL_SPEC, FOLLOW_UP,
--                                       VALIDATION_REPORT)
--   2. fn_phase2c_meeting_plan_state_json (MEETING_PLAN per meeting_no)
--
-- Tambahan (sesuai kontrak UI): daftar candidates mengecualikan versi yang
-- sedang terpilih, menyamakan perilaku server dengan filter klien di
-- guru/js/classroom-rancang.js.
--
-- Idempotent: CREATE OR REPLACE + REVOKE/GRANT diulang. Tidak ada DDL tabel,
-- tidak ada perubahan data. Kedua fungsi STABLE (read-only).
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. fn_phase2c_artifact_state_json
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_phase2c_artifact_state_json(
  p_profile_id uuid,
  p_planning_context_id uuid,
  p_artifact_kind text
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $fn$
DECLARE
  v_artifact      rancang_artifacts;
  v_selection     rancang_artifact_selections;
  v_version       rancang_artifact_versions;
  v_state         rancang_artifact_version_states;
  v_candidates    jsonb;
  v_has_selection boolean := false;
  v_has_version   boolean := false;
  v_has_state     boolean := false;
BEGIN
  SELECT * INTO v_artifact FROM rancang_artifacts
    WHERE planning_context_id=p_planning_context_id AND artifact_kind=p_artifact_kind
      AND scope_key='ROOT' AND profile_id=p_profile_id;
  IF NOT FOUND THEN RETURN 'null'::jsonb; END IF;

  SELECT * INTO v_selection FROM rancang_artifact_selections WHERE artifact_id=v_artifact.id;
  v_has_selection := FOUND;

  IF v_has_selection THEN
    SELECT * INTO v_version FROM rancang_artifact_versions WHERE id=v_selection.selected_version_id;
    v_has_version := FOUND;

    IF v_has_version THEN
      SELECT * INTO v_state FROM rancang_artifact_version_states WHERE version_id=v_version.id;
      v_has_state := FOUND;
    END IF;
  END IF;

  -- Unresolved candidates (CANDIDATE status, usable), tidak termasuk versi terpilih
  SELECT jsonb_agg(jsonb_build_object(
    'version_id', av.id, 'version_no', av.version_no, 'origin', av.origin,
    'teacher_edited', av.teacher_edited, 'created_at', av.created_at,
    'lifecycle_status', avs.lifecycle_status, 'usable', avs.usable
  ) ORDER BY av.version_no DESC) INTO v_candidates
  FROM rancang_artifact_versions av
  JOIN rancang_artifact_version_states avs ON avs.version_id=av.id
  WHERE av.artifact_id=v_artifact.id
    AND avs.decision_status='CANDIDATE' AND avs.usable=true
    AND (NOT v_has_selection OR av.id IS DISTINCT FROM v_selection.selected_version_id);

  RETURN jsonb_build_object(
    'artifact_id', v_artifact.id,
    'selected_version_id', CASE WHEN v_has_selection THEN v_selection.selected_version_id ELSE NULL END,
    'selected_version_no', CASE WHEN v_has_version   THEN v_version.version_no ELSE NULL END,
    'lifecycle_status', CASE WHEN v_has_state THEN v_state.lifecycle_status ELSE NULL END,
    'decision_status', CASE WHEN v_has_state THEN v_state.decision_status ELSE NULL END,
    'needs_update', CASE WHEN v_has_state THEN v_state.needs_update ELSE NULL END,
    'usable', CASE WHEN v_has_state THEN v_state.usable ELSE false END,
    'confirmed', CASE WHEN v_has_state THEN v_state.lifecycle_status='CONFIRMED' ELSE false END,
    'content', CASE WHEN v_has_version THEN v_version.content ELSE NULL END,
    'origin', CASE WHEN v_has_version THEN v_version.origin ELSE NULL END,
    'teacher_edited', CASE WHEN v_has_version THEN v_version.teacher_edited ELSE false END,
    'candidates', COALESCE(v_candidates, '[]'::jsonb),
    'selection_revision', CASE WHEN v_has_selection THEN v_selection.selection_revision ELSE NULL END
  );
END $fn$;

REVOKE ALL     ON FUNCTION fn_phase2c_artifact_state_json(uuid,uuid,text) FROM PUBLIC;
REVOKE ALL     ON FUNCTION fn_phase2c_artifact_state_json(uuid,uuid,text) FROM anon;
REVOKE ALL     ON FUNCTION fn_phase2c_artifact_state_json(uuid,uuid,text) FROM authenticated;
GRANT  EXECUTE ON FUNCTION fn_phase2c_artifact_state_json(uuid,uuid,text) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. fn_phase2c_meeting_plan_state_json — pola bug identik
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_phase2c_meeting_plan_state_json(
  p_profile_id          uuid,
  p_planning_context_id uuid,
  p_meeting_no          int
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_artifact      rancang_artifacts;
  v_selection     rancang_artifact_selections;
  v_version       rancang_artifact_versions;
  v_state         rancang_artifact_version_states;
  v_candidates    jsonb;
  v_has_selection boolean := false;
  v_has_version   boolean := false;
  v_has_state     boolean := false;
BEGIN
  SELECT * INTO v_artifact FROM rancang_artifacts
    WHERE planning_context_id = p_planning_context_id
      AND artifact_kind       = 'MEETING_PLAN'
      AND scope_key           = fn_meeting_scope_key(p_meeting_no)
      AND profile_id          = p_profile_id;
  IF NOT FOUND THEN RETURN 'null'::jsonb; END IF;

  SELECT * INTO v_selection FROM rancang_artifact_selections WHERE artifact_id = v_artifact.id;
  v_has_selection := FOUND;

  IF v_has_selection THEN
    SELECT * INTO v_version FROM rancang_artifact_versions WHERE id = v_selection.selected_version_id;
    v_has_version := FOUND;

    IF v_has_version THEN
      SELECT * INTO v_state FROM rancang_artifact_version_states WHERE version_id = v_version.id;
      v_has_state := FOUND;
    END IF;
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
    AND avs.usable          = true
    AND (NOT v_has_selection OR av.id IS DISTINCT FROM v_selection.selected_version_id);

  RETURN jsonb_build_object(
    'artifact_id',         v_artifact.id,
    'selected_version_id', CASE WHEN v_has_selection THEN v_selection.selected_version_id ELSE NULL END,
    'selected_version_no', CASE WHEN v_has_version   THEN v_version.version_no ELSE NULL END,
    'lifecycle_status',    CASE WHEN v_has_state THEN v_state.lifecycle_status ELSE NULL END,
    'decision_status',     CASE WHEN v_has_state THEN v_state.decision_status ELSE NULL END,
    'needs_update',        CASE WHEN v_has_state THEN v_state.needs_update ELSE NULL END,
    'usable',              CASE WHEN v_has_state THEN v_state.usable ELSE false END,
    'origin',              CASE WHEN v_has_version THEN v_version.origin ELSE NULL END,
    'teacher_edited',      CASE WHEN v_has_version THEN v_version.teacher_edited ELSE false END,
    'content',             CASE WHEN v_has_version THEN v_version.content ELSE NULL END,
    'candidates',          COALESCE(v_candidates, '[]'::jsonb),
    'selection_revision',  CASE WHEN v_has_selection THEN v_selection.selection_revision ELSE NULL END
  );
END $fn$;

REVOKE ALL     ON FUNCTION fn_phase2c_meeting_plan_state_json(uuid,uuid,int) FROM PUBLIC;
REVOKE ALL     ON FUNCTION fn_phase2c_meeting_plan_state_json(uuid,uuid,int) FROM anon;
REVOKE ALL     ON FUNCTION fn_phase2c_meeting_plan_state_json(uuid,uuid,int) FROM authenticated;
GRANT  EXECUTE ON FUNCTION fn_phase2c_meeting_plan_state_json(uuid,uuid,int) TO service_role;
