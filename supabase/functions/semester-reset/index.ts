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
  // 3. Hapus seluruh data semester dalam SATU transaksi database
  // -------------------------------------------------------------------------
  // Sebelumnya bagian ini adalah rangkaian DELETE terpisah — satu request per
  // tabel per classroom, masing-masing transaksi sendiri. Gagal di tengah
  // berarti sebagian data sudah lenyap dan sisanya utuh, tanpa jalan pulih.
  //
  // Itu bukan risiko teoretis: dua nama tabel di daftar lama (assessment_items,
  // student_grades) sudah tidak ada sejak migrasi 20260815000001, sehingga
  // SETIAP reset berhenti tepat setelah attendance, student_notes, dan
  // schedules terhapus. Guru melihat pesan gagal dan mengira tidak terjadi
  // apa-apa.
  //
  // fn_semester_reset menjalankan seluruh penghapusan beserta pencatatan
  // last_reset_at di dalam satu transaksi: kegagalan apa pun membatalkan
  // semuanya. Daftar tabel dan urutannya kini tinggal di satu tempat — di
  // migrasi, dekat dengan skema yang menentukan urutan itu.
  const { data: hasil, error: resetError } = await admin
    .rpc('fn_semester_reset', { p_teacher_id: profile.id });

  if (resetError) {
    return json({
      error: 'Reset semester gagal, tidak ada data yang terhapus: ' + resetError.message,
    }, 500);
  }

  return json({ success: true, hasil });
});
