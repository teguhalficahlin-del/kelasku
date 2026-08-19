-- Migration: runtime_sessions + runtime_events
-- Receives offline sync payload from runtime-sync Edge Function.

BEGIN;

CREATE TABLE IF NOT EXISTS runtime_sessions (
  session_id          UUID PRIMARY KEY,
  profile_id          UUID NOT NULL
                      REFERENCES profiles(id) ON DELETE CASCADE,
  planning_context_id UUID NOT NULL
                      REFERENCES rancang_planning_contexts(id)
                      ON DELETE CASCADE,
  package_id          TEXT NOT NULL,
  meeting_no          INT  NOT NULL,
  started_at          TIMESTAMPTZ NOT NULL,
  ended_at            TIMESTAMPTZ,
  sync_state          TEXT NOT NULL DEFAULT 'local'
                      CHECK (sync_state IN ('local', 'synced', 'sync_failed')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS runtime_events (
  event_id            UUID PRIMARY KEY,
  session_id          UUID NOT NULL
                      REFERENCES runtime_sessions(session_id)
                      ON DELETE CASCADE,
  profile_id          UUID NOT NULL
                      REFERENCES profiles(id) ON DELETE CASCADE,
  event_type          TEXT NOT NULL,
  step_id             TEXT,
  payload             JSONB,
  client_timestamp    TIMESTAMPTZ NOT NULL,
  server_timestamp    TIMESTAMPTZ NOT NULL DEFAULT now(),
  idempotency_key     UUID NOT NULL UNIQUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_runtime_events_session
  ON runtime_events(session_id, client_timestamp);

CREATE INDEX IF NOT EXISTS idx_runtime_sessions_profile
  ON runtime_sessions(profile_id, planning_context_id);

ALTER TABLE runtime_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE runtime_events   ENABLE ROW LEVEL SECURITY;

CREATE POLICY "guru manage own sessions"
  ON runtime_sessions FOR ALL TO authenticated
  USING (profile_id = (
    SELECT id FROM profiles WHERE user_id = auth.uid() LIMIT 1
  ))
  WITH CHECK (profile_id = (
    SELECT id FROM profiles WHERE user_id = auth.uid() LIMIT 1
  ));

CREATE POLICY "guru manage own events"
  ON runtime_events FOR ALL TO authenticated
  USING (profile_id = (
    SELECT id FROM profiles WHERE user_id = auth.uid() LIMIT 1
  ))
  WITH CHECK (profile_id = (
    SELECT id FROM profiles WHERE user_id = auth.uid() LIMIT 1
  ));

ROLLBACK;
