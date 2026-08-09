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
  // 2. Ambil profile guru
  // -------------------------------------------------------------------------
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id')
    .eq('user_id', user.id)
    .eq('role', 'GURU')
    .single();

  if (profileError || !profile) return json({ error: 'Forbidden' }, 403);

  // -------------------------------------------------------------------------
  // 3. Ambil semua classroom guru
  // -------------------------------------------------------------------------
  const { data: classrooms, error: clError } = await admin
    .from('classrooms')
    .select('id')
    .eq('teacher_id', profile.id);

  if (clError) return json({ error: clError.message }, 500);

  // -------------------------------------------------------------------------
  // 4. Hapus data per classroom
  // -------------------------------------------------------------------------
  for (const cl of (classrooms ?? [])) {
    const cid = cl.id;

    const { error: e1 } = await admin.from('attendance').delete().eq('classroom_id', cid);
    if (e1) return json({ error: 'Gagal hapus attendance: ' + e1.message }, 500);

    const { error: e2 } = await admin.from('student_notes').delete().eq('classroom_id', cid);
    if (e2) return json({ error: 'Gagal hapus student_notes: ' + e2.message }, 500);

    const { error: e3 } = await admin.from('schedules').delete().eq('classroom_id', cid);
    if (e3) return json({ error: 'Gagal hapus schedules: ' + e3.message }, 500);

    // assessment_items CASCADE ke student_grades via FK
    const { error: e4 } = await admin.from('assessment_items').delete().eq('classroom_id', cid);
    if (e4) return json({ error: 'Gagal hapus assessment_items: ' + e4.message }, 500);

    // student_grades yang tersisa (tidak ber-FK ke assessment_items)
    const { error: e5 } = await admin.from('student_grades').delete().eq('classroom_id', cid);
    if (e5) return json({ error: 'Gagal hapus student_grades: ' + e5.message }, 500);

    // assessments (pelaksanaan) jika ada
    const { error: e6 } = await admin.from('assessments').delete().eq('classroom_id', cid);
    if (e6) return json({ error: 'Gagal hapus assessments: ' + e6.message }, 500);
  }

  // -------------------------------------------------------------------------
  // 5. Catat waktu reset
  // -------------------------------------------------------------------------
  const { error: updateError } = await admin
    .from('profiles')
    .update({ last_reset_at: new Date().toISOString() })
    .eq('id', profile.id);

  if (updateError) return json({ error: updateError.message }, 500);

  return json({ success: true });
});
