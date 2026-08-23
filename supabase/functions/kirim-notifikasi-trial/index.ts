// kirim-notifikasi-trial
//
// Mengirim email pemberitahuan masa berlaku kepada guru yang sudah kedaluwarsa,
// pada tiga tonggak: H+0, H+3, dan H+7. Lihat docs/TIER-AND-LIFECYCLE.md §5.
//
// H+8 BUKAN urusan fungsi ini — itu hard delete (Item C), pekerjaan terpisah.
//
// Dijalankan terjadwal sekali sehari. Aman dijalankan ulang: setiap tonggak
// yang sudah terkirim tercatat di notifikasi_log dengan kunci unik
// (profile_id, hari_notifikasi), dan baris yang sudah ada membuat guru itu
// dilewati.

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

const HARI_MS = 24 * 60 * 60 * 1000;
const TONGGAK: readonly number[] = [0, 3, 7];

interface GuruRow {
  id: string;
  full_name: string;
  email: string | null;
  tier: string;
  expires_at: string;
}

interface Templat {
  subject: string;
  html: string;
}

interface Gagal {
  profile_id: string;
  hari: number;
  tahap: 'brevo' | 'catat';
  pesan: string;
}

// ---------------------------------------------------------------------------
// Templat email
// ---------------------------------------------------------------------------

function bungkus(judul: string, isi: string): string {
  return [
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#222;line-height:1.6">',
    `<h2 style="font-size:18px;margin:0 0 16px">${judul}</h2>`,
    isi,
    '<p style="margin-top:24px">Hormat kami,<br>MIClass Support</p>',
    '<p style="font-size:12px;color:#777;margin-top:24px">',
    'Email ini dikirim otomatis. Untuk perpanjangan atau peningkatan paket, ',
    'silakan balas email ini.',
    '</p>',
    '</div>',
  ].join('');
}

function templat(hari: number, nama: string): Templat {
  const sapaan = `<p>Yth. Bapak/Ibu ${nama},</p>`;

  if (hari === 0) {
    return {
      subject: 'Masa berlaku akun MIClass Anda telah berakhir',
      html: bungkus('Masa berlaku akun Anda telah berakhir', [
        sapaan,
        '<p>Kami memberitahukan bahwa masa berlaku akun MIClass Anda telah ',
        'berakhir hari ini.</p>',
        '<p>Seluruh data Anda <strong>masih tersimpan dan masih dapat dibuka</strong> ',
        'selama 7 hari ke depan. Selama masa tersebut Anda dapat melihat dan ',
        'mengunduh data kelas, namun belum dapat menambah atau mengubah data.</p>',
        '<p>Untuk mengaktifkan kembali seluruh fungsi akun, silakan lakukan ',
        'perpanjangan dengan membalas email ini.</p>',
      ].join('')),
    };
  }

  if (hari === 3) {
    return {
      subject: 'Pengingat: 4 hari tersisa untuk mengakses data MIClass Anda',
      html: bungkus('Empat hari tersisa', [
        sapaan,
        '<p>Masa berlaku akun MIClass Anda telah berakhir tiga hari yang lalu. ',
        'Data Anda masih dapat dibuka, namun <strong>tersisa 4 hari lagi</strong>.</p>',
        '<p>Apabila akun tidak diperpanjang, seluruh data kelas — daftar siswa, ',
        'jadwal, absensi, penilaian, dan catatan — akan dihapus secara permanen ',
        'dan tidak dapat dipulihkan.</p>',
        '<p>Kami menyarankan Anda melakukan perpanjangan atau mengunduh data ',
        'penting sebelum tenggat tersebut.</p>',
      ].join('')),
    };
  }

  return {
    subject: 'PENTING: Data MIClass Anda akan dihapus besok',
    html: bungkus('Data Anda akan dihapus besok', [
      sapaan,
      '<p><strong>Ini adalah pemberitahuan terakhir.</strong></p>',
      '<p>Seluruh data kelas pada akun MIClass Anda akan <strong>dihapus secara ',
      'permanen besok</strong>, termasuk daftar siswa, jadwal, absensi, penilaian, ',
      'catatan, dan akun siswa serta orang tua yang terhubung.</p>',
      '<p>Data yang telah dihapus <strong>tidak dapat dipulihkan dengan cara apa pun</strong>.</p>',
      '<p>Apabila Anda ingin melanjutkan penggunaan MIClass, mohon balas email ini ',
      'hari ini juga.</p>',
    ].join('')),
  };
}

// ---------------------------------------------------------------------------
// Brevo
// ---------------------------------------------------------------------------

async function kirimBrevo(
  apiKey: string,
  pengirim: { name: string; email: string },
  tujuan: { name: string; email: string },
  isi: Templat,
): Promise<{ ok: true } | { ok: false; pesan: string }> {
  let res: Response;
  try {
    res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        sender: pengirim,
        to: [tujuan],
        subject: isi.subject,
        htmlContent: isi.html,
      }),
    });
  } catch (e) {
    return { ok: false, pesan: `jaringan: ${e instanceof Error ? e.message : String(e)}` };
  }

  if (res.ok) return { ok: true };

  const teks = await res.text().catch(() => '');
  return { ok: false, pesan: `HTTP ${res.status}: ${teks.slice(0, 300)}` };
}

// ---------------------------------------------------------------------------
// Otorisasi
// ---------------------------------------------------------------------------

// Baca klaim `role` dari sebuah JWT tanpa memverifikasi tanda tangannya.
//
// TIDAK MEMVERIFIKASI TANDA TANGAN adalah pernyataan yang disengaja, dan aman
// HANYA karena fungsi ini berjalan dengan verify_jwt = true: gerbang platform
// sudah memvalidasi tanda tangan terhadap kunci penanda tangan proyek sebelum
// permintaan sampai ke sini. Yang tersisa untuk dibaca tinggal isinya.
//
// >>> KALAU verify_jwt SUATU SAAT DIMATIKAN UNTUK FUNGSI INI, PEMERIKSAAN DI
// >>> BAWAH LANGSUNG MENJADI DAPAT DIPALSUKAN: siapa pun bisa menyusun JWT
// >>> tanpa tanda tangan yang berisi role 'service_role' dan memicu pengiriman
// >>> email atas nama produk. Mematikan verify_jwt di sini berarti pemeriksaan
// >>> ini harus diganti verifikasi tanda tangan sungguhan lebih dulu.
//
// Dekode memakai TextDecoder, bukan JSON.parse(atob(...)) langsung: atob
// mengembalikan binary string, dan klaim yang memuat karakter non-ASCII akan
// rusak sebelum sempat dibaca.
function klaimRole(token: string): string | null {
  try {
    const bagian = token.split('.');
    if (bagian.length !== 3) return null;

    const b64 = bagian[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64.padEnd(Math.ceil(b64.length / 4) * 4, '=');
    const biner = atob(padded);
    const bytes = Uint8Array.from(biner, (c) => c.charCodeAt(0));
    const payload = JSON.parse(new TextDecoder().decode(bytes));

    return typeof payload?.role === 'string' ? payload.role : null;
  } catch {
    return null;
  }
}

// Dua pemanggil yang sah: penjadwal (membawa service role key) dan Romo secara
// manual (JWT yang emailnya cocok dengan ADMIN_EMAIL). Selain itu ditolak —
// fungsi ini mengirim email atas nama produk, jadi ia tidak boleh dapat dipicu
// oleh guru mana pun.
async function otorisasi(
  req: Request,
  admin: SupabaseClient,
  serviceKey: string,
): Promise<{ ok: true } | { ok: false; status: number; pesan: string }> {
  const header = req.headers.get('Authorization') ?? '';
  if (!header.startsWith('Bearer ')) {
    return { ok: false, status: 401, pesan: 'Unauthorized' };
  }

  const token = header.slice(7);

  // Jalur cepat: kunci yang persis sama dengan yang dipegang fungsi ini.
  if (token === serviceKey) return { ok: true };

  // Jalur penjadwal. Perbandingan string di atas tidak cukup karena kedua sisi
  // memakai format kunci yang berbeda: cron mengirim service_role key format
  // JWT legacy (dari vault), sedangkan Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  // pada proyek ini berisi kunci format baru. Keduanya sah dan setara
  // wewenangnya, tetapi tidak akan pernah cocok sebagai teks.
  //
  // Yang dibandingkan karena itu wewenangnya, bukan teksnya. Kunci anon —
  // yang publik dan tertanam di setiap browser — tetap ditolak di sini karena
  // klaim role-nya 'anon', bukan 'service_role'.
  if (klaimRole(token) === 'service_role') return { ok: true };

  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return { ok: false, status: 401, pesan: 'Unauthorized' };

  const adminEmail = Deno.env.get('ADMIN_EMAIL') ?? '';
  if (!adminEmail || data.user.email !== adminEmail) {
    return { ok: false, status: 403, pesan: 'Forbidden' };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const brevoKey = Deno.env.get('BREVO_API_KEY');

  // Alamat pengirim harus alamat yang sudah diverifikasi di Brevo. Ia dibaca
  // dari environment, tidak ditanam di kode, supaya dapat diganti tanpa
  // menyentuh fungsi ini. ADMIN_EMAIL dipakai sebagai cadangan karena alamat
  // itu memang milik pengelola produk.
  const senderEmail = Deno.env.get('BREVO_SENDER_EMAIL') ?? Deno.env.get('ADMIN_EMAIL');

  if (!url || !serviceKey) {
    return json({ error: 'SUPABASE_URL atau SUPABASE_SERVICE_ROLE_KEY tidak tersedia' }, 500);
  }
  if (!brevoKey) {
    return json({ error: 'BREVO_API_KEY tidak tersedia' }, 500);
  }
  if (!senderEmail) {
    return json({
      error: 'Alamat pengirim tidak tersedia — set BREVO_SENDER_EMAIL (atau ADMIN_EMAIL)',
    }, 500);
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const izin = await otorisasi(req, admin, serviceKey);
  if (!izin.ok) return json({ error: izin.pesan }, izin.status);

  // -------------------------------------------------------------------------
  // 1. Ambil guru yang sudah lewat masa berlaku, maksimal 8 hari ke belakang
  // -------------------------------------------------------------------------

  const sekarang = Date.now();
  const batasBawah = new Date(sekarang - 8 * HARI_MS).toISOString();
  const batasAtas = new Date(sekarang).toISOString();

  const { data: guruList, error: queryError } = await admin
    .from('profiles')
    .select('id, full_name, email, tier, expires_at')
    .eq('role', 'GURU')
    .not('expires_at', 'is', null)
    .lte('expires_at', batasAtas)
    .gt('expires_at', batasBawah)
    .returns<GuruRow[]>();

  // Kegagalan membaca database bukan kegagalan satu email — ia berarti kita
  // tidak tahu apa-apa. Kembalikan galat agar penjadwal mencoba lagi.
  if (queryError) {
    return json({ error: `Gagal membaca profiles: ${queryError.message}` }, 500);
  }

  const kandidat = guruList ?? [];

  // -------------------------------------------------------------------------
  // 2. Kirim satu per satu
  // -------------------------------------------------------------------------

  let dikirim = 0;
  let dilewati = 0;
  const gagal: Gagal[] = [];

  for (const guru of kandidat) {
    // Tonggak dihitung dari selisih waktu penuh, bukan tanggal kalender:
    // H+0 berarti dalam 24 jam pertama setelah kedaluwarsa, H+3 pada rentang
    // 72–96 jam, dan seterusnya. Cara ini tidak bergantung pada zona waktu
    // server, yang penting karena guru tersebar di beberapa zona waktu.
    const hari = Math.floor((sekarang - new Date(guru.expires_at).getTime()) / HARI_MS);
    if (!TONGGAK.includes(hari)) {
      dilewati++;
      continue;
    }

    // Guru tanpa email dilewati, bukan menggagalkan proses. Tidak ada tujuan
    // pengiriman berarti tidak ada yang bisa dikerjakan untuknya.
    if (!guru.email) {
      dilewati++;
      console.warn(`Guru ${guru.id} tidak punya email — dilewati`);
      continue;
    }

    const { data: sudah, error: cekError } = await admin
      .from('notifikasi_log')
      .select('id')
      .eq('profile_id', guru.id)
      .eq('hari_notifikasi', hari)
      .maybeSingle();

    if (cekError) {
      gagal.push({ profile_id: guru.id, hari, tahap: 'catat', pesan: cekError.message });
      continue;
    }
    if (sudah) {
      dilewati++;
      continue;
    }

    const hasil = await kirimBrevo(
      brevoKey,
      { name: 'MIClass Support', email: senderEmail },
      { name: guru.full_name, email: guru.email },
      templat(hari, guru.full_name),
    );

    // Kegagalan satu email tidak boleh menghentikan yang lain. Ia dicatat,
    // lalu proses lanjut ke guru berikutnya.
    if (!hasil.ok) {
      gagal.push({ profile_id: guru.id, hari, tahap: 'brevo', pesan: hasil.pesan });
      console.error(`Brevo gagal untuk ${guru.id} (H+${hari}): ${hasil.pesan}`);
      continue;
    }

    // Catatan ditulis HANYA setelah Brevo menjawab 2xx. Urutan ini disengaja:
    // kalau catatan ditulis lebih dulu lalu pengiriman gagal, guru itu tidak
    // akan pernah menerima emailnya pada percobaan berikutnya — kesalahan yang
    // jauh lebih merugikan daripada kemungkinan email terkirim dua kali.
    const { error: catatError } = await admin
      .from('notifikasi_log')
      .insert({ profile_id: guru.id, hari_notifikasi: hari });

    if (catatError) {
      // Email sudah terlanjur terkirim. Ini dilaporkan keras karena
      // menjalankan ulang tanpa catatan akan mengirimnya sekali lagi.
      gagal.push({ profile_id: guru.id, hari, tahap: 'catat', pesan: catatError.message });
      console.error(
        `Email H+${hari} SUDAH TERKIRIM ke ${guru.id} tetapi gagal dicatat: ${catatError.message}`,
      );
      continue;
    }

    dikirim++;
  }

  return json({
    success: true,
    diperiksa: kandidat.length,
    dikirim,
    dilewati,
    gagal: gagal.length,
    detail_gagal: gagal,
  });
});
