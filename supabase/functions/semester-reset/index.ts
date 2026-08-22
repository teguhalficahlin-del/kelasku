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

// ---------------------------------------------------------------------------
// Jendela waktu reset semester
// ---------------------------------------------------------------------------
// Disalin dari SEMESTER_PHASES di guru/js/guru.js, tapi hanya separuhnya: fase
// 'aktif' sengaja tidak dicantumkan, karena apa pun yang tidak cocok dengan
// daftar ini otomatis ditolak.
//
// Duplikasi ini memang tidak ideal — Edge Function tidak bisa mengimpor berkas
// portal guru. Kalau tanggalnya berubah, KEDUA tempat harus diperbarui.
//
// Alasan validasi ini ada di server: klien menghitung fase dari new Date() di
// perangkat guru. Guru yang memundurkan jam perangkatnya bisa memunculkan
// tombol reset kapan saja — atau, lebih mudah lagi, memanggil endpoint ini
// langsung dengan curl tanpa menyentuh UI sama sekali. fn_semester_reset
// menjaga SIAPA yang boleh mereset (tier GURU_GO); bagian ini menjaga KAPAN.
const JENDELA_RESET = [
  { sem: 2, fase: 'persiapan', mulai: '06-15', selesai: '06-29' },
  { sem: 2, fase: 'terkunci',  mulai: '06-30', selesai: '06-30' },
  { sem: 1, fase: 'persiapan', mulai: '12-15', selesai: '12-30' },
  { sem: 1, fase: 'terkunci',  mulai: '12-31', selesai: '12-31' },
];

// Deno selalu menjalankan new Date() dalam UTC. WIB adalah UTC+7 tetap dan
// tidak mengenal DST, jadi menggeser epoch tujuh jam lalu membaca komponen
// UTC-nya memberi tanggal kalender Indonesia yang tepat — tanpa bergantung
// pada basis data timezone runtime.
function tanggalWib(sekarang: Date = new Date()): string {
  const wib   = new Date(sekarang.getTime() + 7 * 60 * 60 * 1000);
  const bulan = String(wib.getUTCMonth() + 1).padStart(2, '0');
  const hari  = String(wib.getUTCDate()).padStart(2, '0');
  return `${bulan}-${hari}`;
}

// Perbandingan string 'MM-DD' sah di sini karena tidak ada satu pun jendela
// yang melintasi pergantian tahun — yang terakhir berhenti tepat di 12-31.
function faseReset(mmdd: string) {
  return JENDELA_RESET.find((j) => mmdd >= j.mulai && mmdd <= j.selesai) ?? null;
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
  // 3. Validasi fase semester menurut tanggal SERVER
  // -------------------------------------------------------------------------
  // Ditempatkan sesudah verifikasi JWT, bukan sebelumnya: penelepon tanpa token
  // yang sah tetap menerima 401 dan tidak perlu tahu apa pun tentang jendela
  // waktu ini.
  const mmdd = tanggalWib();
  const fase = faseReset(mmdd);

  if (!fase) {
    return json({
      error: 'Reset semester hanya dapat dilakukan pada fase persiapan atau akhir semester',
    }, 403);
  }

  // -------------------------------------------------------------------------
  // 4. Hapus seluruh data semester dalam SATU transaksi database
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

  // -------------------------------------------------------------------------
  // 5. Cabut seluruh sesi guru — semua tab, semua perangkat
  // -------------------------------------------------------------------------
  // Dijalankan SETELAH reset berhasil, bukan sebelumnya: kalau resetnya gagal,
  // guru tidak boleh terlempar keluar tanpa apa pun terjadi. Fungsi ini
  // memakai service role, jadi kemampuannya menjalankan RPC tidak bergantung
  // pada sesi guru yang baru saja dicabut.
  //
  // Alasannya: setelah seluruh data kelas terhapus, tab lain yang masih
  // terbuka memegang state semester lama — daftar siswa, jadwal, absensi yang
  // sudah tidak ada — dan tetap bisa menulis ke atasnya.
  //
  // scope 'global' mencabut seluruh sesi user ini, bukan hanya yang sedang
  // dipakai. Hanya sesi GURU: akun siswa dan ortu tidak dihapus oleh reset,
  // dan memaksa mereka login ulang tidak melindungi apa pun.
  try {
    await admin.auth.admin.signOut(jwt, 'global');
  } catch (err) {
    // Datanya sudah terhapus dan tidak bisa dikembalikan. Kegagalan mencabut
    // sesi tidak boleh berubah menjadi pesan gagal yang membuat guru mengira
    // resetnya batal, lalu menekannya sekali lagi.
    console.error('force logout gagal', err);
  }

  return json({ success: true, hasil });
});
