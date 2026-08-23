import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
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

  // 3a. Pembatas laju — SEC-035.
  //
  // Kuncinya user.id, bukan IP: X-Forwarded-For dikendalikan klien. Batasnya
  // paling ketat kedua setelah semester-reset karena setiap panggilan yang
  // berhasil menghapus akun auth secara permanen -- tidak ada undo.
  //
  // Kegagalan RPC tidak memblokir: guru yang sah tetap bisa menghapus siswa
  // meski pembatas lajunya sendiri bermasalah.
  const { data: rlAllowed, error: rlError } = await admin.rpc('fn_check_rate_limit', {
    p_identifier:     user.id,
    p_endpoint:       'hapus-akun',
    p_max_requests:   20,
    p_window_minutes: 60,
  });
  if (rlError) {
    console.error('hapus-akun: fn_check_rate_limit gagal', rlError);
  } else if (rlAllowed === false) {
    return json(
      {
        success: false,
        error: 'Terlalu banyak permintaan hapus. Coba lagi dalam satu jam.',
        step:  'rate_limit',
      },
      429,
    );
  }

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

  // 7. CATAT dulu, jangan hapus dulu.
  //
  // Urutan lama menghapus data siswa di sini, sebelum akun auth-nya. Kalau
  // deleteUser di bawah gagal -- jaringan, rate limit, apa pun -- datanya sudah
  // lenyap sementara akunnya masih hidup. Siswa itu lalu terjebak: barisnya di
  // classroom_members sudah hilang sehingga ia tidak bisa memakai apa pun, dan
  // slot roster-nya masih memegang profile_id sehingga fn_activate_roster
  // menolak membuatkan akun baru. Tidak ada jalan keluar dari portal guru.
  //
  // Komentar lama di sini menyatakan ketiga tabel ini "REFERENCES profiles(id)
  // tanpa ON DELETE" sehingga wajib dihapus lebih dulu. Itu sudah tidak berlaku
  // sejak 20260804000003 dan 20260804000004. Keadaan FK sekarang:
  //
  //   forum_comments.author_id      CASCADE   -> ikut terhapus sendiri
  //   classroom_members.profile_id  CASCADE   -> ikut terhapus sendiri
  //   student_notes.student_id      SET NULL  -> baris BERTAHAN, kolomnya jadi NULL
  //   guidance_sessions.student_id  SET NULL  -> baris BERTAHAN, kolomnya jadi NULL
  //   classroom_roster.profile_id   SET NULL  -> baris BERTAHAN, dibersihkan manual
  //
  // Tidak ada yang memblokir, jadi deleteUser boleh jalan duluan. Tetapi dua
  // yang SET NULL tidak ikut terhapus: tanpa penanganan, catatan siswa dan
  // catatan sesi pembinaan tentang anak yang sudah dihapus akan bertahan
  // selamanya sebagai baris yatim. Untuk guidance_sessions -- yang selalu
  // private -- itu masalah privasi, bukan sekadar sampah.
  //
  // Karena itu id-nya dicatat SEKARANG, selagi student_id masih terisi, lalu
  // barisnya dihapus berdasarkan id itu SESUDAH akunnya hilang.
  const { data: catatanRows }  = await admin
    .from('student_notes')
    .select('id')
    .eq('student_id', profile_id);

  const { data: pembinaanRows } = await admin
    .from('guidance_sessions')
    .select('id')
    .eq('student_id', profile_id);

  // NIS dicatat juga: sesudah deleteUser, classroom_roster.profile_id sudah
  // di-NULL-kan FK, jadi barisnya tidak bisa lagi dicari lewat profile_id.
  const { data: rosterRow } = await admin
    .from('classroom_roster')
    .select('nis')
    .eq('profile_id', profile_id)
    .eq('classroom_id', classroom_id)
    .single();

  // 8. Hapus akun auth siswa — LANGKAH MERUSAK PERTAMA untuk siswa ini.
  //    Sebelum baris ini, tidak satu pun data siswa tersentuh; kegagalan di sini
  //    meninggalkan segalanya utuh dan guru bisa mengulang dengan aman.
  //    Cascade menyapu profiles, classroom_members, dan forum_comments sekaligus.
  const { error: delSiswaErr } = await admin.auth.admin.deleteUser(siswa.user_id);
  if (delSiswaErr) {
    return json({ success: false, error: delSiswaErr.message, step: 'delete_user_siswa' }, 500);
  }

  // 9. Bersihkan sisa yang tidak ikut cascade.
  //
  // Mulai titik ini akunnya sudah hilang dan itu tidak bisa dibatalkan, jadi
  // kegagalan di bawah TIDAK dilaporkan sebagai gagal: mengatakan "gagal" akan
  // membuat guru menekan hapus sekali lagi untuk siswa yang sudah tidak ada.
  // Yang tersisa dilaporkan apa adanya lewat field `sisa`.
  const sisa: string[] = [];

  const catatanIds  = (catatanRows  ?? []).map((r) => r.id);
  const pembinaanIds = (pembinaanRows ?? []).map((r) => r.id);

  if (catatanIds.length > 0) {
    const { error } = await admin.from('student_notes').delete().in('id', catatanIds);
    if (error) sisa.push('student_notes: ' + error.message);
  }

  if (pembinaanIds.length > 0) {
    const { error } = await admin.from('guidance_sessions').delete().in('id', pembinaanIds);
    if (error) sisa.push('guidance_sessions: ' + error.message);
  }

  if (rosterRow?.nis) {
    const { error } = await admin
      .from('classroom_roster')
      .delete()
      .eq('classroom_id', classroom_id)
      .eq('nis', rosterRow.nis);
    if (error) sisa.push('classroom_roster: ' + error.message);
  }

  if (sisa.length > 0) {
    console.error('hapus-akun: akun terhapus, sisa belum bersih', { profile_id, sisa });
  }

  return json({
    success: true,
    deleted: { siswa: siswa.email, ortu_count },
    ...(sisa.length > 0 ? { sisa } : {}),
  });
});
