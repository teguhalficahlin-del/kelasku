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

// Akun yang baru dibuat belum tentu yatim. generate-akun membuat akun auth lebih
// dulu, baru menyisipkan barisnya ke classroom_members beberapa ratus milidetik
// kemudian (generate-akun/index.ts:175). Tanpa ambang usia ini, akun sehat yang
// sedang dibuat muncul di daftar yatim -- dan sekali admin menekan "Bersihkan",
// akun yang benar-benar baik ikut terhapus. Satu jam jauh lebih lama daripada
// jendela itu, dan jauh lebih pendek daripada rentang yang membuat yatim
// sungguhan terlewat.
const ORPHAN_MIN_AGE_MS = 60 * 60 * 1000;

function cukupTua(createdAt: string | null): boolean {
  if (!createdAt) return false;
  const ms = new Date(createdAt).getTime();
  return Number.isFinite(ms) && (Date.now() - ms) > ORPHAN_MIN_AGE_MS;
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

  // -- list_orphans ---------------------------------------------------------
  // Akun yatim = profil SISWA/ORTU yang tidak punya satu pun baris di
  // classroom_members. Bentuk itu lahir ketika hapus-akun gagal di langkah 10:
  // classroom_members sudah dihapus (langkah 9) tetapi deleteUser belum berhasil,
  // sehingga akunnya hidup tanpa keterkaitan kelas apa pun.
  //
  // Yang membuatnya harus dibersihkan bukan sekadar kerapian: baris
  // classroom_roster miliknya masih memegang profile_id, dan fn_activate_roster
  // mensyaratkan profile_id IS NULL. Selama yatimnya dibiarkan, slot siswa itu
  // tidak akan pernah bisa dibuatkan akun lagi.
  //
  // delete_guru pun tidak menjangkau mereka: ia mengenumerasi korbannya lewat
  // classroom_members, tepat tabel yang sudah kehilangan barisnya. Jadi tanpa
  // jalur ini, akun yatim bertahan bahkan setelah gurunya dihapus.
  if (action === 'list_orphans') {
    // Dua query lalu diselisihkan di sini, bukan satu query dengan embedding.
    // classroom_members punya DUA foreign key ke profiles (profile_id dan
    // linked_student_id), jadi PostgREST tidak bisa menebak relasi mana yang
    // dimaksud tanpa disebut nama constraint-nya -- bentuk yang patah diam-diam
    // kalau constraint itu suatu saat diganti nama.
    const { data: kandidat, error: kandidatErr } = await admin
      .from('profiles')
      .select('id, user_id, full_name, role, created_at')
      .in('role', ['SISWA', 'ORTU'])
      .order('created_at', { ascending: false });

    if (kandidatErr) return json({ error: kandidatErr.message }, 500);

    const { data: anggota, error: anggotaErr } = await admin
      .from('classroom_members')
      .select('profile_id');

    if (anggotaErr) return json({ error: anggotaErr.message }, 500);

    const punyaKelas = new Set((anggota ?? []).map((m) => m.profile_id));

    const result = (kandidat ?? [])
      .filter((p) => !punyaKelas.has(p.id) && cukupTua(p.created_at))
      .map((p) => ({
        id:         p.id,
        user_id:    p.user_id,
        full_name:  p.full_name,
        role:       p.role,
        created_at: p.created_at,
      }));

    return json({ data: result });
  }

  // -- delete_orphan --------------------------------------------------------
  if (action === 'delete_orphan') {
    const orphan_profile_id = body.orphan_profile_id as string;
    if (!orphan_profile_id) return json({ error: 'orphan_profile_id wajib' }, 400);

    // 1. Profil harus ada dan berperan SISWA atau ORTU. Guru tidak boleh lewat
    //    jalur ini: penghapusan guru punya pagar konfirmasinya sendiri, dan
    //    jalur ini sengaja dibuat ringan karena sasarannya akun tanpa data.
    const { data: profil, error: profilErr } = await admin
      .from('profiles')
      .select('id, user_id, full_name, role, created_at')
      .eq('id', orphan_profile_id)
      .in('role', ['SISWA', 'ORTU'])
      .single();

    if (profilErr || !profil) return json({ error: 'Profil siswa/ortu tidak ditemukan' }, 404);

    // 2. Status yatimnya diperiksa ULANG di server, bukan dipercaya dari daftar
    //    yang dikirim klien. Daftar itu bisa sudah basi -- profil yang tadi
    //    yatim mungkin sudah dipulihkan sebelum admin sempat menekan tombolnya.
    const { count, error: cekErr } = await admin
      .from('classroom_members')
      .select('*', { count: 'exact', head: true })
      .eq('profile_id', orphan_profile_id);

    if (cekErr) return json({ error: cekErr.message }, 500);

    if ((count ?? 0) > 0) {
      return json({
        error: 'Profil ini masih terdaftar di classroom, jadi bukan akun yatim. Muat ulang daftarnya.',
      }, 409);
    }

    if (!cukupTua(profil.created_at)) {
      return json({
        error: 'Profil ini baru dibuat. Akun yang sedang dibuat sesaat tampak yatim -- tunggu sebentar lalu muat ulang.',
      }, 409);
    }

    // 3. Bebaskan slot roster LEBIH DULU. FK classroom_roster.profile_id memang
    //    ON DELETE SET NULL, jadi ini akan terjadi sendiri saat akunnya hilang --
    //    tetapi melakukannya di sini membuat langkah ini idempoten: kalau
    //    penghapusan di bawah gagal, mengulang aksi yang sama tetap benar dan
    //    slotnya sudah terlanjur bebas, bukan terkunci lebih lama.
    const { data: slots, error: slotErr } = await admin
      .from('classroom_roster')
      .update({ profile_id: null })
      .eq('profile_id', orphan_profile_id)
      .select('id');

    if (slotErr) return json({ error: slotErr.message }, 500);

    // 4-5. Hapus akun auth. profiles ikut lewat ON DELETE CASCADE dari auth.users.
    const { error: delErr } = await admin.rpc('delete_auth_user', { uid: profil.user_id });
    if (delErr) return json({ error: delErr.message, step: 'delete_auth_user' }, 500);

    return json({ success: true, cleaned_slots: slots?.length ?? 0 });
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
