import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // 1. Validasi JWT
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ success: false, error: 'Unauthorized', step: 'auth' }, 401);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return json({ success: false, error: 'Unauthorized', step: 'auth' }, 401);

  // 2. Parse body
  let profile_id: string, classroom_id: string;
  try {
    ({ profile_id, classroom_id } = await req.json());
  } catch {
    return json({ success: false, error: 'Request body tidak valid', step: 'parse' }, 400);
  }
  if (!profile_id || !classroom_id) {
    return json({ success: false, error: 'profile_id dan classroom_id wajib', step: 'validate' }, 400);
  }

  // 3. Verifikasi role GURU + ownership classroom dalam satu query atomic
  const { data: guruProfile, error: profileError } = await supabase
    .from('profiles')
    .select('id, role, classrooms!classrooms_teacher_id_fkey!inner(id)')
    .eq('user_id', user.id)
    .eq('classrooms.id', classroom_id)
    .single();
  if (profileError || !guruProfile || guruProfile.role !== 'GURU') {
    return json({ success: false, error: 'Forbidden', step: 'ownership' }, 403);
  }

  // Admin client — semua operasi berikut bypass RLS
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // 3b. Verifikasi profile_id ada di roster classroom ini
  const { data: rosterCheck, error: rosterCheckErr } = await admin
    .from('classroom_roster')
    .select('profile_id')
    .eq('profile_id', profile_id)
    .eq('classroom_id', classroom_id)
    .maybeSingle();
  if (rosterCheckErr || !rosterCheck) {
    return json({ success: false, error: 'Forbidden', step: 'roster_check' }, 403);
  }

  // 4. Query profil siswa
  const { data: siswa, error: siswaErr } = await admin
    .from('profiles')
    .select('id, user_id, email')
    .eq('id', profile_id)
    .single();
  if (siswaErr || !siswa) {
    return json({ success: false, error: 'Profil siswa tidak ditemukan', step: 'query_siswa' }, 404);
  }

  // 5. Query ortu yang linked ke siswa ini di classroom ini
  const { data: ortuMembers, error: ortuErr } = await admin
    .from('classroom_members')
    .select('profile_id')
    .eq('classroom_id', classroom_id)
    .eq('linked_student_id', profile_id)
    .eq('member_role', 'ORTU');
  if (ortuErr) {
    return json({ success: false, error: ortuErr.message, step: 'query_ortu' }, 500);
  }

  let ortu_count = 0;

  // 6. Hapus akun ortu satu per satu
  // classroom_members ortu akan ter-cascade hapus saat profiles ortu dihapus
  // (profiles.user_id → auth.users ON DELETE CASCADE)
  for (const ortuMember of ortuMembers ?? []) {
    const { data: ortuProfile } = await admin
      .from('profiles')
      .select('user_id')
      .eq('id', ortuMember.profile_id)
      .single();
    if (ortuProfile?.user_id) {
      const { error: delOrtuErr } = await admin.auth.admin.deleteUser(ortuProfile.user_id);
      if (!delOrtuErr) ortu_count++;
    }
  }

  // 7. Hapus data siswa yang referensi profiles tanpa ON DELETE — wajib sebelum deleteUser
  // (student_notes.student_id, guidance_sessions.student_id, forum_comments.author_id
  //  semua REFERENCES profiles(id) tanpa ON DELETE — akan memblokir cascade jika tidak dihapus)
  await admin.from('student_notes').delete().eq('student_id', profile_id);
  await admin.from('guidance_sessions').delete().eq('student_id', profile_id);
  await admin.from('forum_comments').delete().eq('author_id', profile_id);

  // 8. Query NIS dari roster sebelum deleteUser — dibutuhkan untuk delete setelah user hilang
  const { data: rosterRow } = await admin
    .from('classroom_roster')
    .select('nis')
    .eq('profile_id', profile_id)
    .eq('classroom_id', classroom_id)
    .single();

  // 9. Hapus classroom_members siswa
  await admin
    .from('classroom_members')
    .delete()
    .eq('profile_id', profile_id)
    .eq('classroom_id', classroom_id);

  // 10. deleteUser siswa — cascade ke profiles (ON DELETE CASCADE dari auth.users → profiles)
  //     FK classroom_roster.profile_id ON DELETE SET NULL otomatis null-kan kolom
  const { error: delSiswaErr } = await admin.auth.admin.deleteUser(siswa.user_id);
  if (delSiswaErr) {
    return json({ success: false, error: delSiswaErr.message, step: 'delete_user_siswa' }, 500);
  }

  // 11. Hapus baris classroom_roster sepenuhnya — dilakukan setelah deleteUser
  //     Gunakan nis (bukan profile_id yang sudah null setelah cascade)
  if (rosterRow?.nis) {
    await admin
      .from('classroom_roster')
      .delete()
      .eq('classroom_id', classroom_id)
      .eq('nis', rosterRow.nis);
  }

  return json({ success: true, deleted: { siswa: siswa.email, ortu_count } });
});
