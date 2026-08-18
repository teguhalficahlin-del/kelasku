-- Phase 2A remediation F-01: make classroom JP policy authoritative inside allocation RPC.
BEGIN;

CREATE OR REPLACE FUNCTION fn_phase2a_confirm_allocation(
  p_profile_id uuid,p_planning_context_id uuid,p_total_jp integer,p_standard_minutes integer,
  p_effective_minutes integer,p_source text,p_source_hash text,p_items jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_pc rancang_planning_contexts; v_classroom classrooms; v_policy classroom_jp_policies;
  v_ma rancang_meeting_allocations; v_item jsonb; v_sum int:=0;
  v_standard int; v_effective int;
BEGIN
  SELECT * INTO v_pc FROM rancang_planning_contexts
    WHERE id=p_planning_context_id AND profile_id=p_profile_id FOR UPDATE;
  IF NOT FOUND OR jsonb_typeof(p_items)<>'array' OR jsonb_array_length(p_items)=0 THEN
    RAISE EXCEPTION 'Allocation tidak valid' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_classroom FROM classrooms
    WHERE id=v_pc.classroom_id AND teacher_id=p_profile_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Classroom allocation tidak diizinkan' USING ERRCODE='42501'; END IF;

  v_standard:=CASE v_classroom.jenjang WHEN 'SD' THEN 35 WHEN 'SMP' THEN 40 WHEN 'SMA' THEN 45 WHEN 'SMK' THEN 45 ELSE NULL END;
  IF v_standard IS NULL THEN RAISE EXCEPTION 'Jenjang classroom tidak valid'; END IF;
  SELECT * INTO v_policy FROM classroom_jp_policies WHERE classroom_id=v_classroom.id;
  IF FOUND THEN
    IF v_policy.profile_id<>p_profile_id OR v_policy.confirmed_by_profile_id<>p_profile_id
       OR v_policy.standard_jp_minutes<>v_standard
       OR v_policy.effective_jp_minutes<=0
       OR (v_policy.effective_jp_minutes<>v_standard AND btrim(COALESCE(v_policy.override_reason,''))='') THEN
      RAISE EXCEPTION 'Kebijakan JP classroom tidak valid' USING ERRCODE='42501';
    END IF;
    v_effective:=v_policy.effective_jp_minutes;
  ELSE
    v_effective:=v_standard;
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    v_sum:=v_sum+(v_item->>'jp')::int;
  END LOOP;
  IF v_sum<>p_total_jp OR p_total_jp<=0 THEN RAISE EXCEPTION 'Total allocation tidak valid'; END IF;
  SELECT * INTO v_ma FROM rancang_meeting_allocations
    WHERE planning_context_id=p_planning_context_id AND source_hash=p_source_hash;
  IF FOUND THEN RETURN to_jsonb(v_ma); END IF;
  UPDATE rancang_meeting_allocations SET superseded_at=now()
    WHERE planning_context_id=p_planning_context_id AND superseded_at IS NULL;
  INSERT INTO rancang_meeting_allocations(planning_context_id,revision_no,total_jp_tp,standard_jp_minutes,
    effective_jp_minutes,proposal_source,confirmed_by_profile_id,confirmed_at,source_hash)
  VALUES(p_planning_context_id,COALESCE((SELECT max(revision_no)+1 FROM rancang_meeting_allocations WHERE planning_context_id=p_planning_context_id),1),
    p_total_jp,v_standard,v_effective,p_source,p_profile_id,now(),p_source_hash) RETURNING * INTO v_ma;
  INSERT INTO rancang_meeting_allocation_items(meeting_allocation_id,meeting_no,jp,duration_minutes)
  SELECT v_ma.id,(e->>'meeting_no')::int,(e->>'jp')::int,(e->>'jp')::int*v_effective
    FROM jsonb_array_elements(p_items) e;
  UPDATE rancang_planning_contexts SET status='READY',updated_at=now() WHERE id=p_planning_context_id;
  RETURN to_jsonb(v_ma)||(SELECT jsonb_build_object('meetings',jsonb_agg(to_jsonb(mi) ORDER BY meeting_no))
    FROM rancang_meeting_allocation_items mi WHERE mi.meeting_allocation_id=v_ma.id);
END $$;

REVOKE EXECUTE ON FUNCTION fn_phase2a_confirm_allocation(uuid,uuid,integer,integer,integer,text,text,jsonb)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION fn_phase2a_confirm_allocation(uuid,uuid,integer,integer,integer,text,text,jsonb)
  TO service_role;

COMMIT;
