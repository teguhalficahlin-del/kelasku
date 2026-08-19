/**
 * runtime-db.js — IndexedDB schema + repositories for offline Runtime.
 * All operations are wrapped in try/catch; IDB failure never crashes the UI.
 */
(function () {
  'use strict';

  const DB_NAME    = 'sip-runtime';
  const DB_VERSION = 2;

  let _db = null;

  function isQuotaError(err) {
    return err instanceof DOMException &&
      (err.name === 'QuotaExceededError' ||
       err.name === 'NS_ERROR_DOM_QUOTA_REACHED');
  }

  // ── B1. openRuntimeDb ───────────────────────────────────────────────────────

  function openRuntimeDb() {
    if (_db) return Promise.resolve(_db);

    return new Promise((resolve, reject) => {
      try {
        const req = indexedDB.open(DB_NAME, DB_VERSION);

        req.onupgradeneeded = e => {
          const db = e.target.result;

          // 'packages' store
          if (!db.objectStoreNames.contains('packages')) {
            const pkgStore = db.createObjectStore('packages', { keyPath: 'package_id' });
            pkgStore.createIndex('planning_context_id', 'planning_context_id', { unique: false });
            pkgStore.createIndex('meeting_no',          'meeting_no',          { unique: false });
            pkgStore.createIndex('compiled_at',         'compiled_at',         { unique: false });
          }

          // 'sessions' store
          if (!db.objectStoreNames.contains('sessions')) {
            const sesStore = db.createObjectStore('sessions', { keyPath: 'session_id' });
            sesStore.createIndex('package_id',          'package_id',          { unique: false });
            sesStore.createIndex('planning_context_id', 'planning_context_id', { unique: false });
            sesStore.createIndex('started_at',          'started_at',          { unique: false });
            sesStore.createIndex('sync_state',          'sync_state',          { unique: false });
          } else if (e.oldVersion < 2) {
            // Migration v1→v2: add planning_context_id index
            const sesStore = e.target.transaction.objectStore('sessions');
            if (!sesStore.indexNames.contains('planning_context_id')) {
              sesStore.createIndex('planning_context_id', 'planning_context_id', { unique: false });
            }
          }

          // 'events' store
          if (!db.objectStoreNames.contains('events')) {
            const evStore = db.createObjectStore('events', { keyPath: 'event_id' });
            evStore.createIndex('session_id',       'session_id',       { unique: false });
            evStore.createIndex('sync_status',      'sync_status',      { unique: false });
            evStore.createIndex('client_timestamp', 'client_timestamp', { unique: false });
          }

          // 'step_states' store — compound key stored as string 'sessionId:stepId'
          if (!db.objectStoreNames.contains('step_states')) {
            const ssStore = db.createObjectStore('step_states', { keyPath: 'composite_key' });
            ssStore.createIndex('session_id', 'session_id', { unique: false });
          }
        };

        req.onsuccess = e => {
          _db = e.target.result;
          resolve(_db);
        };

        req.onblocked = () => {
          reject(new Error(
            '[runtime-db] IDB upgrade blocked — tutup tab lain lalu muat ulang halaman'
          ));
        };

        req.onerror = e => {
          console.warn('[runtime-db] openRuntimeDb error:', e.target.error);
          reject(e.target.error);
        };
      } catch (err) {
        console.warn('[runtime-db] IDB not available:', err);
        reject(err);
      }
    });
  }

  // ── Generic helpers ─────────────────────────────────────────────────────────

  async function getDb() {
    if (_db) return _db;
    return openRuntimeDb();
  }

  function txPromise(store, mode, fn) {
    return new Promise(async (resolve, reject) => {
      try {
        const db  = await getDb();
        const tx  = db.transaction(store, mode);
        const req = fn(tx.objectStore(store));
        req.onsuccess = e => resolve(e.target.result);
        req.onerror   = e => reject(e.target.error);
        tx.onerror    = e => reject(e.target.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  function txVoid(store, mode, fn) {
    return new Promise(async (resolve, reject) => {
      try {
        const db = await getDb();
        const tx = db.transaction(store, mode);
        fn(tx.objectStore(store));
        tx.oncomplete = () => resolve();
        tx.onerror    = e => reject(e.target.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  // Cursor-based query helper: collect all records from an index matching value
  function indexGetAll(storeName, indexName, value) {
    return new Promise(async (resolve, reject) => {
      try {
        const db      = await getDb();
        const tx      = db.transaction(storeName, 'readonly');
        const store   = tx.objectStore(storeName);
        const index   = store.index(indexName);
        const req     = index.getAll(value);
        req.onsuccess = e => resolve(e.target.result ?? []);
        req.onerror   = e => reject(e.target.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  // ── B2. PackageRepository ───────────────────────────────────────────────────

  const PackageRepository = {
    async save(pkg) {
      try {
        await txVoid('packages', 'readwrite', s => s.put(pkg));
      } catch (err) {
        if (isQuotaError(err)) throw err;
        console.warn('[runtime-db] packages.save error:', err);
      }
    },

    async get(packageId) {
      try {
        return await txPromise('packages', 'readonly', s => s.get(packageId)) ?? null;
      } catch (err) {
        console.warn('[runtime-db] packages.get error:', err);
        return null;
      }
    },

    async getForMeeting(planningContextId, meetingNo) {
      try {
        const all = await indexGetAll('packages', 'planning_context_id', planningContextId);
        return all.find(p => p.meeting_no === meetingNo) ?? null;
      } catch (err) {
        console.warn('[runtime-db] packages.getForMeeting error:', err);
        return null;
      }
    },

    async delete(packageId) {
      try {
        await txVoid('packages', 'readwrite', s => s.delete(packageId));
      } catch (err) {
        if (isQuotaError(err)) throw err;
        console.warn('[runtime-db] packages.delete error:', err);
      }
    },

    async listStale(maxAgeMs) {
      try {
        const all    = await txPromise('packages', 'readonly', s => s.getAll()) ?? [];
        const cutoff = Date.now() - maxAgeMs;
        return all.filter(p => new Date(p.compiled_at).getTime() < cutoff);
      } catch (err) {
        console.warn('[runtime-db] packages.listStale error:', err);
        return [];
      }
    },
  };

  // ── B3. SessionRepository ───────────────────────────────────────────────────

  const SessionRepository = {
    async create(session) {
      try {
        await txVoid('sessions', 'readwrite', s => s.put(session));
      } catch (err) {
        if (isQuotaError(err)) throw err;
        console.warn('[runtime-db] sessions.create error:', err);
      }
    },

    async get(sessionId) {
      try {
        return await txPromise('sessions', 'readonly', s => s.get(sessionId)) ?? null;
      } catch (err) {
        console.warn('[runtime-db] sessions.get error:', err);
        return null;
      }
    },

    async getActive(planningContextId) {
      try {
        const all = await indexGetAll('sessions', 'planning_context_id', planningContextId);
        return all.find(s => !s.ended_at && s.sync_state !== 'synced') ?? null;
      } catch (err) {
        console.warn('[runtime-db] sessions.getActive error:', err);
        return null;
      }
    },

    async update(sessionId, patch) {
      try {
        const db = await getDb();
        await new Promise((resolve, reject) => {
          const tx  = db.transaction('sessions', 'readwrite');
          const s   = tx.objectStore('sessions');
          const req = s.get(sessionId);
          req.onsuccess = e => {
            const existing = e.target.result;
            if (!existing) { resolve(); return; }
            s.put({ ...existing, ...patch });
          };
          tx.oncomplete = () => resolve();
          tx.onerror    = e => reject(e.target.error);
        });
      } catch (err) {
        if (isQuotaError(err)) throw err;
        console.warn('[runtime-db] sessions.update error:', err);
      }
    },

    async markCompleted(sessionId) {
      return SessionRepository.update(sessionId, { ended_at: new Date().toISOString() });
    },
  };

  // ── B4. EventRepository ─────────────────────────────────────────────────────

  const EventRepository = {
    async append(event) {
      try {
        const ev = {
          sync_status: 'pending',
          ...event,
          event_id: event.event_id ?? crypto.randomUUID(),
        };
        await txVoid('events', 'readwrite', s => s.put(ev));
      } catch (err) {
        if (isQuotaError(err)) throw err;
        console.warn('[runtime-db] events.append error:', err);
      }
    },

    async getPending() {
      try {
        const all = await indexGetAll('events', 'sync_status', 'pending');
        return all.sort((a, b) =>
          new Date(a.client_timestamp).getTime() - new Date(b.client_timestamp).getTime()
        );
      } catch (err) {
        console.warn('[runtime-db] events.getPending error:', err);
        return [];
      }
    },

    async _setStatus(eventIds, status) {
      if (!eventIds?.length) return;
      try {
        const db = await getDb();
        await new Promise((resolve, reject) => {
          const tx    = db.transaction('events', 'readwrite');
          const store = tx.objectStore('events');
          for (const id of eventIds) {
            const req = store.get(id);
            req.onsuccess = e => {
              const ev = e.target.result;
              if (ev) store.put({ ...ev, sync_status: status });
            };
          }
          tx.oncomplete = () => resolve();
          tx.onerror    = e => reject(e.target.error);
        });
      } catch (err) {
        if (isQuotaError(err)) throw err;
        console.warn(`[runtime-db] events._setStatus(${status}) error:`, err);
      }
    },

    async markSynced(eventIds)  { return EventRepository._setStatus(eventIds, 'synced'); },
    async markFailed(eventIds)  { return EventRepository._setStatus(eventIds, 'failed'); },

    async countPending() {
      try {
        const pending = await EventRepository.getPending();
        return pending.length;
      } catch (err) {
        console.warn('[runtime-db] events.countPending error:', err);
        return 0;
      }
    },
  };

  // ── B5. StepStateRepository ─────────────────────────────────────────────────

  const StepStateRepository = {
    _key(sessionId, stepId) { return `${sessionId}:${stepId}`; },

    async upsert(sessionId, stepId, state) {
      try {
        const record = {
          composite_key: StepStateRepository._key(sessionId, stepId),
          session_id: sessionId,
          step_id:    stepId,
          ...state,
        };
        await txVoid('step_states', 'readwrite', s => s.put(record));
      } catch (err) {
        if (isQuotaError(err)) throw err;
        console.warn('[runtime-db] stepStates.upsert error:', err);
      }
    },

    async get(sessionId, stepId) {
      try {
        return await txPromise(
          'step_states', 'readonly',
          s => s.get(StepStateRepository._key(sessionId, stepId))
        ) ?? null;
      } catch (err) {
        console.warn('[runtime-db] stepStates.get error:', err);
        return null;
      }
    },

    async getAll(sessionId) {
      try {
        const all    = await indexGetAll('step_states', 'session_id', sessionId);
        const result = {};
        for (const r of all) result[r.step_id] = r;
        return result;
      } catch (err) {
        console.warn('[runtime-db] stepStates.getAll error:', err);
        return {};
      }
    },
  };

  // ── Export ──────────────────────────────────────────────────────────────────

  window.RuntimeDb = {
    open:       openRuntimeDb,
    packages:   PackageRepository,
    sessions:   SessionRepository,
    events:     EventRepository,
    stepStates: StepStateRepository,
  };

})();
