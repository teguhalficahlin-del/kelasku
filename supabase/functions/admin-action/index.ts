import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS = {
  // Dibaca dari environment supaya satu `supabase secrets set ALLOWED_ORIGIN=...`
  // berlaku untuk keempat belas Edge Function sekaligus -- tidak perlu menyunting
  // dan men-deploy ulang satu per satu saat MiClass pindah domain. Fallback-nya
  // adalah nilai yang sebelumnya tertanam di sini, jadi env yang belum diset
  // berarti perilaku lama -- bukan CORS yang rusak.
  'Access-Control-Allow-Origin':
    Deno.env.get('ALLOWED_ORIGIN') ?? 'https://teguhalficahlin-del.github.io',
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
        email,
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
        username:         g.email,
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

  // -- delete_guru ----------------------------------------------------------
  if (action === 'delete_guru') {
    const guru_id = body.guru_id as string;
    if (!guru_id) return json({ error: 'guru_id wajib' }, 400);

    // 1. Ambil user_id guru dari profiles sebelum cascade hapus
    const { data: guruProfile, error: guruFetchErr } = await admin
      .from('profiles')
      .select('user_id')
      .eq('id', guru_id)
      .eq('role', 'GURU')
      .single();

    if (guruFetchErr || !guruProfile) return json({ error: 'Guru tidak ditemukan' }, 404);

    // 2. Ambil semua classroom milik guru
    const { data: classrooms, error: clErr } = await admin
      .from('classrooms')
      .select('id')
      .eq('teacher_id', guru_id);

    if (clErr) return json({ error: clErr.message }, 500);

    // 3. Hapus akun Auth siswa dan ortu di setiap classroom
    for (const classroom of (classrooms ?? [])) {
      const { data: members, error: memErr } = await admin
        .from('classroom_members')
        .select('profile_id')
        .eq('classroom_id', classroom.id)
        .in('member_role', ['SISWA', 'ORTU']);

      if (memErr) return json({ error: memErr.message }, 500);

      for (const member of (members ?? [])) {
        const { data: memberProfile, error: mpErr } = await admin
          .from('profiles')
          .select('user_id')
          .eq('id', member.profile_id)
          .single();

        if (mpErr || !memberProfile?.user_id) continue;

        await admin.rpc('delete_auth_user', { uid: memberProfile.user_id });
      }
    }

    // 4. Hapus akun Auth guru — CASCADE DB hapus profiles → classrooms → semua data
    const { error: deleteErr } = await admin.rpc('delete_auth_user', { uid: guruProfile.user_id });
    if (deleteErr) return json({ error: deleteErr.message }, 500);

    return json({ success: true });
  }

  // -- reset_password_guru --------------------------------------------------
  if (action === 'reset_password_guru') {
    const guru_id = body.guru_id as string;
    if (!guru_id) return json({ error: 'guru_id wajib' }, 400);

    // Sasaran harus profil GURU di project ini, dan harus punya email. Tanpa
    // penyaringan role, satu id siswa atau ortu sudah cukup untuk memicu email
    // pemulihan ke akun yang bukan guru.
    const { data: guru, error: fetchErr } = await admin
      .from('profiles')
      .select('email, is_active')
      .eq('id', guru_id)
      .eq('role', 'GURU')
      .single();

    if (fetchErr || !guru)  return json({ error: 'Guru tidak ditemukan' }, 404);
    if (!guru.email)        return json({ error: 'Guru ini tidak punya email terdaftar' }, 400);
    if (!guru.is_active)    return json({ error: 'Guru ini tidak aktif' }, 400);

    // resetPasswordForEmail, bukan generateLink: generateLink hanya MEMBUAT
    // tautan dan mengembalikannya ke pemanggil — tidak ada email yang terkirim.
    // Yang diminta di sini adalah emailnya sampai ke guru, dan itu endpoint
    // recover yang mengirimkannya lewat SMTP project.
    const redirectTo = (Deno.env.get('RESET_REDIRECT_URL') ??
      'https://teguhalficahlin-del.github.io/kelasku/guru/reset-password.html');

    const { error } = await admin.auth.resetPasswordForEmail(guru.email, { redirectTo });
    if (error) return json({ error: error.message }, 500);

    return json({ success: true, email: guru.email });
  }

  return json({ error: 'Action tidak dikenal: ' + action }, 400);
});
