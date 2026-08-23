// hard-delete-expired-guru — Item C dari docs/TIER-AND-LIFECYCLE.md.
//
// Fungsi ini SENGAJA TIPIS. Seluruh penghapusan dikerjakan fn_hard_delete_guru
// di dalam database, dalam SATU transaksi per guru. Alasannya ada di
// TIER-AND-LIFECYCLE.md §9: supabase-js mengirim setiap DELETE sebagai
// permintaan HTTP tersendiri, jadi merangkai STEP 1-6 di sini berarti tidak ada
// transaksi sama sekali — kegagalan di langkah belakang meninggalkan guru
// terhapus separuh. Yang tersisa untuk lapisan ini hanyalah tiga hal:
// menyusun daftar, memanggil satu per satu, dan membuat hasilnya terlihat.
//
// Keterlihatan itu bukan hiasan. §7 memilih Scheduled Edge Function alih-alih
// pg_cron justru karena log Functions tampil di dashboard sementara kegagalan
// pg_cron tenggelam di cron.job_run_details. Sesi 23 Agustus 2026 membuktikan
// kekhawatiran itu nyata: job notifikasi melaporkan "succeeded" berhari-hari
// sementara setiap panggilannya sebenarnya 401.
//
// SATU GURU GAGAL TIDAK MEMBLOKIR SISANYA. Setiap panggilan RPC berdiri
// sendiri; guru yang gagal dicatat di detail_gagal dan diproses lagi besok.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS = {
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

// Baca klaim `role` dari JWT tanpa memverifikasi tanda tangannya. Aman HANYA
// karena fungsi ini berjalan dengan verify_jwt = true: gerbang platform sudah
// memvalidasi tanda tangannya sebelum permintaan sampai ke sini.
//
// >>> KALAU verify_jwt DIMATIKAN, PEMERIKSAAN INI MENJADI DAPAT DIPALSUKAN.
// >>> Untuk fungsi yang menghapus akun secara permanen, itu tidak boleh terjadi.
function klaimRole(token: string): string | null {
  try {
    const bagian = token.split('.');
    if (bagian.length !== 3) return null;
    const b64 = bagian[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64.padEnd(Math.ceil(b64.length / 4) * 4, '=');
    const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
    const payload = JSON.parse(new TextDecoder().decode(bytes));
    return typeof payload?.role === 'string' ? payload.role : null;
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) {
    return json({ error: 'SUPABASE_URL atau SUPABASE_SERVICE_ROLE_KEY tidak tersedia' }, 500);
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Dua pemanggil yang sah: penjadwal (service role) dan Romo secara manual
  // (JWT yang emailnya cocok ADMIN_EMAIL). Fungsi ini menghapus akun secara
  // permanen; ia tidak boleh dapat dipicu oleh guru mana pun.
  const header = req.headers.get('Authorization') ?? '';
  if (!header.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);
  const token = header.slice(7);

  let sah = token === serviceKey || klaimRole(token) === 'service_role';
  if (!sah) {
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data.user) return json({ error: 'Unauthorized' }, 401);
    const adminEmail = Deno.env.get('ADMIN_EMAIL') ?? '';
    if (!adminEmail || data.user.email !== adminEmail) return json({ error: 'Forbidden' }, 403);
    sah = true;
  }

  // ---------------------------------------------------------------------------
  // Sakelar pengaman.
  //
  // Penghapusan hanya berjalan kalau HARD_DELETE_ARMED bernilai persis 'true'.
  // Selain itu — env belum diset, salah ketik, apa pun — fungsi ini berjalan
  // dalam mode laporan: ia menghitung dan melaporkan siapa yang AKAN dihapus,
  // tanpa menghapus apa pun.
  //
  // Default yang aman itu disengaja. Ke-25 guru TRIAL di proyek ini habis masa
  // berlakunya serentak, sehingga eksekusi nyata pertama akan menghapus puluhan
  // akun sekaligus. Daftarnya harus dibaca manusia lebih dulu.
  //
  // Body permintaan dapat memaksa dry-run ({"dry_run": true}) tetapi TIDAK
  // dapat memaksa penghapusan: arahnya sengaja satu arah, hanya menuju yang
  // lebih aman.
  // ---------------------------------------------------------------------------
  const armed = Deno.env.get('HARD_DELETE_ARMED') === 'true';

  let mintaDryRun = false;
  try {
    const body = await req.json();
    mintaDryRun = body?.dry_run === true;
  } catch {
    // Body kosong itu wajar — penjadwal mengirim {} atau tidak sama sekali.
  }

  const dryRun = !armed || mintaDryRun;

  const { data: kandidat, error: listError } = await admin.rpc('fn_list_guru_hard_delete');
  if (listError) {
    console.error('[hard-delete] gagal menyusun daftar kandidat:', listError.message);
    return json({ error: listError.message, tahap: 'list' }, 500);
  }

  const daftar = kandidat ?? [];
  console.log(
    `[hard-delete] mode=${dryRun ? 'DRY-RUN' : 'HAPUS'} armed=${armed} kandidat=${daftar.length}`,
  );

  const hasil: unknown[] = [];
  const detail_gagal: unknown[] = [];

  for (const guru of daftar) {
    const { data, error } = await admin.rpc('fn_hard_delete_guru', {
      p_teacher_id: guru.teacher_id,
      p_dry_run: dryRun,
    });

    if (error) {
      // Kegagalan satu guru tidak menghentikan sisanya. Transaksi guru itu sudah
      // dibatalkan seluruhnya oleh database, jadi datanya tetap utuh dan ia akan
      // masuk daftar lagi besok.
      console.error(
        `[hard-delete] GAGAL ${guru.teacher_id} (${guru.email}): ${error.message}`,
      );
      detail_gagal.push({
        teacher_id: guru.teacher_id,
        email: guru.email,
        pesan: error.message,
      });
      continue;
    }

    console.log(
      `[hard-delete] ${dryRun ? 'akan dihapus' : 'TERHAPUS'} ${guru.teacher_id} (${guru.email}) ` +
        `H+${guru.hari_lewat}`,
    );
    hasil.push(data);
  }

  const ringkas = {
    success: true,
    dry_run: dryRun,
    armed,
    kandidat: daftar.length,
    diproses: hasil.length,
    gagal: detail_gagal.length,
    hasil,
    detail_gagal,
  };

  console.log('[hard-delete] selesai:', JSON.stringify({ ...ringkas, hasil: undefined }));
  return json(ringkas);
});
