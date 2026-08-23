// cron-health-check — SEC-044
//
// Memverifikasi bahwa dua cron job kritis masih hidup dan panggilannya benar-
// benar dijawab:
//
//   kirim-notifikasi-trial-harian    (0 0 * * *)
//   hard-delete-expired-guru-harian  (0 2 * * *)
//
// Seluruh pembacaan dilakukan oleh public.fn_cron_health_check() — skema cron
// dan net tidak diekspos PostgREST, jadi fungsi ini tidak bisa membacanya
// sendiri. Alasan lengkap ada di migrasi 20260823000021.
//
// verify_jwt = false, karena yang memanggil adalah alat monitoring atau Romo
// dari peramban, bukan guru yang login. Sebagai gantinya endpoint dijaga
// header X-Health-Key yang harus sama persis dengan secret HEALTH_CHECK_KEY.
//
// SEBERAPA KUAT KUNCI ITU MENJAGA. Satu kunci statis tanpa kedaluwarsa memang
// bukan otentikasi sungguhan: siapa pun yang memegangnya bisa memakainya
// selamanya, dan ia ikut tersimpan di riwayat alat monitoring mana pun yang
// dipasangi. Yang membuatnya memadai di sini adalah nilai di baliknya — yang
// bisa dilihat pemegang kunci hanyalah nama job, jadwal, waktu jalan, dan
// status HTTP. Tidak ada data guru, siswa, atau ortu yang bisa keluar lewat
// sini (isi jawaban sukses sengaja tidak dikembalikan oleh RPC-nya). Kalau
// suatu saat endpoint ini diperluas sampai memuat data orang, kunci statis
// tidak lagi cukup dan harus diganti JWT.
//
// Kode status HTTP sengaja ikut mencerminkan hasil: 200 saat OK, 503 saat
// WARNING atau ERROR. Alat uptime paling sederhana pun hanya melihat kode
// status, jadi dengan begini ia bisa dipasang tanpa mengurai JSON sama sekali.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':
    Deno.env.get('ALLOWED_ORIGIN') ?? 'https://teguhalficahlin-del.github.io',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-health-key',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

// Perbandingan dengan waktu tetap. Perbandingan string biasa berhenti di
// karakter pertama yang berbeda, dan selisih waktunya — walau kecil — pada
// prinsipnya bisa dipakai menebak kunci karakter demi karakter.
function samaAman(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  let beda = 0;
  for (let i = 0; i < ea.length; i++) beda |= ea[i] ^ eb[i];
  return beda === 0;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  const kunciAsli = Deno.env.get('HEALTH_CHECK_KEY') ?? '';
  if (!kunciAsli) {
    // Tanpa kunci tersimpan, endpoint akan terbuka untuk siapa saja. Menolak
    // total lebih baik daripada diam-diam berjalan tanpa penjaga.
    return json(
      { error: 'HEALTH_CHECK_KEY belum diset pada Edge Function ini.' },
      500,
    );
  }

  const kunciKirim = req.headers.get('x-health-key') ?? '';
  if (!samaAman(kunciKirim, kunciAsli)) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  const { data, error } = await supabase.rpc('fn_cron_health_check');

  if (error) {
    return json(
      {
        checked_at: new Date().toISOString(),
        jobs: [],
        verdict: 'ERROR',
        error: error.message,
      },
      503,
    );
  }

  const verdict = (data as { verdict?: string } | null)?.verdict ?? 'ERROR';
  return json(data, verdict === 'OK' ? 200 : 503);
});
