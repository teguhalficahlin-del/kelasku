// Penyiapan data untuk test yang butuh keadaan tertentu di database.
//
// Dipakai test absensi: panel "Absensi Hari Ini" hanya berisi sesi bila kelas
// punya jadwal untuk hari ini, dan tombolnya hanya hidup selama sesi
// berlangsung (atau satu jam sesudahnya). Menggantungkan test pada jadwal
// sungguhan berarti ia hanya berjalan pada jam tertentu di hari tertentu —
// selebihnya melewatkan diri, dan regresi bisa lolos berhari-hari.
//
// Maka jadwalnya dibuat sendiri, dipakai, lalu dibuang.
//
// PENTING — ini menulis ke kelas SUNGGUHAN. Karena itu setiap baris yang dibuat
// diberi penanda di kolom note, dan penyiapan selalu menyapu sisa penanda itu
// lebih dulu: kalau satu run mati sebelum sempat membersihkan (job timeout,
// dibatalkan), sisanya tidak menumpuk dan tidak menjadi jadwal palsu permanen
// di layar guru.
//
// URL dan kunci di bawah adalah nilai publik yang memang sudah ada di dalam
// repo (shared/js/supabase.js) dan dikirim ke setiap browser pengunjung.
// Kredensial yang sesungguhnya tetap hanya lewat environment.

const SUPABASE_URL = 'https://teccdzetrdjowqemnuuc.supabase.co';
const SUPABASE_KEY = 'sb_publishable_7T4Y9_ty5cN6_NIZ4TalXA_ByYNtSwG';

export const PENANDA_JADWAL = 'PLAYWRIGHT_TEST_SCHEDULE';

// schedules.day_of_week hanya menerima enam hari kerja; Ahad tidak ada.
const NAMA_HARI = ['AHAD', 'SENIN', 'SELASA', 'RABU', 'KAMIS', 'JUMAT', 'SABTU'];

/** Nama hari ini menurut UTC — sama dengan yang dipakai runner CI. */
export function hariIniUtc() {
  return NAMA_HARI[new Date().getUTCDay()];
}

async function api(path, { token, method = 'GET', body, prefer } = {}) {
  const res = await fetch(SUPABASE_URL + path, {
    method,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: 'Bearer ' + (token || SUPABASE_KEY),
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const teks = await res.text();
  if (!res.ok) {
    throw new Error(`${method} ${path} → ${res.status}: ${teks.slice(0, 300)}`);
  }
  return teks ? JSON.parse(teks) : null;
}

/** Access token guru uji, dari kredensial environment. */
export async function tokenGuru() {
  const data = await api('/auth/v1/token?grant_type=password', {
    method: 'POST',
    body: {
      email:    process.env.TEST_GURU_EMAIL,
      password: process.env.TEST_GURU_PASSWORD,
    },
  });
  return data.access_token;
}

/** Kelas uji, dikenali lewat kode kelas dari environment. */
export async function kelasUji(token) {
  const kode = encodeURIComponent(process.env.TEST_KODE_KELAS);
  const rows = await api(
    `/rest/v1/classrooms?classroom_code=eq.${kode}&select=id,teacher_id,name`,
    { token });
  if (!rows.length) throw new Error('Kelas dengan kode itu tidak ditemukan: ' + process.env.TEST_KODE_KELAS);
  return rows[0];
}

/** Buang semua jadwal bertanda uji di kelas ini — termasuk sisa run sebelumnya. */
export async function bersihkanJadwalUji(token, classroomId) {
  await api(
    `/rest/v1/schedules?classroom_id=eq.${classroomId}&note=eq.${PENANDA_JADWAL}`,
    { token, method: 'DELETE' });
}

/**
 * Jadwal sepanjang hari untuk hari ini (UTC), supaya sesinya selalu berstatus
 * AKTIF kapan pun CI berjalan. Mengembalikan id-nya agar test dapat menyasar
 * sesi ini saja lewat .abs-session[data-schedule-id], bukan jadwal nyata milik
 * guru yang kebetulan ada di hari yang sama.
 */
export async function buatJadwalHariIni(token, kelas) {
  const rows = await api('/rest/v1/schedules', {
    token,
    method: 'POST',
    prefer: 'return=representation',
    body: {
      classroom_id: kelas.id,
      teacher_id:   kelas.teacher_id,
      day_of_week:  hariIniUtc(),
      start_time:   '00:00:00',
      end_time:     '23:59:00',
      is_active:    true,
      note:         PENANDA_JADWAL,
    },
  });
  return rows[0].id;
}
