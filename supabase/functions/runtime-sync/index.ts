// runtime-sync — Receives offline session + event sync from the Runtime client.
// Idempotent: ON CONFLICT idempotency_key DO NOTHING for events.
// Auth errors are never retried by the client — 401/403 terminates the sync attempt.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const reply = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: CORS });

// ── Main handler ──────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return reply({ error: 'Method tidak diizinkan' }, 405);

  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return reply({ error: 'Unauthorized' }, 401);
  const token = auth.slice(7);

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // 1. Verify identity from JWT
  const { data: { user } } = await admin.auth.getUser(token);
  if (!user) return reply({ error: 'Unauthorized' }, 401);

  // 2. Resolve profile (GURU only)
  const { data: profile } = await admin
    .from('profiles')
    .select('id, role')
    .eq('user_id', user.id)
    .single();
  if (!profile || profile.role !== 'GURU')
    return reply({ error: 'Akses ditolak — hanya GURU' }, 403);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return reply({ error: 'Payload tidak valid' }, 400); }

  const action = String(body.action ?? '');

  try {

    // ── ACTION: sync_session ────────────────────────────────────────────────────
    if (action === 'sync_session') {
      const session = body.session as Record<string, unknown> | null;
      const events  = body.events  as Array<Record<string, unknown>> | null;

      if (!session?.session_id || !session?.planning_context_id)
        return reply({ error: 'Payload session tidak lengkap' }, 400);

      const planningContextId = String(session.planning_context_id);
      const sessionId         = String(session.session_id);

      // Verify planning_context belongs to this profile
      const { data: pc } = await admin
        .from('rancang_planning_contexts')
        .select('id')
        .eq('id', planningContextId)
        .eq('profile_id', profile.id)
        .maybeSingle();
      if (!pc) return reply({ error: 'Planning context tidak diizinkan' }, 403);

      // Upsert session — guard profile_id in WHERE of DO UPDATE
      const { error: sessionErr } = await admin.rpc('fn_runtime_upsert_session', {
        p_session_id:          sessionId,
        p_profile_id:          profile.id,
        p_planning_context_id: planningContextId,
        p_package_id:          String(session.package_id ?? ''),
        p_meeting_no:          Number(session.meeting_no ?? 0),
        p_started_at:          String(session.started_at ?? ''),
        p_ended_at:            session.ended_at ? String(session.ended_at) : null,
      });

      // Fallback: if RPC not available, use raw upsert
      if (sessionErr && sessionErr.code === 'PGRST202') {
        // RPC not deployed yet — use raw SQL via DB API
        const { error: rawErr } = await admin
          .from('runtime_sessions')
          .upsert({
            session_id:          sessionId,
            profile_id:          profile.id,
            planning_context_id: planningContextId,
            package_id:          String(session.package_id ?? ''),
            meeting_no:          Number(session.meeting_no ?? 0),
            started_at:          String(session.started_at ?? ''),
            ended_at:            session.ended_at ? String(session.ended_at) : null,
            sync_state:          'synced',
            updated_at:          new Date().toISOString(),
          }, {
            onConflict:       'session_id',
            ignoreDuplicates: false,
          });
        if (rawErr) throw rawErr;
      } else if (sessionErr) {
        throw sessionErr;
      }

      // Mark session synced (update sync_state)
      await admin
        .from('runtime_sessions')
        .update({ sync_state: 'synced', updated_at: new Date().toISOString() })
        .eq('session_id', sessionId)
        .eq('profile_id', profile.id);

      // Insert events idempotently
      let acceptedCount   = 0;
      let duplicateCount  = 0;

      if (Array.isArray(events) && events.length > 0) {
        for (const ev of events) {
          if (!ev.idempotency_key || !ev.event_id) continue;
          const { error: evErr, data: evData } = await admin
            .from('runtime_events')
            .insert({
              event_id:         String(ev.event_id),
              session_id:       sessionId,
              profile_id:       profile.id,
              event_type:       String(ev.event_type ?? ''),
              step_id:          ev.step_id ? String(ev.step_id) : null,
              payload:          ev.payload ?? {},
              client_timestamp: String(ev.client_timestamp ?? ''),
              idempotency_key:  String(ev.idempotency_key),
            })
            .select('event_id');

          if (evErr) {
            // ON CONFLICT (idempotency_key) — duplicate
            if (evErr.code === '23505') {
              duplicateCount++;
            } else {
              console.warn('[runtime-sync] event insert error:', evErr);
            }
          } else {
            acceptedCount++;
          }
        }
      }

      return reply({
        synced_session_id:     sessionId,
        accepted_event_count:  acceptedCount,
        duplicate_event_count: duplicateCount,
        server_timestamp:      new Date().toISOString(),
      });
    }

    // ── ACTION: check_session_conflict ──────────────────────────────────────────
    if (action === 'check_session_conflict') {
      const planningContextId = String(body.planning_context_id ?? '');
      const meetingNo         = Number(body.meeting_no ?? 0);

      if (!planningContextId || !meetingNo)
        return reply({ error: 'planning_context_id dan meeting_no wajib diisi' }, 400);

      const { data: activeSessions } = await admin
        .from('runtime_sessions')
        .select('session_id, started_at, package_id')
        .eq('planning_context_id', planningContextId)
        .eq('meeting_no', meetingNo)
        .eq('profile_id', profile.id)
        .is('ended_at', null)
        .order('started_at', { ascending: false })
        .limit(2);

      const sessions = activeSessions ?? [];
      return reply({
        conflict:        sessions.length > 1,
        active_sessions: sessions,
      });
    }

    // ── ACTION: cleanup_synced ──────────────────────────────────────────────────
    if (action === 'cleanup_synced') {
      const olderThanDays = Number(body.older_than_days ?? 30);

      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - olderThanDays);

      const { count, error: delErr } = await admin
        .from('runtime_events')
        .delete({ count: 'exact' })
        .eq('profile_id', profile.id)
        .lt('created_at', cutoff.toISOString());

      if (delErr) throw delErr;

      return reply({ deleted_event_count: count ?? 0 });
    }

    return reply({ error: 'Action tidak dikenal' }, 400);

  } catch (err) {
    console.error('[runtime-sync]', err);
    return reply({ error: 'Operasi sync gagal' }, 409);
  }
});
