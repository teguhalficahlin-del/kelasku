/**
 * runtime-sync.js — Background sync manager for offline Runtime events.
 * ZERO DOM manipulation.
 * Events are grouped by session_id and synced sequentially (one call per session).
 */
(function () {
  'use strict';

  // ── Module state ─────────────────────────────────────────────────────────────
  let _syncing       = false;
  let _onlineHandler = null;
  let _retryTimeout  = null;
  let _onlineTimer   = null;

  // ── C2. init ─────────────────────────────────────────────────────────────────

  function init() {
    _onlineHandler = _onOnline;
    window.addEventListener('online',  _onlineHandler);
    window.addEventListener('offline', _onOffline);
  }

  function _onOffline() {
    console.log('[runtime-sync] connection lost');
  }

  // ── C3. onOnline — wait 2 s for connection to stabilise, then sync ────────────

  function _onOnline() {
    console.log('[runtime-sync] online — syncing in 2 s');
    // Cancel any existing timer (connection flapping guard)
    clearTimeout(_onlineTimer);
    _onlineTimer = setTimeout(() => syncPending().catch(err =>
      console.warn('[runtime-sync] post-online sync failed:', err)
    ), 2000);
  }

  // ── C4. syncPending ───────────────────────────────────────────────────────────
  // Groups pending events by session_id; syncs each session sequentially.

  async function syncPending() {
    if (_syncing) return { synced: 0 };
    _syncing = true;

    try {
      const events = await window.RuntimeDb.events.getPending();
      if (!events.length) {
        _syncing = false;
        return { synced: 0 };
      }

      // Group by session_id (preserving client_timestamp ASC order from getPending)
      const groups = new Map();
      for (const ev of events) {
        if (!groups.has(ev.session_id)) groups.set(ev.session_id, []);
        groups.get(ev.session_id).push(ev);
      }

      let totalSynced     = 0;
      let totalDuplicates = 0;

      for (const [sessionId, sessionEvents] of groups) {
        const session = await window.RuntimeDb.sessions.get(sessionId);
        if (!session) {
          // Track orphan attempts via localStorage; after 3 failures mark events failed
          // so they stop blocking future sync cycles.
          const orphanKey = 'sip_orphan_' + sessionId;
          const count = parseInt(localStorage.getItem(orphanKey) || '0') + 1;
          localStorage.setItem(orphanKey, String(count));
          if (count >= 3) {
            await window.RuntimeDb.events.markFailed(sessionEvents.map(e => e.event_id));
            localStorage.removeItem(orphanKey);
            if (typeof window._onOrphanedEvents === 'function') {
              window._onOrphanedEvents(sessionId, sessionEvents.length);
            }
          }
          console.warn('[runtime-sync] session not in IDB — skipping:', sessionId);
          continue;
        }

        try {
          const result = await window.api.runtimeSync({
            action: 'sync_session',
            session: {
              session_id:          session.session_id,
              planning_context_id: session.planning_context_id,
              package_id:          session.package_id,
              meeting_no:          session.meeting_no,
              started_at:          session.started_at,
              ended_at:            session.ended_at ?? null,
            },
            events: sessionEvents.map(e => ({
              event_id:         e.event_id,
              event_type:       e.type,
              step_id:          e.step_id ?? null,
              payload:          e.payload ?? {},
              client_timestamp: e.client_timestamp,
              idempotency_key:  e.event_id,
            })),
          });

          await window.RuntimeDb.events.markSynced(sessionEvents.map(e => e.event_id));
          totalSynced     += result.accepted_event_count  ?? 0;
          totalDuplicates += result.duplicate_event_count ?? 0;

        } catch (err) {
          const status = err?.status ?? err?.context?.status ?? null;

          if (status === 401 || status === 403) {
            // Auth error — do NOT retry; surface immediately
            _syncing = false;
            throw err;
          }

          // Network / 5xx — mark failed, schedule retry in 30 s
          await window.RuntimeDb.events.markFailed(sessionEvents.map(e => e.event_id));
          if (_retryTimeout) clearTimeout(_retryTimeout);
          _retryTimeout = setTimeout(() => syncPending().catch(() => {}), 30000);
          _syncing = false;
          throw err;
        }
      }

      _syncing = false;
      return { synced: totalSynced, duplicates: totalDuplicates };

    } catch (err) {
      _syncing = false;
      throw err;
    }
  }

  // ── C5. checkConflict ─────────────────────────────────────────────────────────

  async function checkConflict(planningContextId, meetingNo) {
    return window.api.runtimeSync({
      action:               'check_session_conflict',
      planning_context_id:  planningContextId,
      meeting_no:           meetingNo,
    });
  }

  // ── C6. cleanupLocal ──────────────────────────────────────────────────────────
  // Deletes stale IDB packages that have no pending events.

  async function cleanupLocal(maxAgeMs) {
    if (maxAgeMs === undefined) maxAgeMs = 7 * 24 * 60 * 60 * 1000;

    const stale   = await window.RuntimeDb.packages.listStale(maxAgeMs);
    const pending = await window.RuntimeDb.events.getPending();

    // Collect package IDs that still have pending events
    const sessionIds       = [...new Set(pending.map(e => e.session_id))];
    const pendingPackageIds = new Set();
    for (const sid of sessionIds) {
      const sess = await window.RuntimeDb.sessions.get(sid);
      if (sess?.package_id) pendingPackageIds.add(sess.package_id);
    }

    let deleted = 0;
    for (const pkg of stale) {
      if (!pendingPackageIds.has(pkg.package_id)) {
        await window.RuntimeDb.packages.delete(pkg.package_id);
        deleted++;
      }
    }
    return { deleted_package_count: deleted };
  }

  // ── C7. destroy ───────────────────────────────────────────────────────────────

  function destroy() {
    if (_onlineHandler) {
      window.removeEventListener('online',  _onlineHandler);
      window.removeEventListener('offline', _onOffline);
      _onlineHandler = null;
    }
    if (_retryTimeout) { clearTimeout(_retryTimeout); _retryTimeout = null; }
    if (_onlineTimer)  { clearTimeout(_onlineTimer);  _onlineTimer  = null; }
    _syncing = false;
  }

  // ── Export ────────────────────────────────────────────────────────────────────

  window.RuntimeSync = { init, syncPending, checkConflict, cleanupLocal, destroy };

})();
