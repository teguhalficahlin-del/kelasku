-- ─────────────────────────────────────────────────────────────────────────────
-- 20260819000003_fix_fn_phase2c_all_meetings_usable.sql
--
-- BUG: phase2-followup selalu membalas 409 saat generate_follow_up.
--
-- ROOT CAUSE: fn_phase2c_all_meetings_usable menyeleksi kolom yang tidak ada:
--
--     FROM rancang_meeting_allocations ma
--     ...
--     AND ma.profile_id = p_profile_id     -- kolom ini TIDAK ADA
--
--   Kolom rancang_meeting_allocations yang sebenarnya:
--     id, planning_context_id, revision_no, total_jp_tp, standard_jp_minutes,
--     effective_jp_minutes, proposal_source, confirmed_by_profile_id,
--     confirmed_at, source_hash, superseded_at, created_at
--
--   Pemanggilan fungsi ini melempar 42703 (undefined_column), Edge Function
--   menangkapnya dan mengubahnya jadi 409. Jadi gate-nya tidak pernah benar-
--   benar dievaluasi — ia selalu meledak.
--
--   Cacat yang PERSIS SAMA sudah diperbaiki untuk fn_rpm_ready_for_class di
--   20260819000001, tapi fn_phase2c_all_meetings_usable (dari 20260818000011)
--   terlewat. Pemindaian pg_get_functiondef atas seluruh fungsi yang menyentuh
--   rancang_meeting_allocations memastikan hanya fungsi ini yang masih tersisa.
--
-- FIX: hapus predikat ma.profile_id. Isolasi tetap terjaga:
--   - rancang_meeting_allocations terikat ke planning_context_id (FK), dan
--     planning context sudah diotorisasi per profil oleh pemanggil;
--   - hitungan kedua tetap memfilter a.profile_id = p_profile_id pada
--     rancang_artifacts, jadi artefak milik guru lain tidak ikut terhitung.
--   Sama persis dengan pendekatan yang dipakai di 20260819000001.
--
-- Idempotent: CREATE OR REPLACE + REVOKE/GRANT diulang. Tidak ada DDL tabel,
-- tidak ada perubahan data. Fungsi STABLE (read-only).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_phase2c_all_meetings_usable(
  p_profile_id          UUID,
  p_planning_context_id UUID
) RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_alloc_count   INT := 0;
  v_usable_count  INT := 0;
BEGIN
  -- Jumlah pertemuan yang diharapkan, dari alokasi aktif (belum di-supersede).
  -- Tanpa predikat profile_id: kolom itu tidak ada di rancang_meeting_allocations.
  SELECT COUNT(*) INTO v_alloc_count
  FROM rancang_meeting_allocations ma
  JOIN rancang_meeting_allocation_items mai ON mai.meeting_allocation_id = ma.id
  WHERE ma.planning_context_id = p_planning_context_id
    AND ma.superseded_at       IS NULL;

  IF v_alloc_count = 0 THEN RETURN FALSE; END IF;

  -- Jumlah MEETING_PLAN yang usable. Di sini profile_id memang ada dan dipakai.
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
$fn$;

REVOKE ALL     ON FUNCTION fn_phase2c_all_meetings_usable(UUID, UUID) FROM PUBLIC;
REVOKE ALL     ON FUNCTION fn_phase2c_all_meetings_usable(UUID, UUID) FROM anon;
REVOKE ALL     ON FUNCTION fn_phase2c_all_meetings_usable(UUID, UUID) FROM authenticated;
GRANT  EXECUTE ON FUNCTION fn_phase2c_all_meetings_usable(UUID, UUID) TO service_role;
