import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'https://teguhalficahlin-del.github.io',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    // Body dibaca satu kali di sini — stream tidak bisa dibaca dua kali
    const { nis, nama, nama_ortu, classroom_code, classroom_id } = await req.json();
    const namaOrtuClean = (nama_ortu ?? '').trim();

    if (!nis || !nama || !classroom_code || !classroom_id) {
      return Response.json(
        { success: false, error: 'Field wajib: nis, nama, classroom_code, classroom_id' },
        { status: 400, headers: CORS_HEADERS },
      );
    }

    // Normalisasi ke uppercase — konsisten dengan konstruksi email di portal siswa/ortu
    const classroomCode = (classroom_code as string).toUpperCase();

    const supabaseUrl    = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin          = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // -------------------------------------------------------------------------
    // Validasi caller: harus authenticated guru, pemilik classroom_id ini
    // -------------------------------------------------------------------------

    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) {
      return Response.json(
        { success: false, error: 'Unauthorized' },
        { status: 401, headers: CORS_HEADERS },
      );
    }

    const jwt = authHeader.slice(7);
    const { data: { user }, error: authError } = await admin.auth.getUser(jwt);
    if (authError || !user) {
      return Response.json(
        { success: false, error: 'Unauthorized' },
        { status: 401, headers: CORS_HEADERS },
      );
    }

    // Verifikasi role GURU + ownership classroom dalam satu query atomic
    const { data: callerProfile, error: profileError } = await admin
      .from('profiles')
      .select('id, role, classrooms!classrooms_teacher_id_fkey!inner(id)')
      .eq('user_id', user.id)
      .eq('classrooms.id', classroom_id)
      .single();

    if (profileError || !callerProfile || callerProfile.role !== 'GURU') {
      // Gate-nya adalah join inner di atas: guru yang belum punya kelas, atau
      // yang bukan pemilik classroom_id ini, tidak menghasilkan baris sama
      // sekali. Yang kurang selama ini bukan proteksinya melainkan pesannya —
      // "Forbidden" tidak memberi tahu guru apa yang harus dilakukan. Query
      // tambahan ini hanya berjalan di jalur gagal, jadi tidak membebani jalur
      // normal.
      let pesan = 'Anda tidak berhak membuat akun untuk kelas ini.';
      const { data: profilDasar } = await admin
        .from('profiles')
        .select('id, role')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!profilDasar || profilDasar.role !== 'GURU') {
        pesan = 'Akun ini bukan akun guru.';
      } else {
        const { count } = await admin
          .from('classrooms')
          .select('*', { count: 'exact', head: true })
          .eq('teacher_id', profilDasar.id);
        pesan = (count ?? 0) === 0
          ? 'Buat kelas terlebih dahulu sebelum membuat akun siswa.'
          : 'Kelas ini bukan milik Anda.';
      }

      return Response.json(
        { success: false, error: pesan },
        { status: 403, headers: CORS_HEADERS },
      );
    }

    // -------------------------------------------------------------------------
    // Generate akun siswa
    // -------------------------------------------------------------------------

    const siswaEmail = `${nis}.${classroomCode}@sipmandiri.local`;
    const ortuEmail  = `ortu.${nis}.${classroomCode}@sipmandiri.local`;

    const { data: siswaAuth, error: siswaErr } = await admin.auth.admin.createUser({
      email:         siswaEmail,
      password:      nis,
      email_confirm: true,
      user_metadata: { nama, role: 'SISWA', classroom_id },
    });

    if (siswaErr && siswaErr.message !== 'A user with this email address has already been registered') {
      return Response.json(
        { success: false, error: 'Akun siswa gagal: ' + siswaErr.message },
        { headers: CORS_HEADERS },
      );
    }

    // Insert profil siswa (skip jika sudah ada)
    let siswaProfileId: string | null = null;
    if (siswaAuth?.user) {
      // Upsert, bukan insert: trigger on_auth_user_created sudah membuat baris
      // profil begitu auth.users terisi. INSERT biasa akan bentrok dengan unique
      // (user_id), dan sebelumnya errornya tidak ditangkap sehingga EF membalas
      // 500 tanpa penjelasan. Upsert sekaligus mengoreksi role/nama/nis pada
      // baris yang terlanjur dibuat trigger.
      const { data: sp, error: spErr } = await admin
        .from('profiles')
        .upsert(
          { user_id: siswaAuth.user.id, full_name: nama, role: 'SISWA', email: siswaEmail, nis },
          { onConflict: 'user_id' },
        )
        .select('id')
        .single();
      if (spErr) {
        return Response.json(
          { success: false, error: 'Profil siswa gagal disimpan: ' + spErr.message },
          { headers: CORS_HEADERS },
        );
      }
      siswaProfileId = sp?.id ?? null;
    } else {
      // Akun sudah ada — ambil profile_id dari profiles
      const { data: sp } = await admin
        .from('profiles')
        .select('id')
        .eq('email', siswaEmail)
        .single();
      siswaProfileId = sp?.id ?? null;
    }

    if (!siswaProfileId) {
      throw new Error(`Profil siswa tidak ditemukan setelah insert: ${nis}`);
    }

    // Aktifkan roster
    const { data: rosterRow } = await admin
      .from('classroom_roster')
      .select('id')
      .eq('classroom_id', classroom_id)
      .eq('nis', nis)
      .single();
    if (rosterRow) {
      await admin.rpc('fn_activate_roster', {
        p_roster_id:  rosterRow.id,
        p_profile_id: siswaProfileId,
      });
    }

    // Masukkan siswa ke classroom_members agar fn_is_classroom_member() return TRUE
    // Tanpa ini RLS forum/jadwal/catatan menolak akses siswa
    await admin.from('classroom_members').upsert({
      classroom_id,
      teacher_id:  callerProfile.id,
      profile_id:  siswaProfileId,
      member_role: 'SISWA',
    }, { onConflict: 'classroom_id,profile_id', ignoreDuplicates: true });

    // Update nama_ortu di roster jika dikirim
    if (namaOrtuClean) {
      const { error: rosterErr } = await admin
        .from('classroom_roster')
        .update({ nama_ortu: namaOrtuClean })
        .eq('classroom_id', classroom_id)
        .eq('nis', nis);
      if (rosterErr) console.error('nama_ortu update gagal:', rosterErr.message);
    }

    // -------------------------------------------------------------------------
    // Generate akun ortu (jika nama_ortu ada)
    // -------------------------------------------------------------------------

    let ortuEmailResult: string | null = null;
    if (namaOrtuClean) {
      const { data: ortuAuth, error: ortuErr } = await admin.auth.admin.createUser({
        email:         ortuEmail,
        password:      nis,
        email_confirm: true,
        user_metadata: { nama: namaOrtuClean, role: 'ORTU', classroom_id },
      });

      const ortuAlreadyExists = ortuErr?.message === 'A user with this email address has already been registered';

      if (!ortuErr || ortuAlreadyExists) {
        ortuEmailResult = ortuEmail;

        let ortuProfileId: string | null = null;
        if (ortuAuth?.user) {
          // Upsert dengan alasan yang sama seperti profil siswa di atas.
          const { data: op, error: opErr } = await admin
            .from('profiles')
            .upsert(
              {
                user_id:   ortuAuth.user.id,
                full_name: `Ortu - ${nama}`,
                role:      'ORTU',
                email:     ortuEmail,
              },
              { onConflict: 'user_id' },
            )
            .select('id')
            .single();
          if (opErr) {
            return Response.json(
              { success: false, error: 'Profil ortu gagal disimpan: ' + opErr.message },
              { headers: CORS_HEADERS },
            );
          }
          ortuProfileId = op?.id ?? null;
        } else {
          const { data: op } = await admin
            .from('profiles')
            .select('id')
            .eq('email', ortuEmail)
            .single();
          ortuProfileId = op?.id ?? null;
        }

        if (ortuProfileId && siswaProfileId) {
          const { data: clRow } = await admin
            .from('classrooms')
            .select('teacher_id')
            .eq('id', classroom_id)
            .single();

          await admin.from('classroom_members').upsert({
            classroom_id,
            teacher_id:        clRow?.teacher_id ?? null,
            profile_id:        ortuProfileId,
            member_role:       'ORTU',
            linked_student_id: siswaProfileId,
          }, { onConflict: 'classroom_id,profile_id', ignoreDuplicates: true });
        }
      }
    }

    return Response.json(
      { success: true, siswa_email: siswaEmail, ortu_email: ortuEmailResult, nis },
      { headers: CORS_HEADERS },
    );
  } catch (err) {
    return Response.json(
      { success: false, error: String(err) },
      { status: 500, headers: CORS_HEADERS },
    );
  }
});
