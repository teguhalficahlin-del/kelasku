-- Phase 2A: stable ATP/TP, planning context, JP policy, and meeting allocation.
-- Additive only. Legacy rancang_* tables and browser state remain untouched.

BEGIN;

CREATE TABLE rancang_atp (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  teaching_context_id uuid NOT NULL REFERENCES teaching_contexts(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ARCHIVED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE rancang_atp_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  atp_id uuid NOT NULL REFERENCES rancang_atp(id) ON DELETE CASCADE,
  revision_no integer NOT NULL CHECK (revision_no > 0),
  source text NOT NULL CHECK (source IN ('AI','TEACHER','LEGACY_IMPORT')),
  source_hash text NOT NULL CHECK (source_hash ~ '^[0-9a-f]{64}$'),
  cp_dataset_revision text NOT NULL CHECK (cp_dataset_revision ~ '^[0-9a-f]{64}$'),
  created_by uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (atp_id, revision_no),
  UNIQUE (atp_id, source_hash)
);

CREATE TABLE rancang_tp (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  atp_id uuid NOT NULL REFERENCES rancang_atp(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ARCHIVED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE rancang_tp_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tp_id uuid NOT NULL REFERENCES rancang_tp(id) ON DELETE CASCADE,
  revision_no integer NOT NULL CHECK (revision_no > 0),
  judul text NOT NULL CHECK (btrim(judul) <> ''),
  deskripsi text NOT NULL DEFAULT '',
  semester smallint NOT NULL CHECK (semester IN (1,2)),
  estimasi_jp integer CHECK (estimasi_jp > 0),
  raw_element_value jsonb,
  source_hash text NOT NULL CHECK (source_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tp_id, revision_no),
  UNIQUE (tp_id, source_hash)
);

CREATE TABLE rancang_atp_revision_items (
  atp_revision_id uuid NOT NULL REFERENCES rancang_atp_revisions(id) ON DELETE CASCADE,
  tp_id uuid NOT NULL REFERENCES rancang_tp(id) ON DELETE RESTRICT,
  tp_revision_id uuid NOT NULL REFERENCES rancang_tp_revisions(id) ON DELETE RESTRICT,
  urutan integer NOT NULL CHECK (urutan > 0),
  PRIMARY KEY (atp_revision_id, urutan),
  UNIQUE (atp_revision_id, tp_id),
  UNIQUE (atp_revision_id, tp_revision_id)
);

CREATE TABLE rancang_tp_revision_elements (
  tp_revision_id uuid NOT NULL REFERENCES rancang_tp_revisions(id) ON DELETE CASCADE,
  subject_key text NOT NULL,
  phase_key text NOT NULL CHECK (phase_key IN ('fase_a','fase_b','fase_c','fase_d','fase_e','fase_f')),
  element_name text NOT NULL,
  cp_dataset_revision text NOT NULL CHECK (cp_dataset_revision ~ '^[0-9a-f]{64}$'),
  PRIMARY KEY (tp_revision_id, subject_key, phase_key, element_name, cp_dataset_revision)
);

CREATE TABLE rancang_legacy_atp_mappings (
  legacy_rancang_dokumen_id uuid PRIMARY KEY REFERENCES rancang_dokumen(id) ON DELETE RESTRICT,
  atp_id uuid NOT NULL UNIQUE REFERENCES rancang_atp(id) ON DELETE RESTRICT,
  adopted_by uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  raw_payload_hash text NOT NULL CHECK (raw_payload_hash ~ '^[0-9a-f]{64}$'),
  unresolved_elements jsonb NOT NULL DEFAULT '[]'::jsonb,
  adopted_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE classroom_jp_policies (
  classroom_id uuid PRIMARY KEY REFERENCES classrooms(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  standard_jp_minutes integer NOT NULL CHECK (standard_jp_minutes > 0),
  effective_jp_minutes integer NOT NULL CHECK (effective_jp_minutes > 0),
  override_reason text,
  confirmed_by_profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_jp_minutes = standard_jp_minutes OR btrim(COALESCE(override_reason,'')) <> '')
);

CREATE TABLE rancang_planning_contexts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  teaching_context_id uuid NOT NULL REFERENCES teaching_contexts(id) ON DELETE RESTRICT,
  classroom_id uuid NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
  tp_id uuid NOT NULL REFERENCES rancang_tp(id) ON DELETE RESTRICT,
  selected_tp_revision_id uuid NOT NULL REFERENCES rancang_tp_revisions(id) ON DELETE RESTRICT,
  academic_year text NOT NULL CHECK (academic_year ~ '^[0-9]{4}/[0-9]{4}$'),
  semester smallint NOT NULL CHECK (semester IN (1,2)),
  teacher_intent_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  preferences_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  class_context_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  smk_context_snapshot jsonb,
  schedule_config_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  context_source_hash text NOT NULL CHECK (context_source_hash ~ '^[0-9a-f]{64}$'),
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','READY','STALE','ARCHIVED')),
  stale_reasons text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, classroom_id, selected_tp_revision_id, academic_year, semester, context_source_hash)
);

CREATE TABLE rancang_meeting_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  planning_context_id uuid NOT NULL REFERENCES rancang_planning_contexts(id) ON DELETE CASCADE,
  revision_no integer NOT NULL CHECK (revision_no > 0),
  total_jp_tp integer NOT NULL CHECK (total_jp_tp > 0),
  standard_jp_minutes integer NOT NULL CHECK (standard_jp_minutes > 0),
  effective_jp_minutes integer NOT NULL CHECK (effective_jp_minutes > 0),
  proposal_source text NOT NULL CHECK (proposal_source IN ('ATP_ESTIMATE','SCHEDULE','TEACHER')),
  confirmed_by_profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  confirmed_at timestamptz NOT NULL,
  source_hash text NOT NULL CHECK (source_hash ~ '^[0-9a-f]{64}$'),
  superseded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (planning_context_id, revision_no),
  UNIQUE (planning_context_id, source_hash)
);

CREATE UNIQUE INDEX uq_rancang_meeting_allocation_current
  ON rancang_meeting_allocations(planning_context_id) WHERE superseded_at IS NULL;

CREATE TABLE rancang_meeting_allocation_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_allocation_id uuid NOT NULL REFERENCES rancang_meeting_allocations(id) ON DELETE CASCADE,
  meeting_no integer NOT NULL CHECK (meeting_no > 0),
  jp integer NOT NULL CHECK (jp > 0),
  duration_minutes integer NOT NULL CHECK (duration_minutes > 0),
  UNIQUE (meeting_allocation_id, meeting_no)
);

CREATE INDEX idx_rancang_atp_context ON rancang_atp(teaching_context_id);
CREATE INDEX idx_rancang_tp_atp ON rancang_tp(atp_id);
CREATE INDEX idx_rancang_planning_context_classroom ON rancang_planning_contexts(classroom_id);
CREATE INDEX idx_rancang_planning_context_tp ON rancang_planning_contexts(tp_id);

ALTER TABLE rancang_atp ENABLE ROW LEVEL SECURITY;
ALTER TABLE rancang_atp_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE rancang_tp ENABLE ROW LEVEL SECURITY;
ALTER TABLE rancang_tp_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE rancang_atp_revision_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE rancang_tp_revision_elements ENABLE ROW LEVEL SECURITY;
ALTER TABLE rancang_legacy_atp_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE classroom_jp_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE rancang_planning_contexts ENABLE ROW LEVEL SECURITY;
ALTER TABLE rancang_meeting_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE rancang_meeting_allocation_items ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION fn_phase2a_owns_atp(p_atp_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM rancang_atp WHERE id=p_atp_id AND profile_id=fn_current_profile_id())
$$;
CREATE OR REPLACE FUNCTION fn_phase2a_owns_planning_context(p_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM rancang_planning_contexts WHERE id=p_id AND profile_id=fn_current_profile_id())
$$;
CREATE OR REPLACE FUNCTION fn_phase2a_owns_tp_revision(p_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM rancang_tp_revisions tr JOIN rancang_tp t ON t.id=tr.tp_id
    JOIN rancang_atp a ON a.id=t.atp_id WHERE tr.id=p_id AND a.profile_id=fn_current_profile_id())
$$;
CREATE OR REPLACE FUNCTION fn_phase2a_owns_atp_revision(p_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM rancang_atp_revisions ar JOIN rancang_atp a ON a.id=ar.atp_id
    WHERE ar.id=p_id AND a.profile_id=fn_current_profile_id())
$$;
CREATE OR REPLACE FUNCTION fn_phase2a_owns_meeting_allocation(p_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM rancang_meeting_allocations ma JOIN rancang_planning_contexts pc ON pc.id=ma.planning_context_id
    WHERE ma.id=p_id AND pc.profile_id=fn_current_profile_id())
$$;
REVOKE EXECUTE ON FUNCTION fn_phase2a_owns_atp(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION fn_phase2a_owns_planning_context(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION fn_phase2a_owns_tp_revision(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION fn_phase2a_owns_atp_revision(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION fn_phase2a_owns_meeting_allocation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_phase2a_owns_atp(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_phase2a_owns_planning_context(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_phase2a_owns_tp_revision(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_phase2a_owns_atp_revision(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_phase2a_owns_meeting_allocation(uuid) TO authenticated;

CREATE POLICY rancang_atp_select_self ON rancang_atp FOR SELECT TO authenticated
  USING (profile_id=fn_current_profile_id());
CREATE POLICY rancang_atp_revisions_select_self ON rancang_atp_revisions FOR SELECT TO authenticated
  USING (fn_phase2a_owns_atp(atp_id));
CREATE POLICY rancang_tp_select_self ON rancang_tp FOR SELECT TO authenticated
  USING (fn_phase2a_owns_atp(atp_id));
CREATE POLICY rancang_tp_revisions_select_self ON rancang_tp_revisions FOR SELECT TO authenticated
  USING (fn_phase2a_owns_tp_revision(id));
CREATE POLICY rancang_atp_revision_items_select_self ON rancang_atp_revision_items FOR SELECT TO authenticated
  USING (fn_phase2a_owns_atp_revision(atp_revision_id));
CREATE POLICY rancang_tp_revision_elements_select_self ON rancang_tp_revision_elements FOR SELECT TO authenticated
  USING (fn_phase2a_owns_tp_revision(tp_revision_id));
CREATE POLICY rancang_legacy_mapping_select_self ON rancang_legacy_atp_mappings FOR SELECT TO authenticated
  USING (fn_phase2a_owns_atp(atp_id));
CREATE POLICY classroom_jp_policy_select_self ON classroom_jp_policies FOR SELECT TO authenticated
  USING (profile_id=fn_current_profile_id() AND fn_is_classroom_owner(classroom_id));
CREATE POLICY planning_context_select_self ON rancang_planning_contexts FOR SELECT TO authenticated
  USING (profile_id=fn_current_profile_id());
CREATE POLICY meeting_allocation_select_self ON rancang_meeting_allocations FOR SELECT TO authenticated
  USING (fn_phase2a_owns_planning_context(planning_context_id));
CREATE POLICY meeting_allocation_items_select_self ON rancang_meeting_allocation_items FOR SELECT TO authenticated
  USING (fn_phase2a_owns_meeting_allocation(meeting_allocation_id));

GRANT SELECT ON rancang_atp, rancang_atp_revisions, rancang_tp, rancang_tp_revisions,
  rancang_atp_revision_items, rancang_tp_revision_elements, rancang_legacy_atp_mappings,
  classroom_jp_policies, rancang_planning_contexts, rancang_meeting_allocations,
  rancang_meeting_allocation_items TO authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON
  rancang_atp, rancang_atp_revisions, rancang_tp, rancang_tp_revisions,
  rancang_atp_revision_items, rancang_tp_revision_elements, rancang_legacy_atp_mappings,
  classroom_jp_policies, rancang_planning_contexts, rancang_meeting_allocations,
  rancang_meeting_allocation_items FROM authenticated;
REVOKE ALL ON rancang_atp, rancang_atp_revisions, rancang_tp, rancang_tp_revisions,
  rancang_atp_revision_items, rancang_tp_revision_elements, rancang_legacy_atp_mappings,
  classroom_jp_policies, rancang_planning_contexts, rancang_meeting_allocations,
  rancang_meeting_allocation_items FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON rancang_atp, rancang_atp_revisions, rancang_tp, rancang_tp_revisions,
  rancang_atp_revision_items, rancang_tp_revision_elements, rancang_legacy_atp_mappings,
  classroom_jp_policies, rancang_planning_contexts, rancang_meeting_allocations,
  rancang_meeting_allocation_items TO service_role;

-- All writes use trusted service RPCs after Edge Function canonical validation.
CREATE OR REPLACE FUNCTION fn_phase2a_get_atp(p_profile_id uuid,p_atp_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  WITH latest AS (
    SELECT ar.* FROM rancang_atp_revisions ar JOIN rancang_atp a ON a.id=ar.atp_id
    WHERE a.id=p_atp_id AND a.profile_id=p_profile_id ORDER BY ar.revision_no DESC LIMIT 1
  ) SELECT jsonb_build_object('atp_id',l.atp_id,'atp_revision_id',l.id,'revision_no',l.revision_no,
    'tp_list',COALESCE(jsonb_agg(jsonb_build_object('id',t.id,'revision_id',tr.id,'urutan',i.urutan,
      'judul',tr.judul,'deskripsi',tr.deskripsi,'semester',tr.semester,'estimasi_jp',tr.estimasi_jp,
      'elemen_cp',tr.raw_element_value) ORDER BY i.urutan) FILTER (WHERE t.id IS NOT NULL),'[]'::jsonb))
  FROM latest l LEFT JOIN rancang_atp_revision_items i ON i.atp_revision_id=l.id
  LEFT JOIN rancang_tp t ON t.id=i.tp_id LEFT JOIN rancang_tp_revisions tr ON tr.id=i.tp_revision_id GROUP BY l.atp_id,l.id,l.revision_no
$$;

CREATE OR REPLACE FUNCTION fn_phase2a_persist_atp(
  p_profile_id uuid, p_teaching_context_id uuid, p_source text,
  p_source_hash text, p_cp_dataset_revision text, p_tp_list jsonb,
  p_atp_id uuid DEFAULT NULL, p_legacy_document_id uuid DEFAULT NULL,
  p_legacy_payload_hash text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_context teaching_contexts; v_atp rancang_atp; v_atp_rev rancang_atp_revisions;
  v_item jsonb; v_tp rancang_tp; v_tp_rev rancang_tp_revisions; v_order int:=0;
  v_existing uuid; v_rows jsonb:='[]'::jsonb;
BEGIN
  SELECT * INTO v_context FROM teaching_contexts WHERE id=p_teaching_context_id
    AND profile_id=p_profile_id AND status='ACTIVE';
  IF NOT FOUND OR v_context.cp_dataset_revision<>p_cp_dataset_revision THEN
    RAISE EXCEPTION 'Teaching Context tidak valid' USING ERRCODE='42501';
  END IF;
  IF p_source NOT IN ('AI','TEACHER','LEGACY_IMPORT') OR jsonb_typeof(p_tp_list)<>'array'
     OR jsonb_array_length(p_tp_list)=0 THEN RAISE EXCEPTION 'Payload ATP tidak valid'; END IF;
  IF p_legacy_document_id IS NOT NULL THEN
    SELECT atp_id INTO v_existing FROM rancang_legacy_atp_mappings
      WHERE legacy_rancang_dokumen_id=p_legacy_document_id;
    IF v_existing IS NOT NULL THEN RETURN fn_phase2a_get_atp(p_profile_id,v_existing); END IF;
  END IF;
  IF p_atp_id IS NULL THEN
    INSERT INTO rancang_atp(profile_id,teaching_context_id) VALUES(p_profile_id,p_teaching_context_id)
      RETURNING * INTO v_atp;
  ELSE
    SELECT * INTO v_atp FROM rancang_atp WHERE id=p_atp_id AND profile_id=p_profile_id
      AND teaching_context_id=p_teaching_context_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'ATP tidak diizinkan' USING ERRCODE='42501'; END IF;
  END IF;
  SELECT * INTO v_atp_rev FROM rancang_atp_revisions WHERE atp_id=v_atp.id AND source_hash=p_source_hash;
  IF FOUND THEN RETURN fn_phase2a_get_atp(p_profile_id,v_atp.id); END IF;
  INSERT INTO rancang_atp_revisions(atp_id,revision_no,source,source_hash,cp_dataset_revision,created_by)
  VALUES(v_atp.id,COALESCE((SELECT max(revision_no)+1 FROM rancang_atp_revisions WHERE atp_id=v_atp.id),1),
         p_source,p_source_hash,p_cp_dataset_revision,p_profile_id) RETURNING * INTO v_atp_rev;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_tp_list) LOOP
    v_order:=v_order+1;
    IF btrim(COALESCE(v_item->>'judul',''))='' OR COALESCE((v_item->>'semester')::int,0) NOT IN (1,2)
       OR COALESCE((v_item->>'estimasi_jp')::int,0)<=0 THEN RAISE EXCEPTION 'Item TP tidak valid'; END IF;
    INSERT INTO rancang_tp(atp_id) VALUES(v_atp.id) RETURNING * INTO v_tp;
    INSERT INTO rancang_tp_revisions(tp_id,revision_no,judul,deskripsi,semester,estimasi_jp,
      raw_element_value,source_hash,created_by)
    VALUES(v_tp.id,1,v_item->>'judul',COALESCE(v_item->>'deskripsi',''),(v_item->>'semester')::smallint,
      (v_item->>'estimasi_jp')::int,v_item->'raw_element_value',v_item->>'source_hash',p_profile_id)
      RETURNING * INTO v_tp_rev;
    INSERT INTO rancang_atp_revision_items(atp_revision_id,tp_id,tp_revision_id,urutan)
      VALUES(v_atp_rev.id,v_tp.id,v_tp_rev.id,v_order);
    INSERT INTO rancang_tp_revision_elements(tp_revision_id,subject_key,phase_key,element_name,cp_dataset_revision)
      SELECT v_tp_rev.id,e->>'subject_key',e->>'phase_key',e->>'element_name',e->>'cp_dataset_revision'
      FROM jsonb_array_elements(COALESCE(v_item->'element_refs','[]'::jsonb)) e;
    v_rows:=v_rows||jsonb_build_array(jsonb_build_object('id',v_tp.id,'revision_id',v_tp_rev.id,
      'urutan',v_order,'judul',v_tp_rev.judul,'deskripsi',v_tp_rev.deskripsi,
      'semester',v_tp_rev.semester,'estimasi_jp',v_tp_rev.estimasi_jp,
      'elemen_cp',v_item->'raw_element_value'));
  END LOOP;
  IF p_legacy_document_id IS NOT NULL THEN
    INSERT INTO rancang_legacy_atp_mappings(legacy_rancang_dokumen_id,atp_id,adopted_by,raw_payload_hash,unresolved_elements)
    VALUES(p_legacy_document_id,v_atp.id,p_profile_id,p_legacy_payload_hash,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('urutan',ord,'raw',item->'raw_element_value'))
        FROM jsonb_array_elements(p_tp_list) WITH ORDINALITY x(item,ord)
        WHERE item->'raw_element_value' IS NOT NULL
          AND jsonb_array_length(COALESCE(item->'element_refs','[]'::jsonb))=0),'[]'::jsonb));
  END IF;
  RETURN jsonb_build_object('atp_id',v_atp.id,'atp_revision_id',v_atp_rev.id,'tp_list',v_rows);
END $$;

CREATE OR REPLACE FUNCTION fn_phase2a_revise_tp(
  p_profile_id uuid,p_teaching_context_id uuid,p_tp_id uuid,p_source_hash text,p_atp_source_hash text,
  p_judul text,p_deskripsi text,p_semester smallint,p_estimasi_jp integer,
  p_raw_element jsonb,p_element_refs jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tp rancang_tp; v_old_atp_rev rancang_atp_revisions; v_tp_rev rancang_tp_revisions; v_atp_rev rancang_atp_revisions;
BEGIN
  SELECT t.* INTO v_tp FROM rancang_tp t JOIN rancang_atp a ON a.id=t.atp_id
    WHERE t.id=p_tp_id AND a.profile_id=p_profile_id AND a.teaching_context_id=p_teaching_context_id FOR UPDATE;
  IF NOT FOUND OR btrim(COALESCE(p_judul,''))='' OR p_semester NOT IN (1,2) OR p_estimasi_jp<=0 THEN
    RAISE EXCEPTION 'Revisi TP tidak valid' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_tp_rev FROM rancang_tp_revisions WHERE tp_id=p_tp_id AND source_hash=p_source_hash;
  IF FOUND THEN RETURN fn_phase2a_get_atp(p_profile_id,v_tp.atp_id); END IF;
  SELECT * INTO v_old_atp_rev FROM rancang_atp_revisions WHERE atp_id=v_tp.atp_id ORDER BY revision_no DESC LIMIT 1;
  INSERT INTO rancang_tp_revisions(tp_id,revision_no,judul,deskripsi,semester,estimasi_jp,raw_element_value,source_hash,created_by)
  VALUES(p_tp_id,COALESCE((SELECT max(revision_no)+1 FROM rancang_tp_revisions WHERE tp_id=p_tp_id),1),
    p_judul,COALESCE(p_deskripsi,''),p_semester,p_estimasi_jp,p_raw_element,p_source_hash,p_profile_id) RETURNING * INTO v_tp_rev;
  INSERT INTO rancang_tp_revision_elements(tp_revision_id,subject_key,phase_key,element_name,cp_dataset_revision)
    SELECT v_tp_rev.id,e->>'subject_key',e->>'phase_key',e->>'element_name',e->>'cp_dataset_revision'
      FROM jsonb_array_elements(COALESCE(p_element_refs,'[]'::jsonb)) e;
  INSERT INTO rancang_atp_revisions(atp_id,revision_no,source,source_hash,cp_dataset_revision,created_by)
  VALUES(v_tp.atp_id,v_old_atp_rev.revision_no+1,'TEACHER',p_atp_source_hash,v_old_atp_rev.cp_dataset_revision,p_profile_id)
    RETURNING * INTO v_atp_rev;
  INSERT INTO rancang_atp_revision_items(atp_revision_id,tp_id,tp_revision_id,urutan)
    SELECT v_atp_rev.id,i.tp_id,CASE WHEN i.tp_id=p_tp_id THEN v_tp_rev.id ELSE i.tp_revision_id END,i.urutan
      FROM rancang_atp_revision_items i WHERE i.atp_revision_id=v_old_atp_rev.id;
  UPDATE rancang_planning_contexts SET status='STALE',stale_reasons=array_append(stale_reasons,'NEW_TP_REVISION_AVAILABLE'),updated_at=now()
    WHERE tp_id=p_tp_id AND selected_tp_revision_id<>v_tp_rev.id AND status<>'ARCHIVED'
      AND NOT ('NEW_TP_REVISION_AVAILABLE'=ANY(stale_reasons));
  RETURN fn_phase2a_get_atp(p_profile_id,v_tp.atp_id);
END $$;

CREATE OR REPLACE FUNCTION fn_phase2a_save_planning_context(
  p_profile_id uuid,p_teaching_context_id uuid,p_classroom_id uuid,p_tp_id uuid,p_tp_revision_id uuid,
  p_academic_year text,p_semester smallint,p_teacher_intent jsonb,p_preferences jsonb,p_class_context jsonb,
  p_smk_context jsonb,p_schedule_config jsonb,p_source_hash text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_role text; v_pc rancang_planning_contexts;
BEGIN
  SELECT tc.role_guru INTO v_role FROM teaching_contexts tc JOIN teaching_context_classrooms b ON b.teaching_context_id=tc.id
  JOIN rancang_atp a ON a.teaching_context_id=tc.id JOIN rancang_tp t ON t.atp_id=a.id
  JOIN rancang_tp_revisions tr ON tr.tp_id=t.id
  WHERE tc.id=p_teaching_context_id AND tc.profile_id=p_profile_id AND tc.status='ACTIVE'
    AND b.classroom_id=p_classroom_id AND b.status='ACTIVE' AND t.id=p_tp_id AND tr.id=p_tp_revision_id;
  IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM classrooms WHERE id=p_classroom_id AND teacher_id=p_profile_id) THEN
    RAISE EXCEPTION 'Planning Context tidak diizinkan' USING ERRCODE='42501'; END IF;
  IF v_role='WALI_KELAS' AND NOT EXISTS(SELECT 1 FROM wali_home_classrooms WHERE profile_id=p_profile_id
      AND classroom_id=p_classroom_id AND status='LOCKED') THEN RAISE EXCEPTION 'Bukan home classroom wali' USING ERRCODE='42501'; END IF;
  INSERT INTO rancang_planning_contexts(profile_id,teaching_context_id,classroom_id,tp_id,selected_tp_revision_id,
    academic_year,semester,teacher_intent_snapshot,preferences_snapshot,class_context_snapshot,smk_context_snapshot,
    schedule_config_snapshot,context_source_hash)
  VALUES(p_profile_id,p_teaching_context_id,p_classroom_id,p_tp_id,p_tp_revision_id,p_academic_year,p_semester,
    COALESCE(p_teacher_intent,'{}'),COALESCE(p_preferences,'{}'),COALESCE(p_class_context,'{}'),p_smk_context,
    COALESCE(p_schedule_config,'{}'),p_source_hash)
  ON CONFLICT(profile_id,classroom_id,selected_tp_revision_id,academic_year,semester,context_source_hash)
  DO UPDATE SET updated_at=now() RETURNING * INTO v_pc;
  RETURN to_jsonb(v_pc);
END $$;

CREATE OR REPLACE FUNCTION fn_phase2a_confirm_allocation(
  p_profile_id uuid,p_planning_context_id uuid,p_total_jp integer,p_standard_minutes integer,
  p_effective_minutes integer,p_source text,p_source_hash text,p_items jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_pc rancang_planning_contexts; v_ma rancang_meeting_allocations; v_item jsonb; v_sum int:=0;
BEGIN
  SELECT * INTO v_pc FROM rancang_planning_contexts WHERE id=p_planning_context_id AND profile_id=p_profile_id FOR UPDATE;
  IF NOT FOUND OR jsonb_typeof(p_items)<>'array' OR jsonb_array_length(p_items)=0 THEN RAISE EXCEPTION 'Allocation tidak valid'; END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP v_sum:=v_sum+(v_item->>'jp')::int; END LOOP;
  IF v_sum<>p_total_jp OR p_total_jp<=0 OR p_standard_minutes<=0 OR p_effective_minutes<=0 THEN
    RAISE EXCEPTION 'Total atau menit allocation tidak valid'; END IF;
  SELECT * INTO v_ma FROM rancang_meeting_allocations WHERE planning_context_id=p_planning_context_id AND source_hash=p_source_hash;
  IF FOUND THEN RETURN to_jsonb(v_ma); END IF;
  UPDATE rancang_meeting_allocations SET superseded_at=now() WHERE planning_context_id=p_planning_context_id AND superseded_at IS NULL;
  INSERT INTO rancang_meeting_allocations(planning_context_id,revision_no,total_jp_tp,standard_jp_minutes,
    effective_jp_minutes,proposal_source,confirmed_by_profile_id,confirmed_at,source_hash)
  VALUES(p_planning_context_id,COALESCE((SELECT max(revision_no)+1 FROM rancang_meeting_allocations WHERE planning_context_id=p_planning_context_id),1),
    p_total_jp,p_standard_minutes,p_effective_minutes,p_source,p_profile_id,now(),p_source_hash) RETURNING * INTO v_ma;
  INSERT INTO rancang_meeting_allocation_items(meeting_allocation_id,meeting_no,jp,duration_minutes)
  SELECT v_ma.id,(e->>'meeting_no')::int,(e->>'jp')::int,(e->>'jp')::int*p_effective_minutes
    FROM jsonb_array_elements(p_items) e;
  UPDATE rancang_planning_contexts SET status='READY',updated_at=now() WHERE id=p_planning_context_id;
  RETURN to_jsonb(v_ma)||(SELECT jsonb_build_object('meetings',jsonb_agg(to_jsonb(mi) ORDER BY meeting_no))
    FROM rancang_meeting_allocation_items mi WHERE mi.meeting_allocation_id=v_ma.id);
END $$;

REVOKE EXECUTE ON FUNCTION fn_phase2a_get_atp(uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION fn_phase2a_persist_atp(uuid,uuid,text,text,text,jsonb,uuid,uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION fn_phase2a_save_planning_context(uuid,uuid,uuid,uuid,uuid,text,smallint,jsonb,jsonb,jsonb,jsonb,jsonb,text) FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION fn_phase2a_confirm_allocation(uuid,uuid,integer,integer,integer,text,text,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION fn_phase2a_revise_tp(uuid,uuid,uuid,text,text,text,text,smallint,integer,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION fn_phase2a_get_atp(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION fn_phase2a_persist_atp(uuid,uuid,text,text,text,jsonb,uuid,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION fn_phase2a_save_planning_context(uuid,uuid,uuid,uuid,uuid,text,smallint,jsonb,jsonb,jsonb,jsonb,jsonb,text) TO service_role;
GRANT EXECUTE ON FUNCTION fn_phase2a_confirm_allocation(uuid,uuid,integer,integer,integer,text,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION fn_phase2a_revise_tp(uuid,uuid,uuid,text,text,text,text,smallint,integer,jsonb,jsonb) TO service_role;

COMMIT;
