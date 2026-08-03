import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    // Body dibaca satu kali di sini — stream tidak bisa dibaca dua kali
    const { nis, nama, nama_ortu, classroom_code, classroom_id } = await req.json();

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

    // Ambil profil caller — role harus GURU
    const { data: callerProfile } = await admin
      .from('profiles')
      .select('id, role')
      .eq('user_id', user.id)
      .single();

    if (!callerProfile || callerProfile.role !== 'GURU') {
      return Response.json(
        { success: false, error: 'Forbidden' },
        { status: 403, headers: CORS_HEADERS },
      );
    }

    // Verifikasi caller adalah pemilik classroom yang dikirim di body
    const { data: ownedClassroom } = await admin
      .from('classrooms')
      .select('id')
      .eq('id', classroom_id)
      .eq('teacher_id', callerProfile.id)
      .single();

    if (!ownedClassroom) {
      return Response.json(
        { success: false, error: 'Forbidden: bukan owner classroom ini' },
        { status: 403, headers: CORS_HEADERS },
      );
    }

    // -------------------------------------------------------------------------
    // Generate akun siswa
    // -------------------------------------------------------------------------

    const siswaEmail = `${nis}.${classroomCode}@sipmandiri.local`;
    const ortuEmail  = `ortu.${nis}.${classroomCode}@sipmandiri.local`;
    const password   = nis;

    const { data: siswaAuth, error: siswaErr } = await admin.auth.admin.createUser({
      email:         siswaEmail,
      password,
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
      const { data: sp } = await admin
        .from('profiles')
        .insert({ user_id: siswaAuth.user.id, full_name: nama, role: 'SISWA', email: siswaEmail, nis })
        .select('id')
        .single();
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

    // Aktifkan roster
    if (siswaProfileId) {
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
    }

    // Update nama_ortu di roster jika dikirim
    if (nama_ortu) {
      await admin
        .from('classroom_roster')
        .update({ nama_ortu })
        .eq('classroom_id', classroom_id)
        .eq('nis', nis);
    }

    // -------------------------------------------------------------------------
    // Generate akun ortu (jika nama_ortu ada)
    // -------------------------------------------------------------------------

    let ortuEmailResult: string | null = null;
    if (nama_ortu) {
      const { data: ortuAuth, error: ortuErr } = await admin.auth.admin.createUser({
        email:         ortuEmail,
        password,
        email_confirm: true,
        user_metadata: { nama: nama_ortu, role: 'ORTU', classroom_id },
      });

      const ortuAlreadyExists = ortuErr?.message === 'A user with this email address has already been registered';

      if (!ortuErr || ortuAlreadyExists) {
        ortuEmailResult = ortuEmail;

        let ortuProfileId: string | null = null;
        if (ortuAuth?.user) {
          const { data: op } = await admin
            .from('profiles')
            .insert({
              user_id:   ortuAuth.user.id,
              full_name: `Ortu - ${nama}`,
              role:      'ORTU',
              email:     ortuEmail,
            })
            .select('id')
            .single();
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
      { success: true, siswa_email: siswaEmail, ortu_email: ortuEmailResult, password },
      { headers: CORS_HEADERS },
    );
  } catch (err) {
    return Response.json(
      { success: false, error: String(err) },
      { status: 500, headers: CORS_HEADERS },
    );
  }
});
