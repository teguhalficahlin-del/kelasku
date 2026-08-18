-- Phase 2B: durable Step 6 artifact lifecycle foundation.
-- Additive only. No generation pipeline, document rendering, or Runtime tables are introduced here.

BEGIN;

CREATE TABLE rancang_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  planning_context_id uuid NOT NULL REFERENCES rancang_planning_contexts(id) ON DELETE RESTRICT,
  artifact_kind text NOT NULL CHECK (artifact_kind IN (
    'CONTEXT_SPEC','ASSESSMENT_SPEC','MATERIAL_SPEC','MEETING_PLAN','FOLLOW_UP','VALIDATION_REPORT'
  )),
  scope_key text NOT NULL DEFAULT 'ROOT' CHECK (btrim(scope_key) <> ''),
  meeting_allocation_item_id uuid REFERENCES rancang_meeting_allocation_items(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  CHECK ((artifact_kind='MEETING_PLAN') = (meeting_allocation_item_id IS NOT NULL)),
  UNIQUE (planning_context_id, artifact_kind, scope_key)
);

CREATE TABLE rancang_artifact_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artifact_id uuid NOT NULL REFERENCES rancang_artifacts(id) ON DELETE RESTRICT,
  version_no integer NOT NULL CHECK (version_no > 0),
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  planning_context_id uuid NOT NULL REFERENCES rancang_planning_contexts(id) ON DELETE RESTRICT,
  tp_id uuid NOT NULL REFERENCES rancang_tp(id) ON DELETE RESTRICT,
  tp_revision_id uuid NOT NULL REFERENCES rancang_tp_revisions(id) ON DELETE RESTRICT,
  meeting_allocation_id uuid REFERENCES rancang_meeting_allocations(id) ON DELETE RESTRICT,
  parent_version_id uuid REFERENCES rancang_artifact_versions(id) ON DELETE RESTRICT,
  candidate_of_version_id uuid REFERENCES rancang_artifact_versions(id) ON DELETE RESTRICT,
  origin text NOT NULL CHECK (origin IN ('AI','TEACHER','SYSTEM')),
  teacher_edited boolean NOT NULL DEFAULT false,
  content jsonb NOT NULL,
  source_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_hash text NOT NULL CHECK (source_hash ~ '^[0-9a-f]{64}$'),
  dependency_hash text NOT NULL CHECK (dependency_hash ~ '^[0-9a-f]{64}$'),
  prompt_version text,
  model_version text,
  created_by uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT teacher_edited OR origin IN ('AI','TEACHER')),
  CHECK (parent_version_id IS NULL OR parent_version_id <> id),
  CHECK (candidate_of_version_id IS NULL OR candidate_of_version_id <> id),
  UNIQUE (artifact_id, version_no)
);

CREATE TABLE rancang_artifact_version_states (
  version_id uuid PRIMARY KEY REFERENCES rancang_artifact_versions(id) ON DELETE RESTRICT,
  lifecycle_status text NOT NULL CHECK (lifecycle_status IN ('PENDING','GENERATING','GENERATED','CONFIRMED','FAILED')),
  decision_status text NOT NULL DEFAULT 'CANDIDATE' CHECK (decision_status IN ('CANDIDATE','ACCEPTED','REJECTED','SUPERSEDED')),
  validation_status text NOT NULL DEFAULT 'INCOMPLETE' CHECK (validation_status IN ('INCOMPLETE','VALID','INVALID')),
  needs_update boolean NOT NULL DEFAULT false,
  usable boolean NOT NULL DEFAULT false,
  invalidation_reason text,
  validation_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  confirmed_at timestamptz,
  rejected_at timestamptz,
  invalidated_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (decision_status <> 'ACCEPTED' OR lifecycle_status IN ('GENERATED','CONFIRMED')),
  CHECK (decision_status <> 'REJECTED' OR rejected_at IS NOT NULL),
  CHECK (NOT needs_update OR invalidated_at IS NOT NULL),
  CHECK (usable = (
    lifecycle_status IN ('GENERATED','CONFIRMED')
    AND needs_update=false
  ))
);

CREATE TABLE rancang_artifact_selections (
  artifact_id uuid PRIMARY KEY REFERENCES rancang_artifacts(id) ON DELETE RESTRICT,
  selected_version_id uuid NOT NULL UNIQUE REFERENCES rancang_artifact_versions(id) ON DELETE RESTRICT,
  selected_by uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  selected_at timestamptz NOT NULL DEFAULT now(),
  selection_revision bigint NOT NULL DEFAULT 1 CHECK (selection_revision > 0)
);

CREATE TABLE rancang_artifact_dependencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artifact_version_id uuid NOT NULL REFERENCES rancang_artifact_versions(id) ON DELETE RESTRICT,
  dependency_kind text NOT NULL CHECK (dependency_kind IN (
    'PLANNING_CONTEXT','TP_REVISION','MEETING_ALLOCATION','MEETING_ALLOCATION_ITEM','ARTIFACT_VERSION','STEP_SNAPSHOT'
  )),
  planning_context_id uuid REFERENCES rancang_planning_contexts(id) ON DELETE RESTRICT,
  tp_revision_id uuid REFERENCES rancang_tp_revisions(id) ON DELETE RESTRICT,
  meeting_allocation_id uuid REFERENCES rancang_meeting_allocations(id) ON DELETE RESTRICT,
  meeting_allocation_item_id uuid REFERENCES rancang_meeting_allocation_items(id) ON DELETE RESTRICT,
  depends_on_version_id uuid REFERENCES rancang_artifact_versions(id) ON DELETE RESTRICT,
  snapshot_key text,
  dependency_hash text NOT NULL CHECK (dependency_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (dependency_kind='PLANNING_CONTEXT' AND planning_context_id IS NOT NULL AND tp_revision_id IS NULL AND meeting_allocation_id IS NULL AND meeting_allocation_item_id IS NULL AND depends_on_version_id IS NULL AND snapshot_key IS NULL) OR
    (dependency_kind='TP_REVISION' AND planning_context_id IS NULL AND tp_revision_id IS NOT NULL AND meeting_allocation_id IS NULL AND meeting_allocation_item_id IS NULL AND depends_on_version_id IS NULL AND snapshot_key IS NULL) OR
    (dependency_kind='MEETING_ALLOCATION' AND planning_context_id IS NULL AND tp_revision_id IS NULL AND meeting_allocation_id IS NOT NULL AND meeting_allocation_item_id IS NULL AND depends_on_version_id IS NULL AND snapshot_key IS NULL) OR
    (dependency_kind='MEETING_ALLOCATION_ITEM' AND planning_context_id IS NULL AND tp_revision_id IS NULL AND meeting_allocation_id IS NULL AND meeting_allocation_item_id IS NOT NULL AND depends_on_version_id IS NULL AND snapshot_key IS NULL) OR
    (dependency_kind='ARTIFACT_VERSION' AND planning_context_id IS NULL AND tp_revision_id IS NULL AND meeting_allocation_id IS NULL AND meeting_allocation_item_id IS NULL AND depends_on_version_id IS NOT NULL AND snapshot_key IS NULL) OR
    (dependency_kind='STEP_SNAPSHOT' AND planning_context_id IS NULL AND tp_revision_id IS NULL AND meeting_allocation_id IS NULL AND meeting_allocation_item_id IS NULL AND depends_on_version_id IS NULL AND btrim(COALESCE(snapshot_key,'')) <> '')
  ),
  CHECK (depends_on_version_id IS NULL OR depends_on_version_id <> artifact_version_id)
);

CREATE UNIQUE INDEX uq_rancang_artifact_dependency
  ON rancang_artifact_dependencies (
    artifact_version_id, dependency_kind,
    COALESCE(planning_context_id,'00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(tp_revision_id,'00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(meeting_allocation_id,'00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(meeting_allocation_item_id,'00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(depends_on_version_id,'00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(snapshot_key,'')
  );

CREATE TABLE rancang_artifact_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artifact_id uuid NOT NULL REFERENCES rancang_artifacts(id) ON DELETE RESTRICT,
  version_id uuid REFERENCES rancang_artifact_versions(id) ON DELETE RESTRICT,
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (event_type IN (
    'CREATED','GENERATED','EDITED','CONFIRMED','REGENERATED','CANDIDATE_ACCEPTED','CANDIDATE_REJECTED',
    'NEEDS_UPDATE','FAILED','RECOVERED','VALIDATED'
  )),
  actor_type text NOT NULL CHECK (actor_type IN ('TEACHER','SERVER','AI','SYSTEM')),
  event_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key text NOT NULL CHECK (btrim(idempotency_key) <> ''),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, idempotency_key)
);

CREATE INDEX idx_rancang_artifacts_owner_context ON rancang_artifacts(profile_id,planning_context_id);
CREATE INDEX idx_rancang_artifact_versions_artifact ON rancang_artifact_versions(artifact_id,version_no);
CREATE INDEX idx_rancang_artifact_dependencies_target_version ON rancang_artifact_dependencies(depends_on_version_id);
CREATE INDEX idx_rancang_artifact_dependencies_context ON rancang_artifact_dependencies(planning_context_id);
CREATE INDEX idx_rancang_artifact_dependencies_tp_revision ON rancang_artifact_dependencies(tp_revision_id);
CREATE INDEX idx_rancang_artifact_dependencies_allocation ON rancang_artifact_dependencies(meeting_allocation_id);
CREATE INDEX idx_rancang_artifact_dependencies_allocation_item ON rancang_artifact_dependencies(meeting_allocation_item_id);
CREATE INDEX idx_rancang_artifact_events_artifact ON rancang_artifact_events(artifact_id,created_at);

ALTER TABLE rancang_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE rancang_artifact_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE rancang_artifact_version_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE rancang_artifact_selections ENABLE ROW LEVEL SECURITY;
ALTER TABLE rancang_artifact_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE rancang_artifact_events ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION fn_phase2b_owns_artifact(p_artifact_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (SELECT 1 FROM rancang_artifacts WHERE id=p_artifact_id AND profile_id=fn_current_profile_id())
$$;
CREATE OR REPLACE FUNCTION fn_phase2b_owns_version(p_version_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (
    SELECT 1 FROM rancang_artifact_versions v JOIN rancang_artifacts a ON a.id=v.artifact_id
    WHERE v.id=p_version_id AND a.profile_id=fn_current_profile_id()
  )
$$;
REVOKE EXECUTE ON FUNCTION fn_phase2b_owns_artifact(uuid) FROM PUBLIC,anon;
REVOKE EXECUTE ON FUNCTION fn_phase2b_owns_version(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION fn_phase2b_owns_artifact(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_phase2b_owns_version(uuid) TO authenticated;

CREATE POLICY rancang_artifacts_select_self ON rancang_artifacts FOR SELECT TO authenticated
  USING (profile_id=fn_current_profile_id());
CREATE POLICY rancang_artifact_versions_select_self ON rancang_artifact_versions FOR SELECT TO authenticated
  USING (fn_phase2b_owns_artifact(artifact_id));
CREATE POLICY rancang_artifact_version_states_select_self ON rancang_artifact_version_states FOR SELECT TO authenticated
  USING (fn_phase2b_owns_version(version_id));
CREATE POLICY rancang_artifact_selections_select_self ON rancang_artifact_selections FOR SELECT TO authenticated
  USING (fn_phase2b_owns_artifact(artifact_id));
CREATE POLICY rancang_artifact_dependencies_select_self ON rancang_artifact_dependencies FOR SELECT TO authenticated
  USING (fn_phase2b_owns_version(artifact_version_id));
CREATE POLICY rancang_artifact_events_select_self ON rancang_artifact_events FOR SELECT TO authenticated
  USING (fn_phase2b_owns_artifact(artifact_id));

GRANT SELECT ON rancang_artifacts,rancang_artifact_versions,rancang_artifact_version_states,
  rancang_artifact_selections,rancang_artifact_dependencies,rancang_artifact_events TO authenticated;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON
  rancang_artifacts,rancang_artifact_versions,rancang_artifact_version_states,
  rancang_artifact_selections,rancang_artifact_dependencies,rancang_artifact_events FROM authenticated;
REVOKE ALL ON rancang_artifacts,rancang_artifact_versions,rancang_artifact_version_states,
  rancang_artifact_selections,rancang_artifact_dependencies,rancang_artifact_events FROM anon;
GRANT SELECT,INSERT,UPDATE,DELETE ON rancang_artifacts,rancang_artifact_versions,rancang_artifact_version_states,
  rancang_artifact_selections,rancang_artifact_dependencies,rancang_artifact_events TO service_role;

CREATE OR REPLACE FUNCTION fn_phase2b_block_immutable_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  RAISE EXCEPTION 'Artifact version/dependency/event history is append-only' USING ERRCODE='42501';
END $$;
CREATE TRIGGER trg_phase2b_versions_immutable BEFORE UPDATE OR DELETE ON rancang_artifact_versions
  FOR EACH ROW EXECUTE FUNCTION fn_phase2b_block_immutable_mutation();
CREATE TRIGGER trg_phase2b_dependencies_immutable BEFORE UPDATE OR DELETE ON rancang_artifact_dependencies
  FOR EACH ROW EXECUTE FUNCTION fn_phase2b_block_immutable_mutation();
CREATE TRIGGER trg_phase2b_events_immutable BEFORE UPDATE OR DELETE ON rancang_artifact_events
  FOR EACH ROW EXECUTE FUNCTION fn_phase2b_block_immutable_mutation();

CREATE OR REPLACE FUNCTION fn_phase2b_recompute_usable(p_version_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  UPDATE rancang_artifact_version_states
  SET usable=(lifecycle_status IN ('GENERATED','CONFIRMED') AND needs_update=false),updated_at=now()
  WHERE version_id=p_version_id;
END $$;

CREATE OR REPLACE FUNCTION fn_phase2b_create_version(
  p_profile_id uuid,p_planning_context_id uuid,p_artifact_kind text,p_scope_key text,
  p_meeting_allocation_item_id uuid,p_parent_version_id uuid,p_candidate_of_version_id uuid,
  p_origin text,p_teacher_edited boolean,p_content jsonb,p_source_snapshot jsonb,
  p_source_hash text,p_dependency_hash text,p_prompt_version text,p_model_version text,
  p_dependencies jsonb,p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_pc rancang_planning_contexts; v_artifact rancang_artifacts; v_version rancang_artifact_versions;
  v_tp_revision rancang_tp_revisions; v_item rancang_meeting_allocation_items; v_ma rancang_meeting_allocations;
  v_dep jsonb; v_existing uuid; v_parent_artifact uuid; v_version_no integer;
BEGIN
  SELECT version_id INTO v_existing FROM rancang_artifact_events
    WHERE profile_id=p_profile_id AND idempotency_key=p_idempotency_key;
  IF FOUND THEN RETURN jsonb_build_object('artifact_id',(SELECT artifact_id FROM rancang_artifact_versions WHERE id=v_existing),'version_id',v_existing,'idempotent',true); END IF;
  SELECT * INTO v_pc FROM rancang_planning_contexts WHERE id=p_planning_context_id AND profile_id=p_profile_id FOR SHARE;
  IF NOT FOUND OR v_pc.status='ARCHIVED' THEN RAISE EXCEPTION 'Planning Context tidak diizinkan' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_tp_revision FROM rancang_tp_revisions WHERE id=v_pc.selected_tp_revision_id AND tp_id=v_pc.tp_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'TP revision Planning Context tidak valid' USING ERRCODE='42501'; END IF;
  IF p_artifact_kind NOT IN ('CONTEXT_SPEC','ASSESSMENT_SPEC','MATERIAL_SPEC','MEETING_PLAN','FOLLOW_UP','VALIDATION_REPORT')
     OR p_origin NOT IN ('AI','TEACHER','SYSTEM') OR btrim(COALESCE(p_scope_key,''))='' OR jsonb_typeof(p_dependencies)<>'array'
  THEN RAISE EXCEPTION 'Artifact payload tidak valid'; END IF;
  IF p_artifact_kind='MEETING_PLAN' THEN
    SELECT ma.* INTO v_ma FROM rancang_meeting_allocations ma JOIN rancang_meeting_allocation_items mi ON mi.meeting_allocation_id=ma.id
      WHERE mi.id=p_meeting_allocation_item_id AND ma.planning_context_id=p_planning_context_id;
    SELECT mi.* INTO v_item FROM rancang_meeting_allocation_items mi WHERE mi.id=p_meeting_allocation_item_id AND mi.meeting_allocation_id=v_ma.id;
    IF NOT FOUND OR (p_content ? 'meeting_no' AND (p_content->>'meeting_no')::int<>v_item.meeting_no)
       OR (p_content ? 'jp' AND (p_content->>'jp')::int<>v_item.jp)
       OR (p_content ? 'duration_minutes' AND (p_content->>'duration_minutes')::int<>v_item.duration_minutes)
    THEN RAISE EXCEPTION 'Meeting Allocation artifact tidak valid' USING ERRCODE='42501'; END IF;
  ELSIF p_meeting_allocation_item_id IS NOT NULL THEN
    RAISE EXCEPTION 'Allocation item hanya untuk Meeting Plan';
  END IF;
  INSERT INTO rancang_artifacts(profile_id,planning_context_id,artifact_kind,scope_key,meeting_allocation_item_id)
  VALUES(p_profile_id,p_planning_context_id,p_artifact_kind,p_scope_key,p_meeting_allocation_item_id)
  ON CONFLICT(planning_context_id,artifact_kind,scope_key) DO UPDATE SET scope_key=EXCLUDED.scope_key
  RETURNING * INTO v_artifact;
  IF v_artifact.profile_id<>p_profile_id OR v_artifact.meeting_allocation_item_id IS DISTINCT FROM p_meeting_allocation_item_id THEN
    RAISE EXCEPTION 'Artifact identity tidak diizinkan' USING ERRCODE='42501'; END IF;
  IF p_parent_version_id IS NOT NULL THEN
    SELECT artifact_id INTO v_parent_artifact FROM rancang_artifact_versions WHERE id=p_parent_version_id;
    IF v_parent_artifact IS DISTINCT FROM v_artifact.id THEN RAISE EXCEPTION 'Parent version tidak valid' USING ERRCODE='42501'; END IF;
  END IF;
  IF p_candidate_of_version_id IS NOT NULL THEN
    SELECT artifact_id INTO v_parent_artifact FROM rancang_artifact_versions WHERE id=p_candidate_of_version_id;
    IF v_parent_artifact IS DISTINCT FROM v_artifact.id THEN RAISE EXCEPTION 'Candidate source tidak valid' USING ERRCODE='42501'; END IF;
  END IF;
  PERFORM 1 FROM rancang_artifacts WHERE id=v_artifact.id FOR UPDATE;
  SELECT COALESCE(max(version_no),0)+1 INTO v_version_no FROM rancang_artifact_versions WHERE artifact_id=v_artifact.id;
  BEGIN
    INSERT INTO rancang_artifact_versions(artifact_id,version_no,profile_id,planning_context_id,tp_id,tp_revision_id,
      meeting_allocation_id,parent_version_id,candidate_of_version_id,origin,teacher_edited,content,source_snapshot,
      source_hash,dependency_hash,prompt_version,model_version,created_by)
    VALUES(v_artifact.id,v_version_no,p_profile_id,p_planning_context_id,v_pc.tp_id,v_pc.selected_tp_revision_id,
      v_ma.id,p_parent_version_id,p_candidate_of_version_id,p_origin,COALESCE(p_teacher_edited,false),p_content,
      COALESCE(p_source_snapshot,'{}'),p_source_hash,p_dependency_hash,NULLIF(p_prompt_version,''),NULLIF(p_model_version,''),p_profile_id)
    RETURNING * INTO v_version;
  END;
  IF NOT EXISTS(SELECT 1 FROM rancang_artifact_version_states WHERE version_id=v_version.id) THEN
    INSERT INTO rancang_artifact_version_states(version_id,lifecycle_status) VALUES(v_version.id,'GENERATING');
    FOR v_dep IN SELECT value FROM jsonb_array_elements(p_dependencies) LOOP
      IF (v_dep->>'kind'='PLANNING_CONTEXT' AND NULLIF(v_dep->>'planning_context_id','')::uuid IS DISTINCT FROM p_planning_context_id)
        OR (v_dep->>'kind'='TP_REVISION' AND NULLIF(v_dep->>'tp_revision_id','')::uuid IS DISTINCT FROM v_pc.selected_tp_revision_id)
        OR (v_dep->>'kind'='MEETING_ALLOCATION' AND NOT EXISTS (
          SELECT 1 FROM rancang_meeting_allocations x WHERE x.id=NULLIF(v_dep->>'meeting_allocation_id','')::uuid AND x.planning_context_id=p_planning_context_id))
        OR (v_dep->>'kind'='MEETING_ALLOCATION_ITEM' AND NOT EXISTS (
          SELECT 1 FROM rancang_meeting_allocation_items xi JOIN rancang_meeting_allocations x ON x.id=xi.meeting_allocation_id
          WHERE xi.id=NULLIF(v_dep->>'meeting_allocation_item_id','')::uuid AND x.planning_context_id=p_planning_context_id))
        OR (v_dep->>'kind'='ARTIFACT_VERSION' AND NOT EXISTS (
          SELECT 1 FROM rancang_artifact_versions xv JOIN rancang_artifacts xa ON xa.id=xv.artifact_id
          WHERE xv.id=NULLIF(v_dep->>'artifact_version_id','')::uuid AND xa.profile_id=p_profile_id
            AND xa.planning_context_id=p_planning_context_id))
      THEN RAISE EXCEPTION 'Dependency artifact tidak diizinkan' USING ERRCODE='42501'; END IF;
      INSERT INTO rancang_artifact_dependencies(artifact_version_id,dependency_kind,planning_context_id,tp_revision_id,
        meeting_allocation_id,meeting_allocation_item_id,depends_on_version_id,snapshot_key,dependency_hash)
      VALUES(v_version.id,v_dep->>'kind',NULLIF(v_dep->>'planning_context_id','')::uuid,NULLIF(v_dep->>'tp_revision_id','')::uuid,
        NULLIF(v_dep->>'meeting_allocation_id','')::uuid,NULLIF(v_dep->>'meeting_allocation_item_id','')::uuid,
        NULLIF(v_dep->>'artifact_version_id','')::uuid,NULLIF(v_dep->>'snapshot_key',''),v_dep->>'hash');
    END LOOP;
    INSERT INTO rancang_artifact_events(artifact_id,version_id,profile_id,event_type,actor_type,event_payload,idempotency_key)
    VALUES(v_artifact.id,v_version.id,p_profile_id,CASE WHEN p_candidate_of_version_id IS NULL THEN 'CREATED' ELSE 'REGENERATED' END,
      CASE p_origin WHEN 'AI' THEN 'AI' WHEN 'TEACHER' THEN 'TEACHER' ELSE 'SYSTEM' END,'{}',p_idempotency_key);
  END IF;
  RETURN jsonb_build_object('artifact_id',v_artifact.id,'version_id',v_version.id,'version_no',v_version.version_no,'idempotent',false);
END $$;

CREATE OR REPLACE FUNCTION fn_phase2b_transition_version(
  p_profile_id uuid,p_version_id uuid,p_action text,p_validation_status text,
  p_validation_summary jsonb,p_reason text,p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_version rancang_artifact_versions; v_state rancang_artifact_version_states; v_event text;
BEGIN
  IF EXISTS(SELECT 1 FROM rancang_artifact_events WHERE profile_id=p_profile_id AND idempotency_key=p_idempotency_key) THEN
    RETURN (SELECT to_jsonb(s) FROM rancang_artifact_version_states s WHERE s.version_id=p_version_id); END IF;
  SELECT v.* INTO v_version FROM rancang_artifact_versions v JOIN rancang_artifacts a ON a.id=v.artifact_id
    WHERE v.id=p_version_id AND a.profile_id=p_profile_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Artifact version tidak diizinkan' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_state FROM rancang_artifact_version_states WHERE version_id=p_version_id FOR UPDATE;
  IF p_action='GENERATED' AND v_state.lifecycle_status IN ('PENDING','GENERATING') THEN
    UPDATE rancang_artifact_version_states SET lifecycle_status='GENERATED',usable=(needs_update=false),updated_at=now() WHERE version_id=p_version_id; v_event:='GENERATED';
  ELSIF p_action='CONFIRM' AND v_state.lifecycle_status='GENERATED' THEN
    UPDATE rancang_artifact_version_states SET lifecycle_status='CONFIRMED',confirmed_at=now(),updated_at=now() WHERE version_id=p_version_id; v_event:='CONFIRMED';
  ELSIF p_action='FAIL' AND v_state.lifecycle_status IN ('PENDING','GENERATING') THEN
    UPDATE rancang_artifact_version_states SET lifecycle_status='FAILED',updated_at=now() WHERE version_id=p_version_id; v_event:='FAILED';
  ELSIF p_action='RECOVER' AND v_state.lifecycle_status='FAILED' THEN
    UPDATE rancang_artifact_version_states SET lifecycle_status='GENERATING',updated_at=now() WHERE version_id=p_version_id; v_event:='RECOVERED';
  ELSIF p_action='VALIDATE' AND p_validation_status IN ('INCOMPLETE','VALID','INVALID') THEN
    UPDATE rancang_artifact_version_states SET validation_status=p_validation_status,
      validation_summary=COALESCE(p_validation_summary,'{}'),updated_at=now() WHERE version_id=p_version_id; v_event:='VALIDATED';
  ELSE RAISE EXCEPTION 'Transition artifact tidak valid'; END IF;
  PERFORM fn_phase2b_recompute_usable(p_version_id);
  INSERT INTO rancang_artifact_events(artifact_id,version_id,profile_id,event_type,actor_type,event_payload,idempotency_key)
  VALUES(v_version.artifact_id,p_version_id,p_profile_id,v_event,'SERVER',jsonb_build_object('reason',p_reason),p_idempotency_key);
  RETURN (SELECT to_jsonb(s) FROM rancang_artifact_version_states s WHERE s.version_id=p_version_id);
END $$;

CREATE OR REPLACE FUNCTION fn_phase2b_decide_candidate(
  p_profile_id uuid,p_version_id uuid,p_decision text,p_expected_selection_revision bigint,p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_version rancang_artifact_versions; v_state rancang_artifact_version_states; v_selection rancang_artifact_selections; v_event text;
BEGIN
  IF EXISTS(SELECT 1 FROM rancang_artifact_events WHERE profile_id=p_profile_id AND idempotency_key=p_idempotency_key) THEN
    RETURN (SELECT to_jsonb(s) FROM rancang_artifact_selections s JOIN rancang_artifact_versions v ON v.artifact_id=s.artifact_id WHERE v.id=p_version_id); END IF;
  SELECT v.* INTO v_version FROM rancang_artifact_versions v JOIN rancang_artifacts a ON a.id=v.artifact_id
    WHERE v.id=p_version_id AND a.profile_id=p_profile_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Candidate tidak diizinkan' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_state FROM rancang_artifact_version_states WHERE version_id=p_version_id FOR UPDATE;
  IF v_state.decision_status<>'CANDIDATE' THEN RAISE EXCEPTION 'Candidate sudah diputuskan'; END IF;
  IF p_decision='ACCEPT' THEN
    IF v_state.lifecycle_status NOT IN ('GENERATED','CONFIRMED') OR v_state.validation_status<>'VALID' OR v_state.needs_update THEN
      RAISE EXCEPTION 'Candidate belum dapat diterima'; END IF;
    SELECT * INTO v_selection FROM rancang_artifact_selections WHERE artifact_id=v_version.artifact_id FOR UPDATE;
    IF FOUND AND (p_expected_selection_revision IS NULL OR v_selection.selection_revision<>p_expected_selection_revision) THEN
      RAISE EXCEPTION 'Selection conflict' USING ERRCODE='40001'; END IF;
    IF FOUND THEN
      UPDATE rancang_artifact_version_states SET decision_status='SUPERSEDED',updated_at=now()
        WHERE version_id=v_selection.selected_version_id AND decision_status='ACCEPTED';
      UPDATE rancang_artifact_selections SET selected_version_id=p_version_id,selected_by=p_profile_id,
        selected_at=now(),selection_revision=selection_revision+1 WHERE artifact_id=v_version.artifact_id RETURNING * INTO v_selection;
    ELSE
      IF p_expected_selection_revision IS NOT NULL AND p_expected_selection_revision<>0 THEN RAISE EXCEPTION 'Selection conflict' USING ERRCODE='40001'; END IF;
      INSERT INTO rancang_artifact_selections(artifact_id,selected_version_id,selected_by)
      VALUES(v_version.artifact_id,p_version_id,p_profile_id) RETURNING * INTO v_selection;
    END IF;
    UPDATE rancang_artifact_version_states SET decision_status='ACCEPTED',updated_at=now() WHERE version_id=p_version_id;
    PERFORM fn_phase2b_recompute_usable(p_version_id); v_event:='CANDIDATE_ACCEPTED';
  ELSIF p_decision='REJECT' THEN
    UPDATE rancang_artifact_version_states SET decision_status='REJECTED',rejected_at=now(),updated_at=now() WHERE version_id=p_version_id;
    v_event:='CANDIDATE_REJECTED';
  ELSE RAISE EXCEPTION 'Decision tidak valid'; END IF;
  INSERT INTO rancang_artifact_events(artifact_id,version_id,profile_id,event_type,actor_type,idempotency_key)
  VALUES(v_version.artifact_id,p_version_id,p_profile_id,v_event,'TEACHER',p_idempotency_key);
  RETURN jsonb_build_object('version_id',p_version_id,'decision',p_decision,'selection',to_jsonb(v_selection));
END $$;

CREATE OR REPLACE FUNCTION fn_phase2b_invalidate_dependants(
  p_profile_id uuid,p_dependency_kind text,p_dependency_id uuid,p_dependency_hash text,p_reason text,p_idempotency_prefix text
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_row record; v_count integer:=0;
BEGIN
  FOR v_row IN
    WITH RECURSIVE affected(version_id) AS (
      SELECT d.artifact_version_id FROM rancang_artifact_dependencies d
      JOIN rancang_artifact_versions v ON v.id=d.artifact_version_id JOIN rancang_artifacts a ON a.id=v.artifact_id
      WHERE a.profile_id=p_profile_id AND d.dependency_kind=p_dependency_kind AND d.dependency_hash<>p_dependency_hash
        AND ((p_dependency_kind='PLANNING_CONTEXT' AND d.planning_context_id=p_dependency_id)
          OR (p_dependency_kind='TP_REVISION' AND d.tp_revision_id=p_dependency_id)
          OR (p_dependency_kind='MEETING_ALLOCATION' AND d.meeting_allocation_id=p_dependency_id)
          OR (p_dependency_kind='MEETING_ALLOCATION_ITEM' AND d.meeting_allocation_item_id=p_dependency_id)
          OR (p_dependency_kind='ARTIFACT_VERSION' AND d.depends_on_version_id=p_dependency_id))
      UNION
      SELECT child.artifact_version_id FROM rancang_artifact_dependencies child
      JOIN affected parent ON child.depends_on_version_id=parent.version_id
      JOIN rancang_artifact_versions cv ON cv.id=child.artifact_version_id JOIN rancang_artifacts ca ON ca.id=cv.artifact_id
      WHERE child.dependency_kind='ARTIFACT_VERSION' AND ca.profile_id=p_profile_id
    )
    SELECT DISTINCT af.version_id AS artifact_version_id,v.artifact_id FROM affected af
    JOIN rancang_artifact_versions v ON v.id=af.version_id
  LOOP
    UPDATE rancang_artifact_version_states SET needs_update=true,usable=false,invalidation_reason=p_reason,
      invalidated_at=COALESCE(invalidated_at,now()),updated_at=now() WHERE version_id=v_row.artifact_version_id AND needs_update=false;
    IF FOUND THEN
      PERFORM fn_phase2b_recompute_usable(v_row.artifact_version_id); v_count:=v_count+1;
      INSERT INTO rancang_artifact_events(artifact_id,version_id,profile_id,event_type,actor_type,event_payload,idempotency_key)
      VALUES(v_row.artifact_id,v_row.artifact_version_id,p_profile_id,'NEEDS_UPDATE','SYSTEM',jsonb_build_object('reason',p_reason),
        p_idempotency_prefix||':'||v_row.artifact_version_id::text) ON CONFLICT(profile_id,idempotency_key) DO NOTHING;
    END IF;
  END LOOP;
  RETURN v_count;
END $$;

CREATE OR REPLACE FUNCTION fn_phase2b_rpm_ready_for_class(p_profile_id uuid,p_planning_context_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  -- Locked false in Phase 2B. Future migration may replace this only after all Step 6 validators exist.
  SELECT false FROM rancang_planning_contexts WHERE id=p_planning_context_id AND profile_id=p_profile_id
$$;

REVOKE EXECUTE ON FUNCTION fn_phase2b_recompute_usable(uuid) FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION fn_phase2b_create_version(uuid,uuid,text,text,uuid,uuid,uuid,text,boolean,jsonb,jsonb,text,text,text,text,jsonb,text) FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION fn_phase2b_transition_version(uuid,uuid,text,text,jsonb,text,text) FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION fn_phase2b_decide_candidate(uuid,uuid,text,bigint,text) FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION fn_phase2b_invalidate_dependants(uuid,text,uuid,text,text,text) FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION fn_phase2b_rpm_ready_for_class(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION fn_phase2b_recompute_usable(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION fn_phase2b_create_version(uuid,uuid,text,text,uuid,uuid,uuid,text,boolean,jsonb,jsonb,text,text,text,text,jsonb,text) TO service_role;
GRANT EXECUTE ON FUNCTION fn_phase2b_transition_version(uuid,uuid,text,text,jsonb,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION fn_phase2b_decide_candidate(uuid,uuid,text,bigint,text) TO service_role;
GRANT EXECUTE ON FUNCTION fn_phase2b_invalidate_dependants(uuid,text,uuid,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION fn_phase2b_rpm_ready_for_class(uuid,uuid) TO service_role;

COMMIT;

-- Rollback boundary: stop all Phase 2B callers, then drop only the six Phase 2B tables,
-- their policies/triggers, and fn_phase2b_* functions. Phase 1/2A rows are not modified.
