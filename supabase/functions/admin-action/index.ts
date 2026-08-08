import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  // -------------------------------------------------------------------------
  // 1. Verifikasi JWT
  // -------------------------------------------------------------------------
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

  const jwt = authHeader.slice(7);
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: { user }, error: authError } = await admin.auth.getUser(jwt);
  if (authError || !user) return json({ error: 'Unauthorized' }, 401);

  // -------------------------------------------------------------------------
  // 2. Verifikasi admin — email harus cocok dengan ADMIN_EMAIL secret
  // -------------------------------------------------------------------------
  const adminEmail = Deno.env.get('ADMIN_EMAIL') ?? '';
  if (!adminEmail || user.email !== adminEmail) return json({ error: 'Forbidden' }, 403);

  // -------------------------------------------------------------------------
  // 3. Parse body
  // -------------------------------------------------------------------------
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Request body tidak valid' }, 400);
  }

  const { action } = body;

  // -------------------------------------------------------------------------
  // 4. Router action
  // -------------------------------------------------------------------------

  // -- list_gurus -----------------------------------------------------------
  if (action === 'list_gurus') {
    const { data: gurus, error } = await admin
      .from('profiles')
      .select(`
        id,
        full_name,
        username,
        created_at,
        is_active,
        trial_started_at,
        activated_at,
        expires_at,
        classrooms(id)
      `)
      .eq('role', 'GURU')
      .order('created_at', { ascending: false });

    if (error) return json({ error: error.message }, 500);

    const now = Date.now();
    const result = (gurus ?? []).map((g) => {
      const classroomCount = Array.isArray(g.classrooms) ? g.classrooms.length : 0;
      const expiresMs = g.expires_at ? new Date(g.expires_at).getTime() : null;

      let status: string;
      let hari_tersisa = 0;

      if (!g.trial_started_at) {
        status = 'belum_trial';
      } else if (g.is_active && g.activated_at) {
        status = 'AKTIF';
        hari_tersisa = expiresMs ? Math.max(0, Math.floor((expiresMs - now) / 86400000)) : 0;
      } else if (g.is_active) {
        status = 'TRIAL';
        hari_tersisa = expiresMs ? Math.max(0, Math.floor((expiresMs - now) / 86400000)) : 0;
      } else {
        status = 'EXPIRED';
      }

      return {
        id:               g.id,
        full_name:        g.full_name,
        username:         g.username,
        created_at:       g.created_at,
        is_active:        g.is_active,
        trial_started_at: g.trial_started_at,
        activated_at:     g.activated_at,
        expires_at:       g.expires_at,
        classroom_count:  classroomCount,
        status,
        hari_tersisa,
      };
    });

    return json({ data: result });
  }

  // -- activate_guru --------------------------------------------------------
  if (action === 'activate_guru') {
    const guru_id = body.guru_id as string;
    if (!guru_id) return json({ error: 'guru_id wajib' }, 400);

    const { error } = await admin
      .from('profiles')
      .update({
        is_active:    true,
        activated_at: new Date().toISOString(),
        expires_at:   new Date(Date.now() + 365 * 86400000).toISOString(),
      })
      .eq('id', guru_id)
      .eq('role', 'GURU');

    if (error) return json({ error: error.message }, 500);
    return json({ success: true });
  }

  // -- deactivate_guru ------------------------------------------------------
  if (action === 'deactivate_guru') {
    const guru_id = body.guru_id as string;
    if (!guru_id) return json({ error: 'guru_id wajib' }, 400);

    const { error } = await admin
      .from('profiles')
      .update({ is_active: false })
      .eq('id', guru_id)
      .eq('role', 'GURU');

    if (error) return json({ error: error.message }, 500);
    return json({ success: true });
  }

  // -- extend_guru ----------------------------------------------------------
  if (action === 'extend_guru') {
    const guru_id = body.guru_id as string;
    const days    = typeof body.days === 'number' ? body.days : 365;
    if (!guru_id) return json({ error: 'guru_id wajib' }, 400);

    // Ambil expires_at saat ini untuk GREATEST logic
    const { data: profile, error: fetchErr } = await admin
      .from('profiles')
      .select('expires_at')
      .eq('id', guru_id)
      .eq('role', 'GURU')
      .single();

    if (fetchErr || !profile) return json({ error: 'Guru tidak ditemukan' }, 404);

    const base = profile.expires_at
      ? Math.max(new Date(profile.expires_at).getTime(), Date.now())
      : Date.now();
    const new_expires = new Date(base + days * 86400000).toISOString();

    const { error } = await admin
      .from('profiles')
      .update({ expires_at: new_expires })
      .eq('id', guru_id)
      .eq('role', 'GURU');

    if (error) return json({ error: error.message }, 500);
    return json({ success: true, expires_at: new_expires });
  }

  return json({ error: 'Action tidak dikenal: ' + action }, 400);
});
