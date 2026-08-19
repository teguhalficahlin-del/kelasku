/**
 * runtime-session.js — Session state machine + local event sourcing.
 * ZERO DOM. All writes go to IndexedDB first, then return.
 */
(function () {
  'use strict';

  let _startingSession = false;
  const _sessionOpLock = new Map(); // sessionId → boolean (prevent concurrent advance/skip)

  // ── Helpers ─────────────────────────────────────────────────────────────────

  function now() { return new Date().toISOString(); }

  async function appendEvent(sessionId, event) {
    await window.RuntimeDb.events.append({
      session_id:       sessionId,
      client_timestamp: now(),
      sync_status:      'pending',
      ...event,
    });
  }

  // Find next step that is not yet completed or skipped
  function findNextPending(pkg, stepStates, fromStepId) {
    const steps = pkg.steps;
    const curIdx = steps.findIndex(s => s.id === fromStepId);
    for (let i = curIdx + 1; i < steps.length; i++) {
      const ss = stepStates[steps[i].id];
      if (!ss || (ss.status !== 'completed' && ss.status !== 'skipped')) {
        return steps[i];
      }
    }
    return null;
  }

  function findPrevStep(pkg, fromStepId) {
    const steps = pkg.steps;
    const curIdx = steps.findIndex(s => s.id === fromStepId);
    return curIdx > 0 ? steps[curIdx - 1] : null;
  }

  // ── A1. startSession ─────────────────────────────────────────────────────────

  async function startSession(pkg) {
    // Guard: if a concurrent call is already creating a session, wait briefly then
    // check if it finished — prevents double session from rapid double-tap on MULAI.
    if (_startingSession) {
      await new Promise(r => setTimeout(r, 300));
      const raced = await window.RuntimeDb.sessions.getActive(pkg.planning_context_id);
      if (raced) return raced;
    }
    _startingSession = true;
    try {
      const rdb = window.RuntimeDb;

      // Resume if active session exists for this planning context
      const existing = await rdb.sessions.getActive(pkg.planning_context_id);
      if (existing) {
        await appendEvent(existing.session_id, { type: 'session_resumed', payload: { resumed: true } });
        return existing;
      }

      const session = {
        session_id:          crypto.randomUUID(),
        package_id:          pkg.package_id,
        planning_context_id: pkg.planning_context_id,
        meeting_no:          pkg.meeting_no,
        started_at:          now(),
        ended_at:            null,
        current_step_id:     pkg.steps[0].id,
        navigation_position: pkg.steps[0].id,
        step_states:         {},
        pacing_state: {
          started_at:             now(),
          elapsed_minutes:        0,
          planned_total_minutes:  pkg.duration.duration_minutes,
        },
        sync_state: 'local',
      };

      await rdb.sessions.create(session);
      await appendEvent(session.session_id, {
        type: 'session_started',
        payload: {
          package_id:  pkg.package_id,
          meeting_no:  pkg.meeting_no,
          tp_judul:    pkg.tp_snapshot?.judul ?? '',
        },
      });

      return session;
    } finally {
      _startingSession = false;
    }
  }

  // ── A2. advanceStep ──────────────────────────────────────────────────────────

  async function advanceStep(session, pkg) {
    // Guard: prevent concurrent advance/skip for the same session (e.g. swipe + tap overlap)
    if (_sessionOpLock.get(session.session_id)) return null;
    _sessionOpLock.set(session.session_id, true);
    try {
      const rdb    = window.RuntimeDb;
      const curId  = session.navigation_position;

      // Mark current step completed
      await rdb.stepStates.upsert(session.session_id, curId, {
        status:       'completed',
        completed_at: now(),
      });
      await appendEvent(session.session_id, { type: 'step_completed', step_id: curId });

      // Load fresh step states to find next pending
      const stepStates = await rdb.stepStates.getAll(session.session_id);
      const nextStep   = findNextPending(pkg, stepStates, curId);

      if (!nextStep) return null;

      const updated = { ...session, navigation_position: nextStep.id, current_step_id: nextStep.id };
      await rdb.sessions.update(session.session_id, {
        navigation_position: nextStep.id,
        current_step_id:     nextStep.id,
      });
      await appendEvent(session.session_id, { type: 'step_viewed', step_id: nextStep.id });

      return { session: updated, currentStep: nextStep };
    } finally {
      _sessionOpLock.delete(session.session_id);
    }
  }

  // ── A3. skipStep ─────────────────────────────────────────────────────────────

  async function skipStep(session, pkg) {
    // Guard: same lock as advanceStep — prevents concurrent step mutations
    if (_sessionOpLock.get(session.session_id)) return null;
    _sessionOpLock.set(session.session_id, true);
    try {
      const rdb   = window.RuntimeDb;
      const curId = session.navigation_position;

      await rdb.stepStates.upsert(session.session_id, curId, {
        status:     'skipped',
        skipped_at: now(),
      });
      await appendEvent(session.session_id, {
        type:    'step_skipped',
        step_id: curId,
        payload: { reason: 'teacher_skip' },
      });

      const stepStates = await rdb.stepStates.getAll(session.session_id);
      const nextStep   = findNextPending(pkg, stepStates, curId);

      if (!nextStep) return null;

      const updated = { ...session, navigation_position: nextStep.id, current_step_id: nextStep.id };
      await rdb.sessions.update(session.session_id, {
        navigation_position: nextStep.id,
        current_step_id:     nextStep.id,
      });
      await appendEvent(session.session_id, { type: 'step_viewed', step_id: nextStep.id });

      return { session: updated, currentStep: nextStep };
    } finally {
      _sessionOpLock.delete(session.session_id);
    }
  }

  // ── A4. goBack ───────────────────────────────────────────────────────────────

  async function goBack(session, pkg) {
    const rdb      = window.RuntimeDb;
    const prevStep = findPrevStep(pkg, session.navigation_position);

    if (!prevStep) {
      // Already at first step — return current unchanged
      const curStep = pkg.steps.find(s => s.id === session.navigation_position);
      return { session, currentStep: curStep };
    }

    // Update navigation only — DO NOT change execution_status of previous step
    const updated = { ...session, navigation_position: prevStep.id };
    await rdb.sessions.update(session.session_id, { navigation_position: prevStep.id });
    await appendEvent(session.session_id, { type: 'step_revisited', step_id: prevStep.id });

    return { session: updated, currentStep: prevStep };
  }

  // ── A5. pauseSession ─────────────────────────────────────────────────────────

  async function pauseSession(session) {
    await appendEvent(session.session_id, { type: 'session_paused' });
  }

  // ── A6. resumeSession ────────────────────────────────────────────────────────

  async function resumeSession(session) {
    await appendEvent(session.session_id, { type: 'session_resumed', payload: { resumed: false } });
  }

  // ── A7. completeSession ──────────────────────────────────────────────────────

  async function completeSession(session, pkg) {
    const rdb        = window.RuntimeDb;
    const stepStates = await rdb.stepStates.getAll(session.session_id);
    const skipped    = Object.values(stepStates).filter(s => s.status === 'skipped').length;
    const completed  = Object.values(stepStates).filter(s => s.status === 'completed').length;

    await rdb.sessions.markCompleted(session.session_id);
    await appendEvent(session.session_id, {
      type: 'session_completed',
      payload: {
        total_steps: pkg?.steps?.length ?? 0,
        completed,
        skipped,
      },
    });
  }

  // ── A8. recordClassPulse ─────────────────────────────────────────────────────

  async function recordClassPulse(session, stepId, status) {
    await appendEvent(session.session_id, {
      type:    'class_pulse_recorded',
      step_id: stepId,
      payload: { status },
    });
  }

  // ── A9. recordObservation ────────────────────────────────────────────────────

  async function recordObservation(session, stepId, targets, status) {
    if (!targets?.length) {
      console.warn('[session] recordObservation dipanggil tanpa targets — tidak ada yang dicatat');
      return;
    }
    const checkpointId = session.current_checkpoint_id ?? null;
    for (const target of targets) {
      await appendEvent(session.session_id, {
        type:    'student_observation_recorded',
        step_id: stepId,
        payload: {
          target_id:     target.id,
          target_nama:   target.nama,
          status,
          checkpoint_id: checkpointId,
        },
      });
    }
  }

  // ── A10. applyAdaptation ─────────────────────────────────────────────────────

  async function applyAdaptation(session, recoveryId) {
    await appendEvent(session.session_id, {
      type:    'adaptation_applied',
      payload: { recovery_id: recoveryId },
    });
  }

  // ── A11. jumpToClosing ───────────────────────────────────────────────────────

  async function jumpToClosing(session, pkg) {
    const rdb        = window.RuntimeDb;
    const stepStates = await rdb.stepStates.getAll(session.session_id);
    const skippedIds = [];

    // Mark all non-completed, non-closing steps as skipped
    for (const step of pkg.steps) {
      if (step.phase === 'closing') continue;
      const ss = stepStates[step.id];
      if (ss?.status === 'completed' || ss?.status === 'skipped') continue;
      await rdb.stepStates.upsert(session.session_id, step.id, {
        status:     'skipped',
        skipped_at: now(),
      });
      skippedIds.push(step.id);
    }

    const closingStep = pkg.steps.find(s => s.phase === 'closing');
    if (!closingStep) return null;

    await appendEvent(session.session_id, {
      type:    'jump_to_closing',
      payload: { skipped_step_ids: skippedIds },
    });

    const updated = { ...session, navigation_position: closingStep.id, current_step_id: closingStep.id };
    await rdb.sessions.update(session.session_id, {
      navigation_position: closingStep.id,
      current_step_id:     closingStep.id,
    });

    return { session: updated, step: closingStep };
  }

  // ── Export ───────────────────────────────────────────────────────────────────

  window.RuntimeSession = {
    startSession,
    advanceStep,
    skipStep,
    goBack,
    pauseSession,
    resumeSession,
    completeSession,
    recordClassPulse,
    recordObservation,
    applyAdaptation,
    jumpToClosing,
  };

})();
