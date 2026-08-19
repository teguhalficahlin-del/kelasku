/**
 * runtime-compiler.js — Pure deterministic compiler for RuntimePackage.
 * ZERO side effects: no DOM, no fetch, no IndexedDB.
 * All exported functions are synchronous except compileRuntimePackage (async for SHA-256).
 */
(function () {
  'use strict';

  const PHASES = ['opening', 'understand', 'apply', 'reflect', 'closing'];

  // ── A1. compileRuntimeSteps ─────────────────────────────────────────────────

  function compileRuntimeSteps(meetingPlanContent, meetingNo) {
    const activities = meetingPlanContent?.activities ?? [];
    if (!activities.length) throw new Error('[compiler] activities kosong di meeting plan');

    const steps = activities.map(a => ({
      id:                        a.step_id,
      meeting_no:                meetingNo,
      phase:                     a.phase,
      title:                     a.title,
      planned_minutes:           a.planned_minutes ?? 0,
      priority:                  a.priority ?? 'core',
      skippable:                 a.priority === 'optional',
      teacher_action:            a.teacher_action ?? '',
      student_action:            a.student_action ?? '',
      completion_cue:            a.completion_cue ?? '',
      resource_refs:             [],
      assessment_checkpoint_id:  a.assessment_checkpoint_id ?? null,
      differentiation_ref:       a.differentiation_ref ?? null,
      recovery_refs:             [],
    }));

    const totalMins   = steps.reduce((s, r) => s + r.planned_minutes, 0);
    const allocMins   = meetingPlanContent?.duration_minutes;
    if (allocMins != null && totalMins !== allocMins) {
      throw new Error(
        `[compiler] SUM planned_minutes (${totalMins}) ≠ duration_minutes (${allocMins}) di pertemuan ${meetingNo}`
      );
    }

    return steps;
  }

  // ── A2. compileFormativeCheckpoints ────────────────────────────────────────

  function compileFormativeCheckpoints(meetingPlanContent, assessmentSpecContent, meetingNo) {
    const mpCheckpoint  = meetingPlanContent?.formative_checkpoint ?? null;
    const asmFormative  = (assessmentSpecContent?.formative ?? []).find(f => f.meeting_no === meetingNo);
    const activities    = meetingPlanContent?.activities ?? [];

    // Find the step that triggered this checkpoint
    const triggerStep = activities.find(a => a.assessment_checkpoint_id != null);

    if (!mpCheckpoint && !asmFormative) return [];

    const base = mpCheckpoint ?? {};
    const asm  = asmFormative ?? {};

    // assessment_spec is more authoritative for classification_anchor
    const classAnchor = asm.classification_anchor ?? base.classification_anchor ?? {
      paham: '', hampir: '', belum: ''
    };

    return [{
      checkpoint_id:        base.checkpoint_id ?? `chk-m${meetingNo}`,
      meeting_no:           meetingNo,
      kktp_ref:             asm.kktp_ref ?? base.kktp_ref ?? '',
      expected_evidence:    asm.expected_evidence ?? base.expected_evidence ?? '',
      classification_anchor: classAnchor,
      response: {
        paham:   asm.response?.paham   ?? base.response?.paham   ?? '',
        hampir:  asm.response?.hampir  ?? base.response?.hampir  ?? '',
        belum:   asm.response?.belum   ?? base.response?.belum   ?? '',
      },
      triggered_by_step_id: triggerStep?.step_id ?? null,
    }];
  }

  // ── A3. compileRecoveryActions ──────────────────────────────────────────────

  function compileRecoveryActions(meetingPlanContent, contextSpecContent) {
    const activities   = meetingPlanContent?.activities ?? [];
    const constraints  = contextSpecContent?.constraints ?? [];
    const dif          = meetingPlanContent?.differentiation ?? {};

    const optionalSteps  = activities.filter(a => a.priority === 'optional');
    const optionalIds    = optionalSteps.map(a => a.step_id);
    const optionalMins   = optionalSteps.reduce((s, a) => s + (a.planned_minutes ?? 0), 0);

    const groupSteps = activities
      .filter(a => /group|diskusi|kelompok/i.test(a.title + ' ' + a.teacher_action))
      .map(a => a.step_id);

    // Find earliest reflect or closing step
    const focusStep = activities.find(a => a.phase === 'reflect' || a.phase === 'closing');

    // Facility constraint text
    const facilityConstraint = constraints.find(c =>
      /fasilitas|proyektor|komputer|lab|internet|lcd/i.test(JSON.stringify(c))
    );

    return [
      {
        id:                         'REC-TIME_SHORT',
        trigger:                    'TIME_SHORT',
        description:                'Lewati aktivitas opsional, fokus pada langkah inti',
        steps_to_skip:              optionalIds,
        steps_to_add:               [],
        pacing_adjustment_minutes:  -optionalMins,
      },
      {
        id:                         'REC-CLASS_NOT_UNDERSTAND',
        trigger:                    'CLASS_NOT_UNDERSTAND',
        description:                dif?.belum?.aktivitas
          ?? 'Ulangi penjelasan dengan contoh konkret, beri waktu tanya-jawab tambahan',
        steps_to_skip:              [],
        steps_to_add:               [],
        pacing_adjustment_minutes:  0,
      },
      {
        id:                         'REC-FACILITY_FAIL',
        trigger:                    'FACILITY_FAIL',
        description:                facilityConstraint
          ? `Lanjut tanpa fasilitas — gunakan alternatif manual (${JSON.stringify(facilityConstraint).slice(0,60)})`
          : 'Lanjut tanpa fasilitas digital — gunakan papan tulis dan diskusi langsung',
        steps_to_skip:              [],
        steps_to_add:               [],
        pacing_adjustment_minutes:  0,
      },
      {
        id:                         'REC-MANY_ABSENT',
        trigger:                    'MANY_ABSENT',
        description:                'Ubah ke aktivitas individual karena jumlah siswa berkurang',
        steps_to_skip:              groupSteps,
        steps_to_add:               [],
        pacing_adjustment_minutes:  0,
      },
      {
        id:                         'REC-CLASS_NOT_FOCUS',
        trigger:                    'CLASS_NOT_FOCUS',
        description:                focusStep
          ? `Lakukan refleksi singkat (step ${focusStep.step_id}) untuk reset fokus kelas`
          : 'Lakukan jeda refleksi singkat untuk reset fokus kelas',
        steps_to_skip:              [],
        steps_to_add:               [],
        pacing_adjustment_minutes:  0,
      },
    ];
  }

  // ── A4. compilePacingPlan ───────────────────────────────────────────────────

  function compilePacingPlan(steps) {
    const phaseMap = {};
    for (const p of PHASES) phaseMap[p] = { phase: p, total_minutes: 0, step_count: 0 };

    for (const s of steps) {
      const ph = phaseMap[s.phase];
      if (ph) { ph.total_minutes += s.planned_minutes; ph.step_count++; }
    }

    const phases      = PHASES.map(p => phaseMap[p]);
    const total_mins  = steps.reduce((s, r) => s + r.planned_minutes, 0);
    return { phases, total_minutes: total_mins, step_count: steps.length };
  }

  // ── A5. compileRuntimePackage ───────────────────────────────────────────────

  async function compileRuntimePackage({
    meetingPlanArtifact,
    meetingAllocationItem,
    assessmentSpecVersion,
    contextSpecVersion,
    tpSnapshot,
    rosterSnapshot,
  }) {
    const meetingNo = meetingPlanArtifact.meeting_no;
    const mpContent = meetingPlanArtifact.content;

    // Inject duration_minutes into content for validation
    const mpContentWithDuration = {
      ...mpContent,
      duration_minutes: mpContent.duration_minutes ?? meetingAllocationItem.duration_minutes,
    };

    // 1–4: compile sub-components
    const steps       = compileRuntimeSteps(mpContentWithDuration, meetingNo);
    const checkpoints = compileFormativeCheckpoints(
      mpContent,
      assessmentSpecVersion?.content,
      meetingNo
    );
    const recoveries  = compileRecoveryActions(mpContent, contextSpecVersion?.content);
    const pacing      = compilePacingPlan(steps);

    // 5: compute package hash via Web Crypto
    const canonical   = JSON.stringify({ steps, checkpoints });
    const msgBuffer   = new TextEncoder().encode(canonical);
    const hashBuffer  = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashHex     = Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0')).join('');

    // 7: final validation
    if (!steps.length) throw new Error('[compiler] steps kosong setelah compile');

    const totalCompiled = steps.reduce((s, r) => s + r.planned_minutes, 0);
    if (totalCompiled !== meetingAllocationItem.duration_minutes) {
      throw new Error(
        `[compiler] steps SUM (${totalCompiled}) ≠ alokasi (${meetingAllocationItem.duration_minutes}) mnt`
      );
    }

    const presentPhases = new Set(steps.map(s => s.phase));
    for (const required of PHASES) {
      if (!presentPhases.has(required)) {
        throw new Error(`[compiler] phase '${required}' tidak ada di steps pertemuan ${meetingNo}`);
      }
    }

    const pkg = {
      package_id:      crypto.randomUUID(),
      planning_context_id: contextSpecVersion?.planning_context_id ?? '',
      meeting_no:      meetingNo,
      runtime_version: 1,
      compiled_at:     new Date().toISOString(),
      source: {
        meeting_plan_version_id:    meetingPlanArtifact.version_id,
        meeting_plan_source_hash:   meetingPlanArtifact.source_hash,
        context_version_id:         contextSpecVersion?.version_id ?? null,
        assessment_version_id:      assessmentSpecVersion?.version_id ?? null,
        meeting_allocation_item_id: meetingAllocationItem.meeting_allocation_item_id,
        dependency_hashes: {},
      },
      duration: {
        jp:               meetingAllocationItem.jp,
        minutes_per_jp:   Math.round(meetingAllocationItem.duration_minutes / (meetingAllocationItem.jp || 1)),
        duration_minutes: meetingAllocationItem.duration_minutes,
      },
      tp_snapshot:        tpSnapshot ?? {},
      steps,
      checkpoints,
      differentiation:    mpContent?.differentiation ?? {},
      recovery_actions:   recoveries,
      resources:          [],
      roster_snapshot:    (rosterSnapshot ?? []).map(r => ({ id: r.id, nama: r.nama })),
      pacing_plan:        pacing,
      integrity: {
        package_hash:          hashHex,
        compiled_from_version: meetingPlanArtifact.version_id,
      },
    };

    return pkg;
  }

  // ── Export ──────────────────────────────────────────────────────────────────

  window.RuntimeCompiler = {
    compileRuntimePackage,
    // Exposed for testing
    _compileRuntimeSteps:         compileRuntimeSteps,
    _compileFormativeCheckpoints: compileFormativeCheckpoints,
    _compileRecoveryActions:      compileRecoveryActions,
    _compilePacingPlan:           compilePacingPlan,
  };

})();
